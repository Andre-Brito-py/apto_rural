import type { Evidencias, FonteId, ResultadoConsulta, Sobreposicao } from '@apto/regras';
import pg from 'pg';
import type { CamadaMapa, ConsultaSalva, EntradaColeta, MapaEntorno, Repositorio, TipoCamadaMapa } from './tipos.js';

// Geometria do imóvel em SIRGAS 2000. Arquivos GeoJSON/KML vêm em WGS 84,
// cuja diferença para o SIRGAS 2000 é desprezível nesta escala.
const GEOM = 'ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($1), 4674)), 3))';
const AREA_INTERSECAO = `ST_Area(ST_Intersection(t.geom, g.geom)::geography) / 10000`;

// Janela do mapa do entorno: o imóvel com uma folga de 45% do seu tamanho mais ~1 km,
// para aparecer o que está em volta. A tolerância de simplificação é 1/600 da largura
// (menos que um pixel no mapa da tela), o que deixa o recorte pequeno para guardar.
const JANELA = `WITH g AS (SELECT ${GEOM} AS geom),
  j AS (SELECT geom AS imovel,
               ST_Expand(ST_Envelope(geom), greatest(ST_XMax(geom) - ST_XMin(geom), ST_YMax(geom) - ST_YMin(geom)) * 0.45 + 0.01) AS janela
          FROM g),
  p AS (SELECT imovel, janela, (ST_XMax(janela) - ST_XMin(janela)) / 600 AS tol FROM j)`;

/** Até 40 áreas por base: primeiro as que encostam no imóvel, depois as mais próximas. */
function sqlCamada(tipo: TipoCamadaMapa, tabela: string, nome: string, detalhe: string, filtro = '') {
  return `${JANELA}
    SELECT '${tipo}' AS tipo, nome, detalhe, toca, "distanciaM", "areaHa",
           ST_AsGeoJSON(recorte, 5)::json AS geometria,
           -- O número fica onde a área encosta no imóvel (ou, se não encosta, dentro da área).
           ST_AsGeoJSON(CASE WHEN toque IS NULL OR ST_IsEmpty(toque) THEN ST_PointOnSurface(recorte)
                             ELSE ST_ClosestPoint(toque, ST_Centroid(toque)) END, 5)::json AS rotulo
      FROM (
        SELECT nome, detalhe, toca, "distanciaM", "areaHa", toque,
               -- Lasca pequena demais some na simplificação: aí vale o recorte original.
               CASE WHEN ST_IsEmpty(simples) THEN bruto ELSE simples END AS recorte
          FROM (
            SELECT ${nome} AS nome, ${detalhe} AS detalhe, toca, bruto,
                   CASE WHEN toca THEN ST_Intersection(geom, imovel) END AS toque,
                   CASE WHEN ST_Dimension(bruto) = 2 THEN ST_SimplifyPreserveTopology(bruto, tol) ELSE bruto END AS simples,
                   CASE WHEN toca THEN NULL ELSE round(ST_Distance(geom::geography, imovel::geography)) END AS "distanciaM",
                   CASE WHEN NOT toca THEN NULL
                        WHEN ST_Dimension(geom) = 2 THEN ST_Area(ST_Intersection(geom, imovel)::geography) / 10000
                        ELSE ${tipo === 'embargo' ? 'area_ha' : 'NULL'} END AS "areaHa"
              FROM (
                SELECT t.*, p.imovel, p.tol, ST_Intersects(t.geom, p.imovel) AS toca,
                       CASE WHEN ST_Dimension(t.geom) = 2 THEN ST_CollectionExtract(ST_Intersection(t.geom, p.janela), 3)
                            ELSE ST_Intersection(t.geom, p.janela) END AS bruto
                  FROM ${tabela} t, p
                 WHERE ${filtro} ST_Intersects(t.geom, p.janela)
              ) a
             ORDER BY toca DESC, "distanciaM" NULLS FIRST
             LIMIT 40
          ) b
      ) c
     WHERE NOT ST_IsEmpty(recorte)`;
}

