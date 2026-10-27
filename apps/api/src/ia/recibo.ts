import { normalizarCar, type SituacaoCar } from '@apto/regras';
import { numerosPermitidos, numeros, semDadosPessoais } from './comum.js';
import type { ExecutorIA, MotivoSemIA } from './executor.js';

/**
 * Leitura do recibo de inscrição ou do demonstrativo do CAR que o técnico baixou do Sicar
 * (docs/ia.md). O texto sai do PDF no navegador; aqui, uma leitura por padrões acha o que
 * tem formato fixo (o código do CAR, "Situação: Ativo") e a IA, quando ligada, completa o
 * resto. O técnico confere antes de consultar: nada é preenchido sem ele ver.
 */
export interface LeituraRecibo {
  car?: string;
  situacao?: SituacaoCar;
  areaHa?: number;
  modulosFiscais?: number;
  municipio?: string;
  uf?: string;
  /** DD/MM/AAAA, como está no documento. */
  dataInscricao?: string;
  /** Quem achou o quê: 'texto' = só a leitura por padrões; 'ia' = a IA completou. */
  origem: 'texto' | 'ia';
  /** Por que a IA não completou (desligada, sem chave…), quando for o caso. */
  motivoSemIA?: MotivoSemIA;
}

const SITUACOES: SituacaoCar[] = ['ativo', 'pendente', 'suspenso', 'cancelado'];
export const TAMANHO_MAXIMO_RECIBO = 30_000;

const numeroBr = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'));

/** O que tem formato fixo no recibo e no demonstrativo, sem IA. */
export function lerReciboPorPadroes(texto: string): Omit<LeituraRecibo, 'origem'> {
  const t = texto.replace(/\s+/g, ' ');
  const r: Omit<LeituraRecibo, 'origem'> = {};
  for (const m of t.matchAll(/\b[A-Z]{2}\s?-\s?\d{7}\s?-\s?(?:[0-9A-F]{4}\.?\s?){7}[0-9A-F]{4}(?![0-9A-F])/gi)) {
    const car = normalizarCar(m[0].replace(/\s/g, ''));
    if (car) {
      r.car = car;
      break;
    }
  }
  const situacao = /situa[cç][aã]o(?:\s+do\s+(?:cadastro|im[oó]vel|car))?\s*[:-]?\s*(ativo|pendente|suspenso|cancelado)\b/i.exec(t)?.[1];
  if (situacao) r.situacao = situacao.toLowerCase() as SituacaoCar;
  const area = /[aá]rea\s+(?:total\s+)?(?:do\s+im[oó]vel\s+)?(?:rural\s+)?[^\d]{0,25}?(\d{1,3}(?:\.\d{3})*,\d+|\d+(?:,\d+)?)\s*(?:ha|hectares)\b/i.exec(t)?.[1];
  if (area) r.areaHa = numeroBr(area);
  const mf = /m[oó]dulos?\s+fiscais?\s*[:-]?\s*(\d+(?:,\d+)?)/i.exec(t)?.[1];
  if (mf) r.modulosFiscais = numeroBr(mf);
  const data = /data\s+(?:de\s+|da\s+)?(?:inscri[cç][aã]o|cadastro)\s*[:-]?\s*(\d{2}\/\d{2}\/\d{4})/i.exec(t)?.[1];
  if (data) r.dataInscricao = data;
  return r;
}

const INSTRUCOES = `Você lê o texto de um recibo de inscrição ou de um demonstrativo do Cadastro Ambiental Rural (CAR), do Sicar.
Responda só o que está escrito no texto. Se um campo não estiver escrito, responda null: não deduza, não calcule, não arredonde.
- situacao: a situação do cadastro (ativo, pendente, suspenso ou cancelado), se aparecer.
- area_ha: a área total do imóvel em hectares, como número.
- modulos_fiscais: o número de módulos fiscais do imóvel, como número.
- municipio e uf: o município e a sigla do estado do imóvel.
- data_inscricao: a data de inscrição ou de cadastro, no formato DD/MM/AAAA.`;

