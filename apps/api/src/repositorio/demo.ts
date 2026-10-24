import type { Evidencias, ResultadoConsulta } from '@apto/regras';
import type { GeometriaImovel } from '../esquemas.js';
import type { CamadaMapa, ConsultaSalva, EntradaColeta, MapaEntorno, Repositorio } from './tipos.js';

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

const retangulo = (o: number, s: number, l: number, n: number) => ({
  type: 'Polygon',
  coordinates: [[[o, s], [l, s], [l, n], [o, n], [o, s]]],
});

/** Mapa do entorno FICTÍCIO, desenhado em volta do contorno, coerente com cada cenário. */
function mapaFicticio(car: string, geometria: GeometriaImovel): MapaEntorno {
  const pontos = (geometria.type === 'Polygon' ? [geometria.coordinates] : geometria.coordinates).flat(2) as number[][];
  const xs = pontos.map((p) => p[0]!);
  const ys = pontos.map((p) => p[1]!);
  const [o, s, l, n] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const w = l - o;
  const h = n - s;
  const folga = Math.max(w, h) * 0.45 + 0.01;
  const janela: MapaEntorno['janela'] = [o - folga, s - folga, l + folga, n + folga];
  const meio = (a: number, b: number) => (a + b) / 2;
  const camadas: CamadaMapa[] = [
    // Em todos os cenários: uma UC ao norte, fora do imóvel, para o mapa mostrar o entorno.
    {
      tipo: 'uc',
      nome: 'Parque Estadual Exemplo (fictício)',
      detalhe: 'Parque',
      toca: false,
      distanciaM: Math.round(folga * 0.35 * 111_000),
      rotulo: [meio(o, l), n + folga * 0.7],
      geometria: retangulo(o - folga, n + folga * 0.35, l + folga, n + folga),
    },
  ];
  if (car === CARS_DEMO.embargoEProdes) {
    const [x, y] = [o + w * 0.45, s + h * 0.35];
    camadas.unshift({
      tipo: 'embargo',
      nome: 'Embargo DEMO-0001 (fictício)',
      detalhe: '10/03/2025',
      toca: true,
      areaHa: 18,
      rotulo: [x + w * 0.06, y + h * 0.05],
      geometria: retangulo(x, y, x + w * 0.12, y + h * 0.1),
    });
  }
  if (car === CARS_DEMO.bordaTerraIndigena) {
    camadas.unshift({
      tipo: 'terra_indigena',
      nome: 'Terra Indígena Exemplo (fictícia)',
      detalhe: 'Regularizada',
      toca: true,
      areaHa: 0.04,
      rotulo: [l, meio(s, n)],
      geometria: retangulo(l - w * 0.004, s - folga, l + folga, n * 0.5 + s * 0.5 + h * 0.2),
    });
  }
  return { janela, camadas };
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
        origemModulosFiscais: e.modulosFiscais != null ? 'informado' : 'lista_mma',
        situacaoCar: e.situacaoCar,
        usoColetivo: e.usoColetivo,
      },
      trabalhoEscravo: e.documentoHash ? { consta: false } : null,
    };
  }

  async salvar(
    e: EntradaColeta,
    _ev: Evidencias,
    resultado: ResultadoConsulta,
    meta: { id: string; usuarioId?: string },
  ): Promise<ConsultaSalva> {
    const geometria = e.geometria ?? quadrado(-55.9, -12.6, 0.03);
    const salva: ConsultaSalva = {
      id: meta.id,
      criadaEm: new Date().toISOString(),
      resultado,
      geometria,
      mapa: mapaFicticio(e.car, geometria),
      demo: true,
      usuarioId: meta.usuarioId,
      // Exemplos fictícios: dossiê aberto, sem gastar crédito.
      dossieLiberado: true,
    };
    this.consultas.set(salva.id, salva);
    return salva;
  }

  async buscar(id: string) {
    return this.consultas.get(id) ?? null;
  }

  async liberarDossie() {}

  // Os CARs de exemplo usam o município fictício 0000000.
  async moduloFiscal() {
    return null;
  }
}
