import type { Evidencias, FonteId, ResultadoConsulta } from '@apto/regras';
import type { GeometriaImovel } from '../esquemas.js';

export interface EntradaColeta {
  car: string;
  situacaoCar?: Evidencias['imovel']['situacaoCar'];
  modulosFiscais?: number;
  usoColetivo?: boolean;
  geometria?: GeometriaImovel;
  /** Hash do CPF/CNPJ guardado no histórico. */
  documentoHash?: string;
  /** Hashes procurados no cadastro do MTE (CPF, ou CNPJ e sua raiz). */
  hashesCadastro?: string[];
  /**
   * Reconferência da carteira: a situação do CAR e os módulos fiscais da lista
   * oficial do MMA valem mais que o informado pelo técnico no dia da consulta.
   */
  preferirBaseOficial?: boolean;
}

export type TipoCamadaMapa = 'embargo' | 'terra_indigena' | 'uc' | 'quilombola' | 'floresta_publica';

/** Uma área das bases públicas que aparece no mapa do entorno. */
export interface CamadaMapa {
  tipo: TipoCamadaMapa;
  nome: string;
  /** Ex.: categoria da UC, fase da terra indígena, data do embargo. */
  detalhe?: string;
  /** Encosta no imóvel (é o que a consulta encontrou). */
  toca: boolean;
  /** Área dentro do imóvel, em hectares, quando encosta. */
  areaHa?: number;
  /** Distância até o imóvel, em metros, quando não encosta. */
  distanciaM?: number;
  /** Ponto dentro da área, para o número no mapa. */
  rotulo?: [number, number];
  /** Recorte da área dentro da janela do mapa (GeoJSON, simplificado). */
  geometria: { type: string; coordinates: unknown };
}

/** Mapa do entorno, guardado com a consulta (fotografia das bases no dia). */
export interface MapaEntorno {
  /** Oeste, sul, leste, norte. */
  janela: [number, number, number, number];
  camadas: CamadaMapa[];
}

export interface ConsultaSalva {
  id: string;
  criadaEm: string;
  resultado: ResultadoConsulta;
  geometria?: GeometriaImovel;
  /** Ausente nas consultas sem contorno e nas anteriores ao mapa. */
  mapa?: MapaEntorno;
  demo: boolean;
  usuarioId?: string;
  dossieLiberado: boolean;
}

export interface Repositorio {
  coletarEvidencias(entrada: EntradaColeta): Promise<Evidencias>;
  salvar(
    entrada: EntradaColeta,
    evidencias: Evidencias,
    resultado: ResultadoConsulta,
    meta: { id: string; usuarioId?: string },
  ): Promise<ConsultaSalva>;
  buscar(id: string): Promise<ConsultaSalva | null>;
  liberarDossie(id: string): Promise<void>;
  atualizacoes(): Promise<Partial<Record<FonteId, string>>>;
}
