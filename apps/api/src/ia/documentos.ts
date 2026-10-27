import { normalizarCar, type ResultadoConsulta, type ResultadoItem } from '@apto/regras';
import { expressaoProibida, numerosPermitidos, numeroInventado, PROIBIDAS_SEMPRE, semDadosPessoais, temDadoPessoal } from './comum.js';
import type { ExecutorIA, MotivoSemIA } from './executor.js';

/**
 * Conferência de um documento do dossiê (ASV, PRAD, TAC, termo de embargo, licença…) com o
 * que a consulta encontrou (docs/ia.md). A IA lê o documento e aponta o que confere, o que
 * diverge e o que o técnico precisa olhar; quem conclui é o técnico. O arquivo não fica
 * guardado: só os campos lidos e os pontos. Nomes de pessoas, CPF e CNPJ não são copiados.
 */
export interface PontoConferencia {
  texto: string;
  situacao: 'confere' | 'diverge' | 'conferir';
}

export interface DocumentoConferido {
  id?: string;
  regraId: string;
  nomeArquivo: string;
  tipoDocumento: string;
  orgao: string | null;
  numero: string | null;
  /** DD/MM/AAAA, como está no documento. */
  dataEmissao: string | null;
  validade: string | null;
  areaHa: number | null;
  /** Qual documento da lista da saída este parece ser (o texto do requisito), se algum. */
  requisito: string | null;
  /** O documento cita o CAR deste imóvel? Conferido aqui, sem IA, quando o código aparece. */
  car: 'este' | 'outro' | 'nao_encontrado';
  pontos: PontoConferencia[];
  /** Lido de texto (PDF digital) ou de imagem (escaneado ou foto): na imagem, os números não dá para conferir aqui. */
  lidoDe: 'texto' | 'imagem';
  modelo: string;
  geradoEm: string;
}

export type ResultadoConferencia = { ok: true; documento: DocumentoConferido } | { ok: false; motivo: MotivoSemIA };

export const TAMANHO_MAXIMO_DOCUMENTO = 60_000;
export const MAXIMO_IMAGENS = 4;

const INSTRUCOES = `Você ajuda um técnico agrícola a conferir um documento que ele vai juntar ao dossiê de crédito rural de um imóvel. Você recebe o que a pré-checagem encontrou no imóvel (o item, os detalhes, as saídas que a norma admite e os documentos que cada saída pede) e o documento (texto ou imagens).
Regras obrigatórias:
1. Leia só o que está no documento. Campo que não aparece = null. Não deduza nem calcule.
2. Não copie nomes de pessoas, CPF nem CNPJ. Nome de órgão pode (ex.: Ibama, Sema-MT).
3. tipo_documento: o nome do documento como está escrito (ex.: "Autorização de Supressão de Vegetação").
4. requisito: o texto EXATO de um dos documentos pedidos nas saídas que este documento parece atender, ou null.
5. car_citado: o código do CAR que aparece no documento, se aparecer.
6. pontos: de 1 a 6 observações curtas comparando o documento com o que foi encontrado (datas, área, órgão, validade, se o documento cobre o que a saída pede). situacao "confere" (bate), "diverge" (não bate) ou "conferir" (o técnico precisa olhar). Não prometa aprovação; quem decide é o banco.`;

const nulo = (tipo: string) => ({ type: [tipo, 'null'] });
const ESQUEMA = {
  nome: 'documento_dossie',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['tipo_documento', 'orgao', 'numero', 'data_emissao', 'validade', 'area_ha', 'requisito', 'car_citado', 'pontos'],
    properties: {
      tipo_documento: { type: 'string' },
      orgao: nulo('string'),
      numero: nulo('string'),
      data_emissao: nulo('string'),
      validade: nulo('string'),
      area_ha: nulo('number'),
      requisito: nulo('string'),
      car_citado: nulo('string'),
      pontos: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['texto', 'situacao'],
          properties: { texto: { type: 'string' }, situacao: { type: 'string', enum: ['confere', 'diverge', 'conferir'] } },
        },
      },
    },
  },
};

interface SaidaDocumento {
  tipo_documento: string;
  orgao: string | null;
  numero: string | null;
  data_emissao: string | null;
  validade: string | null;
  area_ha: number | null;
  requisito: string | null;
  car_citado: string | null;
  pontos: PontoConferencia[];
}

/** O que a consulta encontrou no item, para a IA comparar. */
export function fatosDoItem(r: ResultadoConsulta, item: ResultadoItem) {
  return {
    data_da_consulta: r.dataReferencia.split('-').reverse().join('/'),
    item: item.titulo,
    o_que_foi_encontrado: semDadosPessoais(item.resumo, 600),
    detalhes: item.detalhes.slice(0, 8).map((d) => semDadosPessoais(d, 400)),
    saidas: item.caminhos.map((c) => ({ saida: c.titulo, documentos_pedidos: c.requisitos ?? [] })),
  };
}

const requisitosDo = (item: ResultadoItem) => item.caminhos.flatMap((c) => c.requisitos ?? []);

