import type { Evidencias, FonteId, ResultadoConsulta, Sobreposicao } from '@apto/regras';
import pg from 'pg';
import type { ConsultaSalva, EntradaColeta, Repositorio } from './tipos.js';

// Geometria do imóvel em SIRGAS 2000. Arquivos GeoJSON/KML vêm em WGS 84,
// cuja diferença para o SIRGAS 2000 é desprezível nesta escala.
const GEOM = 'ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($1), 4674)), 3))';
const AREA_INTERSECAO = `ST_Area(ST_Intersection(t.geom, g.geom)::geography) / 10000`;

export class RepositorioPostgis implements Repositorio {
  private pool: pg.Pool;

  constructor(url: string) {
    this.pool = new pg.Pool({ connectionString: url, max: 10 });
  }

  async atualizacoes(): Promise<Partial<Record<FonteId, string>>> {
    const { rows } = await this.pool.query<{ fonte_id: FonteId; data: string }>(
      `SELECT fonte_id, to_char(coalesce(referencia_em, baixado_em::date), 'YYYY-MM-DD') AS data
         FROM fonte_carga WHERE ativa`,
    );
    return Object.fromEntries(rows.map((r) => [r.fonte_id, r.data]));
  }

  async coletarEvidencias(e: EntradaColeta): Promise<Evidencias> {
    const atualizacoes = await this.atualizacoes();
    const carregada = (f: FonteId) => f in atualizacoes;
    const geo = e.geometria ? JSON.stringify(e.geometria) : null;

    // Sem a base carregada ou sem o desenho do imóvel, o item fica "não verificado".
    const sobrepor = async <T extends Sobreposicao>(fonte: FonteId, sql: string): Promise<T[] | null> => {
      if (!geo || !carregada(fonte)) return null;
      const { rows } = await this.pool.query(`WITH g AS (SELECT ${GEOM} AS geom) ${sql}`, [geo]);
      return rows.map((r) => ({ ...r, areaHa: Number(r.areaHa) })) as T[];
    };

    const [areaImovel, uc, ti, quilombolas, florestas, embargos, mma, trabalhoEscravo] = await Promise.all([
      geo
        ? this.pool.query<{ area: string }>(`SELECT ST_Area(${GEOM}::geography) / 10000 AS area`, [geo]).then((r) => Number(r.rows[0]!.area))
        : Promise.resolve(undefined),
      sobrepor<Sobreposicao & { categoria: string }>(
        'cnuc',
        `SELECT t.nome, t.categoria, ${AREA_INTERSECAO} AS "areaHa" FROM cnuc_uc t, g WHERE ST_Intersects(t.geom, g.geom)`,
      ),
      sobrepor<Sobreposicao & { fase: string }>(
        'funai_ti',
        `SELECT t.nome, t.fase, ${AREA_INTERSECAO} AS "areaHa" FROM funai_ti t, g WHERE ST_Intersects(t.geom, g.geom)`,
      ),
      sobrepor('incra_quilombolas', `SELECT t.nome, ${AREA_INTERSECAO} AS "areaHa" FROM incra_quilombola t, g WHERE ST_Intersects(t.geom, g.geom)`),
      sobrepor('sfb_cnfp', `SELECT t.nome, ${AREA_INTERSECAO} AS "areaHa" FROM sfb_floresta_tipo_b t, g WHERE ST_Intersects(t.geom, g.geom)`),
      this.embargos(geo, carregada('ibama_embargos')),
      this.listaMma(e.car, carregada('mma_lista_mcr')),
      this.trabalhoEscravo(e.documentoHash, carregada('mte_empregadores')),
    ]);

    // O que o técnico informou prevalece; senão, usa o que o MMA trouxe do Sicar.
    return {
      imovel: {
        car: e.car,
        areaHa: areaImovel,
        modulosFiscais: e.modulosFiscais ?? mma?.modulosFiscais,
        situacaoCar: e.situacaoCar ?? mma?.situacaoCar,
        usoColetivo: e.usoColetivo,
      },
      unidadesConservacao: uc,
      terrasIndigenas: ti,
      quilombolas,
      florestasTipoB: florestas,
      embargos,
      listaMma: mma?.lista ?? null,
      trabalhoEscravo,
      atualizacoes,
    };
  }

