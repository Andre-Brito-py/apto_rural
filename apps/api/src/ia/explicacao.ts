import type { ResultadoConsulta, ResultadoItem, Status, Veredito } from '@apto/regras';
import type { Configuracoes } from '../configuracoes.js';
import { ErroIA, type ProvedorIA } from './provedor.js';
import type { Segredos } from './segredos.js';
import type { UsoIA } from './uso.js';

/**
 * Explicação do resultado em linguagem simples para o produtor (docs/ia.md).
 *
 * A IA NÃO decide nada: recebe só o que o motor de regras já decidiu e reescreve em
 * português simples. Depois, a conferência abaixo barra o texto que mudar a situação,
 * prometer aprovação ou trouxer número que não estava no resultado. Sem IA (desligada,
 * sem chave, fora do ar, limite do dia ou texto barrado), vale a explicação montada por
 * modelo fixo, que sai direto das regras.
 */
export interface Explicacao {
  texto: string;
  origem: 'ia' | 'modelo';
  modelo?: string;
  geradaEm: string;
}

export type MotivoSemIA = 'desligada' | 'sem_chave' | 'limite_diario' | 'falha' | 'barrada';

export interface RespostaExplicacao {
  explicacao: Explicacao;
  /** Só a explicação da IA é guardada: a de modelo sai igual toda vez, de graça. */
  guardar: boolean;
  motivo?: MotivoSemIA;
}

const ROTULO_VEREDITO: Record<Veredito, string> = {
  impedimento: 'impedimento provável',
  atencao: 'atenção antes da proposta',
  sem_impedimento: 'nenhum impedimento encontrado',
  incompleto: 'checagem incompleta',
};

const ROTULO_STATUS: Record<Status, string> = {
  impedimento: 'impedimento',
  atencao: 'atenção',
  nao_verificado: 'não verificado',
  sem_impedimento: 'ok',
};

const PESO: Record<Status, number> = { impedimento: 0, atencao: 1, nao_verificado: 2, sem_impedimento: 3 };

// ---------------------------------------------------------------------------
// 1. O que vai para a IA: só o que as regras decidiram, sem dado pessoal.
// ---------------------------------------------------------------------------

const PADROES_PESSOAIS: RegExp[] = [
  /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, // CPF
  /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, // CNPJ
  /\b[A-Z]{2}-?\d{7}-?(?:[0-9A-F]{4}\.?){7}[0-9A-F]{4}\b/gi, // código do CAR
  /[^\s@]+@[^\s@]+\.[^\s@]+/g, // e-mail
];

/** Tira CPF, CNPJ, código do CAR e e-mail de um texto (ex.: descrição de embargo do Ibama). */
export function semDadosPessoais(texto: string): string {
  return PADROES_PESSOAIS.reduce((t, p) => t.replace(p, '[omitido]'), texto).slice(0, 400);
}

/** Fatos da consulta para a IA. Itens sem problema vão só com o nome, para gastar menos. */
export function fatosDaConsulta(r: ResultadoConsulta) {
  const itens = [...r.itens].sort((a, b) => PESO[a.status] - PESO[b.status]);
  return {
    situacao: r.veredito,
    situacao_em_palavras: ROTULO_VEREDITO[r.veredito],
    itens: itens.map((i) =>
      i.status === 'sem_impedimento'
        ? { item: i.titulo, resultado: ROTULO_STATUS[i.status] }
        : {
            item: i.titulo,
            resultado: ROTULO_STATUS[i.status],
            o_que_foi_encontrado: semDadosPessoais(i.resumo),
            detalhes: i.detalhes.slice(0, 6).map(semDadosPessoais),
            saidas_que_a_norma_admite: i.caminhos.map((c) => c.titulo),
          },
    ),
  };
}

