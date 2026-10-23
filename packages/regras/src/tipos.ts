export type Status = 'sem_impedimento' | 'atencao' | 'impedimento' | 'nao_verificado';

export type Veredito = 'sem_impedimento' | 'atencao' | 'impedimento' | 'incompleto';

export type FonteId =
  | 'car_demonstrativo'
  | 'mte_empregadores'
  | 'cnuc'
  | 'funai_ti'
  | 'incra_quilombolas'
  | 'ibama_embargos'
  | 'sfb_cnfp'
  | 'mma_lista_mcr';

export interface Norma {
  /** Item do Manual de Crédito Rural, ex.: "MCR 2-9-10". */
  item: string;
  /** Ato que dá a redação vigente, ex.: "Resolução CMN 5.193/2024". */
  ato: string;
  url: string;
}

export interface Fonte {
  id: FonteId;
  nome: string;
  orgao: string;
  url: string;
}

export type SituacaoCar = 'ativo' | 'pendente' | 'suspenso' | 'cancelado';

export interface Sobreposicao {
  nome: string;
  /** Área da interseção com o imóvel, em hectares. */
  areaHa: number;
}

export interface Embargo {
  numero: string;
  /** Área embargada dentro do imóvel, em hectares. */
  areaHa?: number;
  /**
   * Data (AAAA-MM-DD) do termo de embargo no Ibama. O MCR 2-9-12-"h" fala da data
   * da notificação, que a base aberta do Ibama não publica separadamente.
   */
  dataEmbargo?: string;
  descricao?: string;
}

/**
 * O que foi encontrado nas bases. Campo ausente ou null = base não consultada,
 * e o item correspondente sai como "não verificado" — nunca como verde.
 */
export interface Evidencias {
  imovel: {
    car: string;
    areaHa?: number;
    modulosFiscais?: number;
    situacaoCar?: SituacaoCar;
    /** CAR de perímetro de uso coletivo (assentamento, povos e comunidades tradicionais). */
    usoColetivo?: boolean;
  };
  trabalhoEscravo?: { consta: boolean } | null;
  unidadesConservacao?: Array<Sobreposicao & { categoria: string }> | null;
  terrasIndigenas?: Array<Sobreposicao & { fase: string }> | null;
  quilombolas?: Sobreposicao[] | null;
  embargos?: Embargo[] | null;
  florestasTipoB?: Sobreposicao[] | null;
  listaMma?: {
    consta: boolean;
    /**
     * Campo "dentro_criterio" do MMA invertido: true quando a supressão está acima
     * do limite do bioma (6,25 ha Amazônia; 5 ha Cerrado/Pantanal; 2 ha demais).
     */
    acimaDoCriterio?: boolean;
    areaSupressaoHa?: number;
    bioma?: string;
    criterio?: string;
  } | null;
  /** Data (AAAA-MM-DD) da última atualização de cada base usada. */
  atualizacoes: Partial<Record<FonteId, string>>;
}

export interface Caminho {
  titulo: string;
  descricao: string;
  norma?: Norma;
  requisitos?: string[];
  /** Avaliação automática de um requisito objetivo, quando possível. */
  verificacao?: { atende: boolean | null; texto: string };
}

export interface ResultadoItem {
  regraId: string;
  titulo: string;
  status: Status;
  resumo: string;
  detalhes: string[];
  caminhos: Caminho[];
  normas: Norma[];
  fontes: FonteId[];
  /** Que tipo de dossiê o item permite montar. */
  dossie: 'contestacao' | 'plano_de_saida' | null;
}

export interface ResultadoConsulta {
  car: string;
  dataReferencia: string;
  veredito: Veredito;
  itens: ResultadoItem[];
  avisos: string[];
  atualizacoes: Partial<Record<FonteId, string>>;
}

export interface Regra {
  id: string;
  titulo: string;
  /** Pergunta que o técnico entende, exibida na tela. */
  pergunta: string;
  normas: Norma[];
  fontes: FonteId[];
  avaliar(ev: Evidencias, dataReferencia: string): ResultadoItem;
}