  private async embargos(geo: string | null, carregada: boolean): Promise<Evidencias['embargos']> {
    if (!geo || !carregada) return null;
    // Embargo em ponto não tem área própria: usa a área declarada no termo, se houver.
    const { rows } = await this.pool.query(
      `WITH g AS (SELECT ${GEOM} AS geom)
       SELECT t.numero, t.descricao,
              to_char(t.data_embargo, 'YYYY-MM-DD') AS "dataEmbargo",
              CASE WHEN ST_Dimension(t.geom) = 2 THEN ${AREA_INTERSECAO} ELSE t.area_ha END AS "areaHa"
         FROM ibama_embargo t, g
        WHERE t.ativo AND ST_Intersects(t.geom, g.geom)`,
      [geo],
    );
    return rows.map((r) => ({
      numero: r.numero,
      descricao: r.descricao ?? undefined,
      dataEmbargo: r.dataEmbargo ?? undefined,
      areaHa: r.areaHa == null ? undefined : Number(r.areaHa),
    }));
  }

  private async listaMma(car: string, carregada: boolean) {
    if (!carregada) return null;
    const { rows } = await this.pool.query(
      `SELECT status_car, modulos_fiscais, area_supressao_ha, acima_criterio, criterio, bioma
         FROM mma_lista_mcr WHERE cod_car = $1`,
      [car],
    );
    const r = rows[0];
    if (!r) return { lista: { consta: false } };
    const situacoes = { AT: 'ativo', PE: 'pendente', SU: 'suspenso', CA: 'cancelado' } as const;
    return {
      situacaoCar: situacoes[r.status_car as keyof typeof situacoes],
      modulosFiscais: r.modulos_fiscais == null ? undefined : Number(r.modulos_fiscais),
      lista: {
        consta: true,
        acimaDoCriterio: r.acima_criterio ?? undefined,
        areaSupressaoHa: r.area_supressao_ha == null ? undefined : Number(r.area_supressao_ha),
        criterio: r.criterio ?? undefined,
        bioma: r.bioma ?? undefined,
      },
    };
  }

  private async trabalhoEscravo(hash: string | undefined, carregada: boolean): Promise<Evidencias['trabalhoEscravo']> {
    if (!hash || !carregada) return null;
    const { rowCount } = await this.pool.query('SELECT 1 FROM mte_empregador WHERE documento_hash = $1', [hash]);
    return { consta: (rowCount ?? 0) > 0 };
  }

  async salvar(e: EntradaColeta, evidencias: Evidencias, resultado: ResultadoConsulta): Promise<ConsultaSalva> {
    const geo = e.geometria ? JSON.stringify(e.geometria) : null;
    const { rows } = await this.pool.query<{ id: string; criada_em: Date }>(
      `INSERT INTO consulta (cod_car, data_referencia, documento_hash, geom, evidencias, resultado)
       VALUES ($2, $3, $4, CASE WHEN $1::text IS NULL THEN NULL ELSE ${GEOM} END, $5, $6)
       RETURNING id, criada_em`,
      [geo, e.car, resultado.dataReferencia, e.documentoHash ?? null, evidencias, resultado],
    );
    const r = rows[0]!;
    return { id: r.id, criadaEm: r.criada_em.toISOString(), resultado, geometria: e.geometria, demo: false };
  }

  async buscar(id: string): Promise<ConsultaSalva | null> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const { rows } = await this.pool.query(
      `SELECT id, criada_em, resultado, ST_AsGeoJSON(geom)::json AS geometria FROM consulta WHERE id = $1`,
      [id],
    );
    const r = rows[0];
    if (!r) return null;
    return { id: r.id, criadaEm: r.criada_em.toISOString(), resultado: r.resultado, geometria: r.geometria ?? undefined, demo: false };
  }
}