const CAMADAS_MAPA = [
  sqlCamada('embargo', 'ibama_embargo', `'Embargo ' || numero`, `to_char(data_embargo, 'DD/MM/YYYY')`, 't.ativo AND'),
  sqlCamada('terra_indigena', 'funai_ti', 'nome', 'fase'),
  sqlCamada('uc', 'cnuc_uc', 'nome', 'categoria'),
  sqlCamada('quilombola', 'incra_quilombola', 'nome', 'NULL'),
  sqlCamada('floresta_publica', 'sfb_floresta_tipo_b', 'nome', 'NULL'),
];

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
    const mapa = geo ? await this.mapaEntorno(geo) : undefined;
    const { rows } = await this.pool.query<{ criada_em: Date }>(
      `INSERT INTO consulta (id, usuario_id, cod_car, data_referencia, documento_hash, geom, evidencias, resultado, mapa)
       VALUES ($2, $3, $4, $5, $6, CASE WHEN $1::text IS NULL THEN NULL ELSE ${GEOM} END, $7, $8, $9)
       RETURNING criada_em`,
      [geo, meta.id, meta.usuarioId ?? null, e.car, resultado.dataReferencia, e.documentoHash ?? null, evidencias, resultado, mapa ?? null],
    );
    return {
      id: meta.id,
      criadaEm: rows[0]!.criada_em.toISOString(),
      resultado,
      geometria: e.geometria,
      mapa,
      demo: false,
      usuarioId: meta.usuarioId,
      dossieLiberado: false,
    };
  }

  async buscar(id: string): Promise<ConsultaSalva | null> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
    const { rows } = await this.pool.query(
      `SELECT id, usuario_id, criada_em, resultado, dossie_liberado_em, mapa, ST_AsGeoJSON(geom)::json AS geometria
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
      mapa: r.mapa ?? undefined,
      demo: false,
      usuarioId: r.usuario_id ?? undefined,
      dossieLiberado: r.dossie_liberado_em != null,
    };
  }

  /**
   * Recorte das bases em volta do imóvel, para o mapa do relatório. Se falhar, a
   * consulta segue sem mapa (o site mostra só o contorno): o mapa ilustra, não decide.
   */
  private async mapaEntorno(geo: string): Promise<MapaEntorno | undefined> {
    try {
      const [janela, ...camadas] = await Promise.all([
        this.pool.query(
          `${JANELA} SELECT ST_XMin(janela) AS o, ST_YMin(janela) AS s, ST_XMax(janela) AS l, ST_YMax(janela) AS n FROM p`,
          [geo],
        ),
        ...CAMADAS_MAPA.map((sql) => this.pool.query(sql, [geo])),
      ]);
      const j = janela.rows[0]!;
      const arredondar = (v: number) => Math.round(v * 1e5) / 1e5;
      return {
        janela: [j.o, j.s, j.l, j.n].map((v) => arredondar(Number(v))) as MapaEntorno['janela'],
        camadas: camadas.flatMap((r) =>
          r.rows.map(
            (c): CamadaMapa => ({
              tipo: c.tipo,
              nome: c.nome,
              detalhe: c.detalhe ?? undefined,
              toca: c.toca,
              areaHa: c.areaHa == null ? undefined : Number(c.areaHa),
              distanciaM: c.distanciaM == null ? undefined : Number(c.distanciaM),
              rotulo: c.rotulo?.coordinates,
              geometria: c.geometria,
            }),
          ),
        ),
      };
    } catch (e) {
      console.error('Mapa do entorno falhou; consulta segue sem mapa.', e);
      return undefined;
    }
  }

  async liberarDossie(id: string) {
    await this.pool.query('UPDATE consulta SET dossie_liberado_em = coalesce(dossie_liberado_em, now()) WHERE id = $1', [id]);
  }
}
