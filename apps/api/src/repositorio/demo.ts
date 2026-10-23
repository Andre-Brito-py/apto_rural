import { randomUUID } from 'node:crypto';
import type { Evidencias, ResultadoConsulta } from '@apto/regras';
import type { GeometriaImovel } from '../esquemas.js';
import type { ConsultaSalva, EntradaColeta, Repositorio } from './tipos.js';

/**
 * Cenários FICTÍCIOS para desenvolver e demonstrar a interface sem as bases
 * carregadas. Só funcionam com APTO_DEMO=1 e com os códigos abaixo, que não
 * existem no Sicar (código de município 0000000).
 */
const PREFIXO = 'MT-0000000-';
export const CARS_DEMO = {
  embargoEProdes: `${PREFIXO}${'0'.repeat(31)}1`,
  limpo: `${PREFIXO}${'0'.repeat(31)}2`,
  bordaTerraIndigena: `${PREFIXO}${'0'.repeat(31)}3`,
};

export function ehCarDemo(car: string): boolean {
  return Object.values(CARS_DEMO).includes(car);
}

const HOJE_DADOS = '2026-10-20';

function quadrado(lon: number, lat: number, lado: number): GeometriaImovel {
  return {
    type: 'Polygon',
    coordinates: [[[lon, lat], [lon + lado, lat], [lon + lado, lat + lado * 0.8], [lon + lado * 0.2, lat + lado], [lon, lat]]],
  };
}

function cenario(car: string): Omit<Evidencias, 'imovel' | 'trabalhoEscravo'> & { areaHa: number; mf: number } {
  const limpo = {
    unidadesConservacao: [],
    terrasIndigenas: [],
    quilombolas: [],
    florestasTipoB: [],
    embargos: [],
    listaMma: { consta: false },
    atualizacoes: {
      ibama_embargos: HOJE_DADOS,
      mma_lista_mcr: '2026-09-21',
      cnuc: HOJE_DADOS,
      funai_ti: HOJE_DADOS,
      incra_quilombolas: HOJE_DADOS,
      sfb_cnfp: HOJE_DADOS,
      mte_empregadores: '2026-10-06',
    },
    areaHa: 900,
    mf: 9,
  };
  if (car === CARS_DEMO.embargoEProdes) {
    return {
      ...limpo,
      embargos: [{ numero: 'DEMO-0001 (fictício)', areaHa: 18, dataEmbargo: '2025-03-10', descricao: 'Exemplo fictício' }],
      listaMma: { consta: true, acimaDoCriterio: true, areaSupressaoHa: 12.4, bioma: 'Cerrado', criterio: 'Cerrado: acima de 5 ha' },
    };
  }
  if (car === CARS_DEMO.bordaTerraIndigena) {
    return { ...limpo, terrasIndigenas: [{ nome: 'Terra Indígena Exemplo (fictícia)', fase: 'Regularizada', areaHa: 0.04 }] };
  }
  return limpo;
}

export class RepositorioDemo implements Repositorio {
  private consultas = new Map<string, ConsultaSalva>();

  async atualizacoes() {
    return cenario(CARS_DEMO.limpo).atualizacoes;
  }

  async coletarEvidencias(e: EntradaColeta): Promise<Evidencias> {
    const { areaHa, mf, ...resto } = cenario(e.car);
    return {
      ...resto,
      imovel: {
        car: e.car,
        areaHa,
        modulosFiscais: e.modulosFiscais ?? mf,
        situacaoCar: e.situacaoCar,
        usoColetivo: e.usoColetivo,
      },
      trabalhoEscravo: e.documentoHash ? { consta: false } : null,
    };
  }

  async salvar(e: EntradaColeta, _ev: Evidencias, resultado: ResultadoConsulta): Promise<ConsultaSalva> {
    const salva: ConsultaSalva = {
      id: randomUUID(),
      criadaEm: new Date().toISOString(),
      resultado,
      geometria: e.geometria ?? quadrado(-55.9, -12.6, 0.03),
      demo: true,
    };
    this.consultas.set(salva.id, salva);
    return salva;
  }

  async buscar(id: string) {
    return this.consultas.get(id) ?? null;
  }
}
