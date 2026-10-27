import { formatarCar, type ResultadoConsulta, type ResultadoItem } from '@apto/regras';
import { expressaoProibida, numeroInventado, numerosPermitidos, PROIBIDAS_SEMPRE, semDadosPessoais, temDadoPessoal } from './comum.js';
import type { ExecutorIA, MotivoSemIA } from './executor.js';
import type { DocumentoConferido } from './documentos.js';

/**
 * Rascunhos para o técnico revisar e assinar (docs/ia.md): carta ao banco, pedido de
 * correção do desenho do CAR e requerimento ao órgão. A IA escreve a partir do que as
 * regras encontraram e dos documentos conferidos; sem IA, sai um modelo fixo, montado
 * das mesmas informações. Nenhum rascunho promete resultado. Os dados da pessoa ficam
 * entre colchetes para o técnico preencher; o código do CAR entra depois, aqui.
 */
export type TipoRascunho = 'carta_banco' | 'retificacao_car' | 'requerimento_orgao';

export const NOME_RASCUNHO: Record<TipoRascunho, string> = {
  carta_banco: 'Carta ao banco',
  retificacao_car: 'Pedido de correção do desenho do CAR',
  requerimento_orgao: 'Requerimento ao órgão responsável',
};

/** Regras cujo resultado vem de sobrepor o desenho do imóvel a um mapa oficial. */
const REGRAS_DE_MAPA = ['embargo', 'terra-indigena', 'unidade-conservacao', 'floresta-publica'];

/** A quem vai o requerimento, por regra. */
const ORGAO: Record<string, string> = {
  embargo: 'Instituto Brasileiro do Meio Ambiente e dos Recursos Naturais Renováveis (Ibama)',
  prodes: 'órgão estadual de meio ambiente responsável pela autorização de supressão de vegetação',
  car: 'órgão estadual de meio ambiente responsável pela análise do CAR',
};

/** Que rascunhos fazem sentido para o item. */
export function tiposPara(item: ResultadoItem): TipoRascunho[] {
  if (item.status !== 'impedimento' && item.status !== 'atencao') return [];
  const tipos: TipoRascunho[] = ['carta_banco'];
  if (item.dossie === 'contestacao' && REGRAS_DE_MAPA.includes(item.regraId)) tipos.push('retificacao_car');
  if (ORGAO[item.regraId]) tipos.push('requerimento_orgao');
  return tipos;
}

export interface Rascunho {
  tipo: TipoRascunho;
  titulo: string;
  texto: string;
  origem: 'ia' | 'modelo';
  modelo?: string;
  geradoEm: string;
  motivoSemIA?: MotivoSemIA;
}

export const MARCA_CAR = '[CÓDIGO DO CAR]';

/** Fatos para o rascunho: o item, as normas, as saídas e os documentos já conferidos (sem dado pessoal). */
export function fatosDoRascunho(r: ResultadoConsulta, item: ResultadoItem, tipo: TipoRascunho, documentos: DocumentoConferido[]) {
  return {
    tipo_de_documento: NOME_RASCUNHO[tipo],
    destinatario:
      tipo === 'carta_banco'
        ? 'gerente da instituição financeira que analisa a proposta de crédito rural'
        : tipo === 'retificacao_car'
          ? 'órgão estadual de meio ambiente responsável pelo CAR'
          : (ORGAO[item.regraId] ?? 'órgão responsável'),
    codigo_do_car: MARCA_CAR,
    data_da_consulta: r.dataReferencia.split('-').reverse().join('/'),
    item: item.titulo,
    situacao: item.status === 'impedimento' ? 'impedimento' : 'atenção',
    o_que_foi_encontrado: semDadosPessoais(item.resumo, 600),
    detalhes: item.detalhes.slice(0, 8).map((d) => semDadosPessoais(d, 400)),
    normas: item.normas.map((n) => `${n.item} (${n.ato})`),
    saidas_que_a_norma_admite: item.caminhos.map((c) => ({ saida: c.titulo, descricao: semDadosPessoais(c.descricao, 400), documentos: c.requisitos ?? [] })),
    documentos_ja_conferidos: documentos.map((d) => ({
      documento: d.tipoDocumento,
      orgao: d.orgao,
      numero: d.numero,
      data: d.dataEmissao,
      area_ha: d.areaHa,
    })),
  };
}