export const INSTRUCOES = `Você explica a um produtor rural, em português do Brasil simples, o resultado de uma pré-checagem de crédito rural (Manual de Crédito Rural, capítulo 2, seção 9). Quem decidiu o resultado foram regras oficiais: você só explica.

Regras obrigatórias:
1. Use SOMENTE os fatos recebidos. Não invente item, número, data, nome, órgão ou lei.
2. No campo "situacao", repita exatamente o valor de "situacao" recebido. Nunca mude a situação.
3. Não prometa aprovação e não diga que está tudo certo quando houver impedimento ou atenção. Não use as palavras "aprovado", "garantido", "com certeza" nem "não se preocupe". A decisão final é sempre do banco.
4. Comece dizendo a situação geral. Depois diga o que pesa e o que dá para fazer, usando as "saidas_que_a_norma_admite". Se houver item "não verificado", diga que ele ainda não foi conferido.
5. Escreva de 4 a 8 frases curtas, tratando o produtor por "você". Sem listas, sem títulos, sem negrito, sem siglas sem explicar.
6. Não escreva código do CAR, CPF, CNPJ nem nome de pessoa.`;

const ESQUEMA = {
  nome: 'explicacao_produtor',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['situacao', 'texto'],
    properties: {
      situacao: { type: 'string', enum: ['impedimento', 'atencao', 'sem_impedimento', 'incompleto'] },
      texto: { type: 'string' },
    },
  },
};

// ---------------------------------------------------------------------------
// 2. Conferência do texto que a IA devolveu.
// ---------------------------------------------------------------------------

const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

const PROIBIDAS_SEMPRE = ['garantid', 'aprovad', 'com certeza', 'pode ficar tranquilo', 'sem nenhum risco', 'nao se preocupe'];
const PROIBIDAS_COM_PROBLEMA = ['nenhum impedimento', 'tudo certo', 'esta liberad', 'pode pegar o credito', 'sem problemas'];

/** Números do texto (só os dígitos: "4,43" e "4.43" viram "443"). */
const numeros = (s: string) => [...s.matchAll(/\d+(?:[.,/]\d+)*/g)].map((m) => m[0].replace(/\D/g, ''));

