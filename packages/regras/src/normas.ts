import type { Fonte, FonteId, Norma } from './tipos.js';

// Textos oficiais conferidos em 23/10/2026 — ver docs/fontes-oficiais.md.
const BCB = 'https://www.bcb.gov.br/estabilidadefinanceira/exibenormativo?tipo=Resolu%C3%A7%C3%A3o%20CMN&numero=';

export const ATOS = {
  res5193: { ato: 'Resolução CMN 5.193/2024', url: `${BCB}5193` },
  res5268: { ato: 'Resolução CMN 5.268/2025', url: `${BCB}5268` },
  res5303: { ato: 'Resolução CMN 5.303/2026', url: `${BCB}5303` },
} as const;

export function norma(item: string, ato: keyof typeof ATOS): Norma {
  return { item, ...ATOS[ato] };
}

export const FONTES: Record<FonteId, Fonte> = {
  car_demonstrativo: {
    id: 'car_demonstrativo',
    nome: 'Demonstrativo do CAR (informado pelo técnico)',
    orgao: 'Serviço Florestal Brasileiro / Sicar',
    url: 'https://consultapublica.car.gov.br/publico/imoveis/index',
  },
  mte_empregadores: {
    id: 'mte_empregadores',
    nome: 'Cadastro de empregadores (trabalho análogo ao escravo)',
    orgao: 'Ministério do Trabalho e Emprego',
    url: 'https://www.gov.br/trabalho-e-emprego/pt-br',
  },
  cnuc: {
    id: 'cnuc',
    nome: 'Cadastro Nacional de Unidades de Conservação',
    orgao: 'Ministério do Meio Ambiente e Mudança do Clima',
    url: 'https://dados.mma.gov.br/dataset/unidadesdeconservacao',
  },
  funai_ti: {
    id: 'funai_ti',
    nome: 'Terras indígenas',
    orgao: 'Funai',
    url: 'https://www.gov.br/funai/pt-br',
  },
  incra_quilombolas: {
    id: 'incra_quilombolas',
    nome: 'Territórios quilombolas titulados',
    orgao: 'Incra',
    url: 'https://certificacao.incra.gov.br',
  },
  ibama_embargos: {
    id: 'ibama_embargos',
    nome: 'Termos de embargo',
    orgao: 'Ibama',
    url: 'https://dadosabertos.ibama.gov.br/dataset/fiscalizacao-termo-de-embargo',
  },
  sfb_cnfp: {
    id: 'sfb_cnfp',
    nome: 'Cadastro Nacional de Florestas Públicas',
    orgao: 'Serviço Florestal Brasileiro',
    url: 'https://dados.florestal.gov.br/dataset/cadastro-nacional-de-florestas-publicas-cnfp',
  },
  mma_lista_mcr: {
    id: 'mma_lista_mcr',
    nome: 'Lista MCR de imóveis com supressão após 31/7/2019 (BiomasBR / Prodes)',
    orgao: 'MMA / Inpe',
    url: 'https://www.gov.br/mma/pt-br/assuntos/controle-ao-desmatamento-queimadas-e-ordenamento-ambiental-territorial/controle-do-desmatamento-1/atendimento-ao-manual-de-credito-rural',
  },
};

export const CONTESTACAO_PRODES_URL = 'https://www.gov.br/inpe/pt-br/canais_atendimento/biomasbr';