const INSTRUCOES = `Você escreve o RASCUNHO de um documento para um técnico agrícola revisar, completar e assinar, em português do Brasil formal e claro.
Regras obrigatórias:
1. Use SOMENTE os fatos recebidos. Não invente número, data, área, nome, órgão, documento nem lei.
2. Onde faltar dado da pessoa ou do imóvel, deixe um campo entre colchetes para o técnico preencher: [NOME DO PRODUTOR], [CPF OU CNPJ], [NOME DO IMÓVEL], [MUNICÍPIO/UF], [NOME DO RESPONSÁVEL TÉCNICO], [REGISTRO PROFISSIONAL], [DATA]. Para o código do CAR, escreva exatamente "${MARCA_CAR}".
3. Não prometa resultado nem diga que o pedido será atendido. Não use "aprovado", "garantido" nem "com certeza". Peça a análise; quem decide é o destinatário.
4. Cite as normas recebidas quando ajudarem. Se houver documentos já conferidos, cite-os como anexos.
5. Estrutura: local e data, destinatário, assunto, texto em parágrafos curtos, pedido, fecho e assinatura. Sem Markdown (sem asteriscos, cerquilhas ou listas com traço); parágrafos separados por linha em branco.
6. Entre 150 e 600 palavras.`;

const ESQUEMA = {
  nome: 'rascunho',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['titulo', 'texto'],
    properties: { titulo: { type: 'string' }, texto: { type: 'string' } },
  },
};

