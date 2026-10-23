import type { Evidencias, FonteId, ResultadoConsulta, Sobreposicao } from '@apto/regras';
import pg from 'pg';
import type { ConsultaSalva, EntradaColeta, Repositorio } from './tipos.js';

// Geometria do imóvel em SIRGAS 2000. Arquivos GeoJSON/KML vêm em WGS 84,
// cuja diferença para o SIRGAS 2000 é desprezível nesta escala.
const GEOM = 'ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($1), 4674)), 3))';
const AREA_INTERSECAO = `ST_Area(ST_Intersection(t.geom, g.geom)::geography) / 10000`;

export class RepositorioPostgis implements Repositorio {
  constructor(private pool: pg.Pool) {}

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
      sobrepor<Sobreposicao & { categoria: string; grupo?: string; planoManejo?: string }>(
        'cnuc',
        `SELECT t.nome, t.categoria, t.grupo, t.plano_manejo AS "planoManejo", ${AREA_INTERSECAO} AS "areaHa"
           FROM cnuc_uc t, g WHERE ST_Intersects(t.geom, g.geom)`,
      ),
      sobrepor<Sobreposicao & { fase: string; modalidade?: string }>(
        'funai_ti',
        `SELECT t.nome, t.fase, t.modalidade, ${AREA_INTERSECAO} AS "areaHa" FROM funai_ti t, g WHERE ST_Intersects(t.geom, g.geom)`,
      ),
      sobrepor('incra_quilombolas', `SELECT t.nome, ${AREA_INTERSECAO} AS "areaHa" FROM incra_quilombola t, g WHERE ST_Intersects(t.geom, g.geom)`),
      sobrepor('sfb_cnfp', `SELECT t.nome, ${AREA_INTERSECAO} AS "areaHa" FROM sfb_floresta_tipo_b t, g WHERE ST_Intersects(t.geom, g.geom)`),
      this.embargos(geo, carregada('ibama_embargos')),
      this.listaMma(e.car, carregada('mma_lista_mcr')),
      this.trabalhoEscravo(e.hashesCadastro, carregada('mte_empregadores')),
    ]);

    // Na consulta, o que o técnico informou prevalece; na reconferência da
    // carteira, prevalece a lista oficial do MMA (mais recente).
    const oficialPrimeiro = e.preferirBaseOficial === true;
    return {
      imovel: {
        car: e.car,
        areaHa: areaImovel,
        modulosFiscais: oficialPrimeiro ? (mma?.modulosFiscais ?? e.modulosFiscais) : (e.modulosFiscais ?? mma?.modulosFiscais),
        situacaoCar: oficialPrimeiro ? (mma?.situacaoCar ?? e.situacaoCar) : (e.situacaoCar ?? mma?.situacaoCar),
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

  private async trabalhoEscravo(hashes: string[] | undefined, carregada: boolean): Promise<Evidencias['trabalhoEscravo']> {
    if (!hashes?.length || !carregada) return null;
    const { rowCount } = await this.pool.query('SELECT 1 FROM mte_empregador WHERE documento_hash = ANY($1)', [hashes]);
    return { consta: (rowCount ?? 0) > 0 };
  }

  async salvar(
    e: EntradaColeta,
    evidencias: Evidencias,
    resultado: ResultadoConsulta,
    meta: { id: string; usuarioId?: string },
  ): Promise<ConsultaSalva> {
    const geo = e.geometria ? JSON.stringify(e.geometria) : null;
    const { rows } = await this.pool.query<{ criada_em: Date }>(
      `INSERT INTO consulta (id, usuario_id, cod_car, data_referencia, documento_hash, geom, evidencias, resultado)
       VALUES ($2, $3, $4, $5, $6, CASE WHEN $1::text IS NULL THEN NULL ELSE ${GEOM} END, $7, $8)
       RETURNING criada_em`,
      [geo, meta.id, meta.usuarioId ?? null, e.car, resultado.dataReferencia, e.documentoHash ?? null, evidencias, resultado],
    );
    return {
      id: meta.id,
      criadaEm: rows[0]!.criada_em.toISOString(),
      resultado,
      geometria: e.geometria,
      demo: false,
      usuarioId: meta.usuarioId,
      dossieLiberado: false,
    };
  }

  async buscar(id: string): Promise<ConsultaSalva | null> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const { rows } = await this.pool.query(
      `SELECT id, usuario_id, criada_em, resultado, dossie_liberado_em, ST_AsGeoJSON(geom)::json AS geometria
         FROM consulta WHERE id = $1`,
      [id],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id,
      criadaEm: r.criada_em.toISOString(),
      resultado: r.resultado,
      geometria: r.geometria ?? undefined,
      demo: false,
      usuarioId: r.usuario_id ?? undefined,
      dossieLiberado: r.dossie_liberado_em != null,
    };
  }

  async liberarDossie(id: string) {
    await this.pool.query('UPDATE consulta SET dossie_liberado_em = coalesce(dossie_liberado_em, now()) WHERE id = $1', [id]);
  }
}
