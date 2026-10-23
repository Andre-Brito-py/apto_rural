import type { Evidencias, FonteId, ResultadoConsulta } from '@apto/regras';
import type { GeometriaImovel } from '../esquemas.js';

export interface EntradaColeta {
  car: string;
  situacaoCar?: Evidencias['imovel']['situacaoCar'];
  modulosFiscais?: number;
  usoColetivo?: boolean;
  geometria?: GeometriaImovel;
  documentoHash?: string;
}

export interface ConsultaSalva {
  id: string;
  criadaEm: string;
  resultado: ResultadoConsulta;
  geometria?: GeometriaImovel;
  demo: boolean;
}

export interface Repositorio {
  coletarEvidencias(entrada: EntradaColeta): Promise<Evidencias>;
  salvar(entrada: EntradaColeta, evidencias: Evidencias, resultado: ResultadoConsulta): Promise<ConsultaSalva>;
  buscar(id: string): Promise<ConsultaSalva | null>;
  atualizacoes(): Promise<Partial<Record<FonteId, string>>>;
}