export function conferirRascunho(saida: unknown, fatos: object): { ok: true; valor: { titulo: string; texto: string } } | { ok: false; motivo: string } {
  const o = saida as { titulo?: unknown; texto?: unknown };
  if (typeof o?.texto !== 'string' || typeof o.titulo !== 'string') return { ok: false, motivo: 'sem texto' };
  const texto = o.texto.trim().replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n');
  const titulo = o.titulo.trim().slice(0, 140);
  if (texto.length < 600 || texto.length > 6000) return { ok: false, motivo: `tamanho fora do esperado (${texto.length})` };
  if (/[*#`]|^\s*[-•]\s/m.test(texto)) return { ok: false, motivo: 'formatação' };
  const proibida = expressaoProibida(`${titulo} ${texto}`, [...PROIBIDAS_SEMPRE, 'sera atendid', 'sera deferid', 'com toda certeza']);
  if (proibida) return { ok: false, motivo: `expressão proibida ("${proibida}")` };
  if (temDadoPessoal(texto)) return { ok: false, motivo: 'dado pessoal' };
  // Números só dos fatos; os campos entre colchetes ficam de fora da conta.
  const inventado = numeroInventado(texto.replace(/\[[^\]]*\]/g, ''), numerosPermitidos(JSON.stringify(fatos)), 10);
  if (inventado) return { ok: false, motivo: `número que não está nos fatos (${inventado})` };
  return { ok: true, valor: { titulo, texto } };
}

// ---------------------------------------------------------------------------
// Modelos fixos (sem IA), montados das mesmas informações.
// ---------------------------------------------------------------------------

const lista = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} e ${xs.at(-1)}`);

export function rascunhoDeModelo(r: ResultadoConsulta, item: ResultadoItem, tipo: TipoRascunho, documentos: DocumentoConferido[]): { titulo: string; texto: string } {
  const f = fatosDoRascunho(r, item, tipo, documentos);
  const normas = f.normas.length ? ` (${lista(f.normas)})` : '';
  const anexos = documentos.length
    ? `\n\nSeguem anexos: ${lista(documentos.map((d) => [d.tipoDocumento, d.numero ? `nº ${d.numero}` : '', d.orgao ? `(${d.orgao})` : ''].filter(Boolean).join(' ')))}.`
    : '\n\nSeguem anexos: [LISTA DOS DOCUMENTOS ANEXADOS].';
  const encontrado = [f.o_que_foi_encontrado, ...f.detalhes].join(' ');
  const saidas = f.saidas_que_a_norma_admite.map((s) => s.saida);
  const assinatura = '\n\nAtenciosamente,\n\n[NOME DO RESPONSÁVEL TÉCNICO]\n[REGISTRO PROFISSIONAL]\n\n[NOME DO PRODUTOR]\n[CPF OU CNPJ]';
  const abertura = `[MUNICÍPIO/UF], [DATA].\n\nAo(À) ${f.destinatario}`;
  if (tipo === 'carta_banco') {
    return {
      titulo: `Carta ao banco: ${item.titulo}`,
      texto:
        `${abertura}\n\nAssunto: proposta de crédito rural do imóvel [NOME DO IMÓVEL], CAR ${MARCA_CAR}: ${item.titulo.toLowerCase()}` +
        `\n\nPrezado(a) gerente,\n\nNa pré-checagem feita em ${f.data_da_consulta} com as bases oficiais, o item "${item.titulo}" do Manual de Crédito Rural${normas} apareceu como ${f.situacao}. ${encontrado}` +
        (saidas.length
          ? `\n\nA própria norma admite as seguintes saídas para este caso: ${lista(saidas)}. Por isso, apresentamos a documentação correspondente e pedimos que ela seja considerada na análise da proposta.`
          : '\n\nPedimos que a situação seja considerada na análise da proposta, com a documentação anexa.') +
        `${anexos}\n\nFicamos à disposição para os esclarecimentos que forem necessários.${assinatura}`,
    };
  }
  if (tipo === 'retificacao_car') {
    return {
      titulo: `Pedido de correção do desenho do CAR: ${item.titulo}`,
      texto:
        `${abertura}\n\nAssunto: pedido de retificação do perímetro do imóvel no CAR ${MARCA_CAR}` +
        `\n\n[NOME DO PRODUTOR], inscrito(a) no [CPF OU CNPJ], proprietário(a) ou possuidor(a) do imóvel [NOME DO IMÓVEL], em [MUNICÍPIO/UF], vem requerer a análise e a retificação do perímetro declarado no Cadastro Ambiental Rural.` +
        `\n\nNa conferência com as bases oficiais em ${f.data_da_consulta}, o desenho do imóvel apresentou sobreposição no item "${item.titulo}". ${encontrado} A sobreposição indicada pode decorrer de imprecisão no desenho do perímetro, o que se pede que seja verificado com base no levantamento anexo.` +
        `${anexos}\n\nPede deferimento da análise.${assinatura}`,
    };
  }
  return {
    titulo: `Requerimento: ${item.titulo}`,
    texto:
      `${abertura}\n\nAssunto: requerimento referente ao imóvel [NOME DO IMÓVEL], CAR ${MARCA_CAR}: ${item.titulo.toLowerCase()}` +
      `\n\n[NOME DO PRODUTOR], inscrito(a) no [CPF OU CNPJ], vem requerer a análise da situação do imóvel [NOME DO IMÓVEL], em [MUNICÍPIO/UF], no que se refere a ${item.titulo.toLowerCase()}.` +
      `\n\nEm consulta às bases oficiais em ${f.data_da_consulta}, constou: ${encontrado}` +
      (saidas.length ? `\n\nO Manual de Crédito Rural${normas} admite, para este caso: ${lista(saidas)}. Pede-se a manifestação do órgão sobre a documentação apresentada.` : '') +
      `${anexos}\n\nPede deferimento da análise.${assinatura}`,
  };
}

/** O rascunho do item: pela IA, se ligada e aprovada na conferência; senão, o modelo fixo. */
export async function gerarRascunho(
  executor: ExecutorIA,
  r: ResultadoConsulta,
  item: ResultadoItem,
  tipo: TipoRascunho,
  documentos: DocumentoConferido[],
): Promise<Rascunho> {
  const fatos = fatosDoRascunho(r, item, tipo, documentos);
  const car = formatarCar(r.car);
  const comCar = (t: string) => t.replaceAll(MARCA_CAR, car);
  const resposta = await executor.rodar({
    tarefa: 'rascunho',
    instrucoes: INSTRUCOES,
    entrada: JSON.stringify(fatos),
    esquema: ESQUEMA,
    maxTokens: 4000,
    conferir: (json) => conferirRascunho(json, fatos),
  });
  const agora = new Date().toISOString();
  if (resposta.ok) {
    return { tipo, titulo: resposta.valor.titulo, texto: comCar(resposta.valor.texto), origem: 'ia', modelo: resposta.modelo, geradoEm: agora };
  }
  const m = rascunhoDeModelo(r, item, tipo, documentos);
  return { tipo, titulo: m.titulo, texto: comCar(m.texto), origem: 'modelo', geradoEm: agora, motivoSemIA: resposta.motivo };
}