const nulo = (tipo: string) => ({ type: [tipo, 'null'] });
const ESQUEMA = {
  nome: 'recibo_car',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['situacao', 'area_ha', 'modulos_fiscais', 'municipio', 'uf', 'data_inscricao'],
    properties: {
      situacao: { type: ['string', 'null'], enum: [...SITUACOES, null] },
      area_ha: nulo('number'),
      modulos_fiscais: nulo('number'),
      municipio: nulo('string'),
      uf: nulo('string'),
      data_inscricao: nulo('string'),
    },
  },
};

interface SaidaRecibo {
  situacao: SituacaoCar | null;
  area_ha: number | null;
  modulos_fiscais: number | null;
  municipio: string | null;
  uf: string | null;
  data_inscricao: string | null;
}

/** Todo número que a IA devolveu precisa estar escrito no recibo. */
export function conferirLeitura(saida: unknown, texto: string): { ok: true; valor: SaidaRecibo } | { ok: false; motivo: string } {
  const o = saida as SaidaRecibo;
  if (!o || typeof o !== 'object') return { ok: false, motivo: 'sem resposta' };
  if (o.situacao != null && !SITUACOES.includes(o.situacao)) return { ok: false, motivo: 'situação desconhecida' };
  if (o.uf != null && !/^[A-Z]{2}$/.test(o.uf)) return { ok: false, motivo: 'UF inválida' };
  if (o.data_inscricao != null && !/^\d{2}\/\d{2}\/\d{4}$/.test(o.data_inscricao)) return { ok: false, motivo: 'data fora do formato' };
  if (o.municipio != null && (o.municipio.length > 60 || /\d/.test(o.municipio))) return { ok: false, motivo: 'município estranho' };
  const permitidos = numerosPermitidos(texto);
  for (const [campo, v] of [
    ['área', o.area_ha],
    ['módulos fiscais', o.modulos_fiscais],
  ] as const) {
    if (v == null) continue;
    if (!(v > 0 && v < 10_000_000)) return { ok: false, motivo: `${campo} fora do razoável` };
    // "1.234,56" no recibo vira 123456; o número devolvido (1234.56) também.
    const digitos = numeros(String(v).replace('.', ','))[0]!;
    if (!permitidos.has(digitos) && !permitidos.has(String(Math.round(v)))) return { ok: false, motivo: `${campo} que não está no recibo (${v})` };
  }
  if (o.data_inscricao && !permitidos.has(o.data_inscricao.replace(/\D/g, ''))) return { ok: false, motivo: 'data que não está no recibo' };
  return { ok: true, valor: o };
}

/** Lê o recibo: padrões primeiro; a IA (com CPF, CNPJ, CAR e e-mail tirados do texto) completa o que faltar. */
export async function lerRecibo(executor: ExecutorIA, textoBruto: string): Promise<LeituraRecibo> {
  const texto = textoBruto.slice(0, TAMANHO_MAXIMO_RECIBO);
  const porPadroes = lerReciboPorPadroes(texto);
  const completo = porPadroes.situacao && porPadroes.areaHa && porPadroes.modulosFiscais && porPadroes.dataInscricao;
  if (completo) return { ...porPadroes, origem: 'texto' };
  const semPessoais = semDadosPessoais(texto, TAMANHO_MAXIMO_RECIBO);
  const r = await executor.rodar({
    tarefa: 'recibo',
    instrucoes: INSTRUCOES,
    entrada: semPessoais,
    esquema: ESQUEMA,
    maxTokens: 1500,
    conferir: (json) => conferirLeitura(json, semPessoais),
  });
  if (!r.ok) return { ...porPadroes, origem: 'texto', motivoSemIA: r.motivo };
  const v = r.valor;
  return {
    // O que os padrões acharam vale mais: é cópia literal do documento.
    car: porPadroes.car,
    situacao: porPadroes.situacao ?? v.situacao ?? undefined,
    areaHa: porPadroes.areaHa ?? v.area_ha ?? undefined,
    modulosFiscais: porPadroes.modulosFiscais ?? v.modulos_fiscais ?? undefined,
    municipio: v.municipio ?? undefined,
    uf: v.uf ?? undefined,
    dataInscricao: porPadroes.dataInscricao ?? v.data_inscricao ?? undefined,
    origem: 'ia',
  };
}