export function conferirExplicacao(saida: unknown, r: ResultadoConsulta): { ok: true; texto: string } | { ok: false; motivo: string } {
  const o = saida as { situacao?: unknown; texto?: unknown };
  if (typeof o?.texto !== 'string') return { ok: false, motivo: 'sem texto' };
  const texto = o.texto.trim().replace(/\s+/g, ' ');
  if (o.situacao !== r.veredito) return { ok: false, motivo: `situação trocada (${String(o.situacao)} em vez de ${r.veredito})` };
  if (texto.length < 120 || texto.length > 1600) return { ok: false, motivo: `tamanho fora do esperado (${texto.length})` };
  if (/[*#_`]|^\s*[-•]/m.test(o.texto)) return { ok: false, motivo: 'formatação (lista ou negrito)' };
  const t = normalizar(texto);
  const proibida = [...PROIBIDAS_SEMPRE, ...(r.veredito === 'sem_impedimento' ? [] : PROIBIDAS_COM_PROBLEMA)].find((p) => t.includes(p));
  if (proibida) return { ok: false, motivo: `expressão proibida ("${proibida}")` };
  if (PADROES_PESSOAIS.some((p) => new RegExp(p.source, p.flags.replace('g', '')).test(texto))) return { ok: false, motivo: 'dado pessoal no texto' };
  // Todo número do texto precisa estar nos fatos (ou ser uma contagem pequena de itens).
  const permitidos = new Set(numeros(JSON.stringify(fatosDaConsulta(r))));
  const inventado = numeros(texto).find((n) => !permitidos.has(n) && !(Number(n) >= 1 && Number(n) <= r.itens.length));
  if (inventado) return { ok: false, motivo: `número que não está no resultado (${inventado})` };
  return { ok: true, texto };
}

// ---------------------------------------------------------------------------
// 3. Explicação de modelo fixo (sem IA), sempre correta porque sai das regras.
// ---------------------------------------------------------------------------

function lista(nomes: string[]): string {
  const n = nomes.map((x) => x.charAt(0).toLowerCase() + x.slice(1));
  return n.length <= 1 ? (n[0] ?? '') : `${n.slice(0, -1).join(', ')} e ${n.at(-1)}`;
}

function saidas(itens: ResultadoItem[]): string {
  const com = itens.filter((i) => i.caminhos.length > 0);
  if (com.length === 0) return '';
  return ` A própria norma prevê saídas: ${com
    .map((i) => `em ${i.titulo.charAt(0).toLowerCase() + i.titulo.slice(1)}, ${lista(i.caminhos.slice(0, 2).map((c) => c.titulo))}`)
    .join('; ')}.`;
}

export function explicacaoDeModelo(r: ResultadoConsulta): string {
  const de = (s: Status) => r.itens.filter((i) => i.status === s);
  const impedimentos = de('impedimento');
  const atencoes = de('atencao');
  const naoVerificados = de('nao_verificado');
  const faltou = naoVerificados.length
    ? ` Ainda não deu para conferir ${lista(naoVerificados.map((i) => i.titulo))}: vale completar os dados com o técnico.`
    : '';
  const banco = ' Esta é uma pré-checagem com as bases oficiais; a decisão final é sempre do banco.';
  switch (r.veredito) {
    case 'impedimento':
      return (
        `Hoje, pelas bases oficiais, o imóvel tem impedimento para o crédito rural em ${lista(impedimentos.map((i) => i.titulo))}.` +
        saidas(impedimentos) +
        (atencoes.length ? ` Também há pontos de atenção em ${lista(atencoes.map((i) => i.titulo))}.` : '') +
        faltou +
        ' O técnico pode montar com você os documentos para cada saída.' +
        banco
      );
    case 'atencao':
      return (
        `Hoje nada impede o crédito, mas há pontos que podem travar a análise do banco: ${lista(atencoes.map((i) => i.titulo))}.` +
        saidas(atencoes) +
        faltou +
        ' Vale resolver antes de montar a proposta.' +
        banco
      );
    case 'incompleto':
      return (
        `Nada foi encontrado contra o imóvel nas bases que conseguimos consultar, mas a checagem ficou incompleta.${faltou}` +
        ' Com esses dados, a checagem fica completa.' +
        banco
      );
    default:
      return (
        'Nas bases oficiais consultadas, o imóvel não tem nenhum impedimento socioambiental para o crédito rural: embargos, terras indígenas, unidades de conservação e as demais regras do manual deram resultado positivo.' +
        banco
      );
  }
}

// ---------------------------------------------------------------------------
// 4. O serviço.
// ---------------------------------------------------------------------------

const agora = () => new Date().toISOString();
const deModelo = (r: ResultadoConsulta, motivo: MotivoSemIA): RespostaExplicacao => ({
  explicacao: { texto: explicacaoDeModelo(r), origem: 'modelo', geradaEm: agora() },
  guardar: false,
  motivo,
});

export interface DependenciasIA {
  config: Configuracoes;
  segredos: Segredos;
  uso: UsoIA;
  /** Cria o cliente com a chave do painel (nos testes e no ensaio, um falso). */
  provedor: (chave: string) => ProvedorIA;
}

export class ServicoExplicacao {
  constructor(private d: DependenciasIA) {}

  async explicar(r: ResultadoConsulta): Promise<RespostaExplicacao> {
    const ia = (await this.d.config.obter()).ia;
    if (!ia.ativo) return deModelo(r, 'desligada');
    const chave = await this.d.segredos.obter('openai_api_key');
    if (!chave) return deModelo(r, 'sem_chave');
    if ((await this.d.uso.hoje()) >= ia.limiteDiario) return deModelo(r, 'limite_diario');

    try {
      const resposta = await this.d.provedor(chave).gerar({
        modelo: ia.modelo,
        instrucoes: INSTRUCOES,
        entrada: JSON.stringify(fatosDaConsulta(r)),
        esquema: ESQUEMA,
        maxTokens: 1200,
      });
      const conferida = conferirExplicacao(resposta.json, r);
      await this.d.uso.registrar({
        modelo: ia.modelo,
        tokensEntrada: resposta.tokensEntrada,
        tokensSaida: resposta.tokensSaida,
        resultado: conferida.ok ? 'ok' : 'rejeitado',
      });
      if (!conferida.ok) {
        console.warn(`Explicação da IA barrada: ${conferida.motivo}`);
        return deModelo(r, 'barrada');
      }
      return { explicacao: { texto: conferida.texto, origem: 'ia', modelo: ia.modelo, geradaEm: agora() }, guardar: true };
    } catch (e) {
      await this.d.uso.registrar({ modelo: ia.modelo, tokensEntrada: 0, tokensSaida: 0, resultado: 'erro' });
      console.warn(`Explicação da IA falhou: ${e instanceof ErroIA ? e.message : 'erro inesperado'}`);
      return deModelo(r, 'falha');
    }
  }

  /** Botão "Testar a chave" do painel: uma chamada pequena com um resultado fictício. */
  async testar(): Promise<{ ok: boolean; mensagem: string; ms?: number }> {
    const ia = (await this.d.config.obter()).ia;
    const chave = await this.d.segredos.obter('openai_api_key');
    if (!chave) return { ok: false, mensagem: 'Nenhuma chave cadastrada.' };
    const inicio = Date.now();
    try {
      const resposta = await this.d.provedor(chave).gerar({
        modelo: ia.modelo,
        instrucoes: INSTRUCOES,
        entrada: JSON.stringify(fatosDaConsulta(RESULTADO_DE_TESTE)),
        esquema: ESQUEMA,
        maxTokens: 1200,
      });
      const conferida = conferirExplicacao(resposta.json, RESULTADO_DE_TESTE);
      await this.d.uso.registrar({
        modelo: ia.modelo,
        tokensEntrada: resposta.tokensEntrada,
        tokensSaida: resposta.tokensSaida,
        resultado: conferida.ok ? 'ok' : 'rejeitado',
      });
      const ms = Date.now() - inicio;
      return conferida.ok
        ? { ok: true, mensagem: `A chave funciona com o modelo ${ia.modelo}. Exemplo: "${conferida.texto.slice(0, 220)}…"`, ms }
        : { ok: false, mensagem: `A chave funciona, mas o texto de teste foi barrado pela conferência (${conferida.motivo}). Tente outro modelo.`, ms };
    } catch (e) {
      await this.d.uso.registrar({ modelo: ia.modelo, tokensEntrada: 0, tokensSaida: 0, resultado: 'erro' });
      return { ok: false, mensagem: e instanceof ErroIA ? e.message : 'Erro inesperado ao chamar a OpenAI.' };
    }
  }
}

/** Resultado fictício para o teste da chave (não é de nenhum imóvel). */
const RESULTADO_DE_TESTE: ResultadoConsulta = {
  car: 'teste',
  dataReferencia: '2026-10-26',
  veredito: 'atencao',
  atualizacoes: {},
  avisos: [],
  itens: [
    {
      regraId: 'embargo',
      titulo: 'Embargos ambientais',
      status: 'atencao',
      resumo: 'Polígono embargado encosta na divisa do imóvel.',
      detalhes: ['Sobreposição muito pequena, típica de imprecisão no desenho do CAR.'],
      caminhos: [{ titulo: 'Corrigir o desenho do CAR', descricao: '' }],
      normas: [],
      fontes: [],
      dossie: 'contestacao',
    },
    {
      regraId: 'car',
      titulo: 'Cadastro Ambiental Rural',
      status: 'sem_impedimento',
      resumo: 'CAR ativo.',
      detalhes: [],
      caminhos: [],
      normas: [],
      fontes: [],
      dossie: null,
    },
  ],
};
