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

export interface ConsultaSalva {
  id: string;
  criadaEm: string;
  resultado: ResultadoConsulta;
  geometria?: GeometriaImovel;
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