export function conferirSaida(
  saida: unknown,
  item: ResultadoItem,
  fatos: object,
  textoDocumento: string | null,
): { ok: true; valor: SaidaDocumento } | { ok: false; motivo: string } {
  const o = saida as SaidaDocumento;
  if (!o || typeof o.tipo_documento !== 'string' || !Array.isArray(o.pontos)) return { ok: false, motivo: 'sem resposta' };
  if (!o.tipo_documento.trim() || o.tipo_documento.length > 140) return { ok: false, motivo: 'tipo de documento estranho' };
  if (o.pontos.length < 1 || o.pontos.length > 6) return { ok: false, motivo: 'número de pontos fora do esperado' };
  if (o.requisito != null && !requisitosDo(item).includes(o.requisito)) return { ok: false, motivo: 'requisito que não está na lista' };
  const textos = [o.tipo_documento, o.orgao, o.numero, ...o.pontos.map((p) => p.texto)].filter((x): x is string => typeof x === 'string');
  if (textos.some((t) => t.length > 400)) return { ok: false, motivo: 'texto longo demais' };
  const tudo = textos.join(' ');
  if (temDadoPessoal(tudo)) return { ok: false, motivo: 'dado pessoal' };
  const proibida = expressaoProibida(tudo, PROIBIDAS_SEMPRE);
  if (proibida) return { ok: false, motivo: `expressão proibida ("${proibida}")` };
  // Documento em texto: todo número precisa estar no documento ou nos fatos. Na imagem não dá
  // para conferir aqui, e a tela avisa que os números devem ser conferidos no papel.
  if (textoDocumento != null) {
    const permitidos = numerosPermitidos(`${textoDocumento} ${JSON.stringify(fatos)}`);
    const comNumeros = [tudo, o.data_emissao ?? '', o.validade ?? '', o.area_ha == null ? '' : String(o.area_ha).replace('.', ',')].join(' ');
    const inventado = numeroInventado(comNumeros, permitidos, 6);
    if (inventado) return { ok: false, motivo: `número que não está no documento (${inventado})` };
  }
  return { ok: true, valor: o };
}

/** Procura o código do CAR no texto, sem IA. */
function carNoTexto(texto: string): string | null {
  for (const m of texto.replace(/\s+/g, ' ').matchAll(/\b[A-Z]{2}\s?-\s?\d{7}\s?-\s?(?:[0-9A-F]{4}\.?\s?){7}[0-9A-F]{4}(?![0-9A-F])/gi)) {
    const car = normalizarCar(m[0].replace(/\s/g, ''));
    if (car) return car;
  }
  return null;
}

/**
 * Confere um documento. Texto (PDF digital) é o caminho preferido: vai sem CPF, CNPJ e
 * e-mail. Imagem (escaneado ou foto) vai como está, então a tela pede o consentimento.
 */
export async function conferirDocumento(
  executor: ExecutorIA,
  r: ResultadoConsulta,
  item: ResultadoItem,
  entrada: { nomeArquivo: string; texto?: string; imagens?: string[] },
): Promise<ResultadoConferencia> {
  const fatos = fatosDoItem(r, item);
  const texto = entrada.texto ? semDadosPessoais(entrada.texto, TAMANHO_MAXIMO_DOCUMENTO) : null;
  const imagens = texto ? undefined : entrada.imagens?.slice(0, MAXIMO_IMAGENS);
  const resposta = await executor.rodar({
    tarefa: 'documento',
    instrucoes: INSTRUCOES,
    entrada: JSON.stringify({ o_que_a_consulta_encontrou: fatos, documento: texto ?? '(o documento vai nas imagens)' }),
    imagens,
    esquema: ESQUEMA,
    maxTokens: 3000,
    conferir: (json) => conferirSaida(json, item, fatos, texto),
  });
  if (!resposta.ok) return { ok: false, motivo: resposta.motivo };
  const v = resposta.valor;
  // O CAR: no texto, procurado aqui (o texto foi para a IA sem ele); na imagem, o que a IA leu.
  const citado = entrada.texto ? carNoTexto(entrada.texto) : v.car_citado ? normalizarCar(v.car_citado.replace(/\s/g, '')) : null;
  return {
    ok: true,
    documento: {
      regraId: item.regraId,
      nomeArquivo: entrada.nomeArquivo.slice(0, 120),
      tipoDocumento: v.tipo_documento.trim(),
      orgao: v.orgao,
      numero: v.numero,
      dataEmissao: v.data_emissao,
      validade: v.validade,
      areaHa: v.area_ha,
      requisito: v.requisito,
      car: citado == null ? 'nao_encontrado' : citado === r.car ? 'este' : 'outro',
      pontos: v.pontos.map((p) => ({ texto: p.texto.trim(), situacao: p.situacao })),
      lidoDe: texto ? 'texto' : 'imagem',
      modelo: resposta.modelo,
      geradoEm: new Date().toISOString(),
    },
  };
}
