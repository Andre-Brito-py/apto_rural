import type { Alteracao, ResultadoConsulta, SituacaoCar } from '@apto/regras';
import pg from 'pg';
import type { GeometriaImovel } from '../esquemas.js';

export interface ImovelCarteira {
  id: string;
  codCar: string;
  apelido?: string;
  verificadoEm: string;
  criadoEm: string;
  resultado: ResultadoConsulta;
  ultimaConsultaId?: string;
  avisosNaoLidos: number;
}

export interface Aviso {
  id: string;
  imovelId: string;
  codCar: string;
  apelido?: string;
  consultaId?: string;
  alteracoes: Alteracao[];
  criadoEm: string;
  lido: boolean;
}

export interface ImovelParaMonitorar {
  id: string;
  usuarioId: string;
  codCar: string;
  situacaoCar?: SituacaoCar;
  modulosFiscais?: number;
  usoColetivo: boolean;
  geometria?: GeometriaImovel;
  resultado: ResultadoConsulta;
}

export class RepositorioCarteira {
  constructor(private pool: pg.Pool) {}

  /**
   * Coloca na carteira da conta (usuarioId) o imóvel de uma consulta feita por
   * uma das pessoas que usam essa conta (autores: a própria pessoa ou a equipe).
   */
  async adicionarDeConsulta(
    usuarioId: string,
    autores: string[],
    consultaId: string,
    apelido: string | undefined,
    /** Quantos imóveis a conta pode acompanhar (configuração do painel). */
    limite: number,
  ): Promise<ImovelCarteira | 'nao_encontrada' | 'limite'> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(consultaId)) return 'nao_encontrada';
    const cliente = await this.pool.connect();
    try {
      await cliente.query('BEGIN');
      await cliente.query('SELECT 1 FROM usuario WHERE id = $1 FOR UPDATE', [usuarioId]);
      const { rows: origem } = await cliente.query(
        'SELECT cod_car FROM consulta WHERE id = $1 AND usuario_id = ANY($2::uuid[])',
        [consultaId, autores],
      );
      if (!origem[0]) {
        await cliente.query('ROLLBACK');
        return 'nao_encontrada';
      }
      const { rows: total } = await cliente.query(
        'SELECT count(*)::int AS n, bool_or(cod_car = $2) AS ja FROM imovel_monitorado WHERE usuario_id = $1',
        [usuarioId, origem[0].cod_car],
      );
      if (!total[0].ja && total[0].n >= limite) {
        await cliente.query('ROLLBACK');
        return 'limite';
      }
      // Readicionar o mesmo CAR atualiza com a consulta mais nova.
      const { rows } = await cliente.query(
        `INSERT INTO imovel_monitorado
           (usuario_id, cod_car, apelido, situacao_car, modulos_fiscais, uso_coletivo, geojson, resultado, ultima_consulta_id, verificado_em)
         SELECT $2::uuid, c.cod_car, $3,
                c.evidencias #>> '{imovel,situacaoCar}',
                (c.evidencias #>> '{imovel,modulosFiscais}')::numeric,
                coalesce((c.evidencias #>> '{imovel,usoColetivo}')::boolean, false),
                ST_AsGeoJSON(c.geom)::jsonb, c.resultado, c.id, c.criada_em
           FROM consulta c WHERE c.id = $1
         ON CONFLICT (usuario_id, cod_car) DO UPDATE SET
           apelido = coalesce(EXCLUDED.apelido, imovel_monitorado.apelido),
           situacao_car = EXCLUDED.situacao_car, modulos_fiscais = EXCLUDED.modulos_fiscais,
           uso_coletivo = EXCLUDED.uso_coletivo, geojson = coalesce(EXCLUDED.geojson, imovel_monitorado.geojson),
           resultado = EXCLUDED.resultado, ultima_consulta_id = EXCLUDED.ultima_consulta_id,
           verificado_em = EXCLUDED.verificado_em
         RETURNING id`,
        [consultaId, usuarioId, apelido?.trim() || null],
      );
      await cliente.query('COMMIT');
      return (await this.listar(usuarioId)).find((i) => i.id === rows[0].id)!;
    } catch (e) {
      await cliente.query('ROLLBACK');
      throw e;
    } finally {
      cliente.release();
    }
  }

  async listar(usuarioId: string): Promise<ImovelCarteira[]> {
    const { rows } = await this.pool.query(
      `SELECT i.id, i.cod_car, i.apelido, i.verificado_em, i.criado_em, i.resultado, i.ultima_consulta_id,
              (SELECT count(*)::int FROM aviso a WHERE a.imovel_id = i.id AND a.lido_em IS NULL) AS nao_lidos
         FROM imovel_monitorado i WHERE i.usuario_id = $1
        ORDER BY nao_lidos DESC, i.criado_em DESC`,
      [usuarioId],
    );
    return rows.map((r) => ({
      id: r.id,
      codCar: r.cod_car,
      apelido: r.apelido ?? undefined,
      verificadoEm: r.verificado_em.toISOString(),
      criadoEm: r.criado_em.toISOString(),
      resultado: r.resultado,
      ultimaConsultaId: r.ultima_consulta_id ?? undefined,
      avisosNaoLidos: r.nao_lidos,
    }));
  }

  async remover(usuarioId: string, id: string): Promise<boolean> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
    const { rowCount } = await this.pool.query('DELETE FROM imovel_monitorado WHERE id = $1 AND usuario_id = $2', [id, usuarioId]);
    return (rowCount ?? 0) > 0;
  }

  async avisos(usuarioId: string, limite = 50): Promise<Aviso[]> {
    const { rows } = await this.pool.query(
      `SELECT a.id, a.imovel_id, i.cod_car, i.apelido, a.consulta_id, a.alteracoes, a.criado_em, a.lido_em
         FROM aviso a JOIN imovel_monitorado i ON i.id = a.imovel_id
        WHERE a.usuario_id = $1 ORDER BY a.criado_em DESC LIMIT $2`,
      [usuarioId, limite],
    );
    return rows.map((r) => ({
      id: r.id,
      imovelId: r.imovel_id,
      codCar: r.cod_car,
      apelido: r.apelido ?? undefined,
      consultaId: r.consulta_id ?? undefined,
      alteracoes: r.alteracoes,
      criadoEm: r.criado_em.toISOString(),
      lido: r.lido_em != null,
    }));
  }

  async marcarAvisosLidos(usuarioId: string) {
    await this.pool.query('UPDATE aviso SET lido_em = now() WHERE usuario_id = $1 AND lido_em IS NULL', [usuarioId]);
  }

  async avisosNaoLidos(usuarioId: string): Promise<number> {
    const { rows } = await this.pool.query('SELECT count(*)::int AS n FROM aviso WHERE usuario_id = $1 AND lido_em IS NULL', [usuarioId]);
    return rows[0].n;
  }

  // ---- usado pelo monitor diário ----

  async paraMonitorar(): Promise<ImovelParaMonitorar[]> {
    const { rows } = await this.pool.query(
      `SELECT id, usuario_id, cod_car, situacao_car, modulos_fiscais, uso_coletivo, geojson, resultado
         FROM imovel_monitorado ORDER BY usuario_id, criado_em`,
    );
    return rows.map((r) => ({
      id: r.id,
      usuarioId: r.usuario_id,
      codCar: r.cod_car,
      situacaoCar: r.situacao_car ?? undefined,
      modulosFiscais: r.modulos_fiscais == null ? undefined : Number(r.modulos_fiscais),
      usoColetivo: r.uso_coletivo,
      geometria: r.geojson ?? undefined,
      resultado: r.resultado,
    }));
  }

  async registrarVerificacao(id: string, resultado: ResultadoConsulta, consultaId?: string) {
    await this.pool.query(
      `UPDATE imovel_monitorado SET verificado_em = now(), resultado = $2,
              ultima_consulta_id = coalesce($3, ultima_consulta_id)
        WHERE id = $1`,
      [id, resultado, consultaId ?? null],
    );
  }

  async criarAviso(usuarioId: string, imovelId: string, consultaId: string, alteracoes: Alteracao[]) {
    await this.pool.query('INSERT INTO aviso (usuario_id, imovel_id, consulta_id, alteracoes) VALUES ($1, $2, $3, $4)', [
      usuarioId,
      imovelId,
      consultaId,
      JSON.stringify(alteracoes),
    ]);
  }

  /** Avisos ainda não mandados por e-mail, agrupados por usuário. */
  async avisosParaEmail(): Promise<{ usuarioId: string; nome: string; email: string; avisos: Aviso[] }[]> {
    const { rows } = await this.pool.query(
      `SELECT a.id, a.usuario_id, u.nome, u.email, a.imovel_id, i.cod_car, i.apelido, a.consulta_id, a.alteracoes, a.criado_em
         FROM aviso a JOIN usuario u ON u.id = a.usuario_id JOIN imovel_monitorado i ON i.id = a.imovel_id
        WHERE a.emailado_em IS NULL AND u.email_confirmado_em IS NOT NULL
        ORDER BY a.usuario_id, a.criado_em`,
    );
    const porUsuario = new Map<string, { usuarioId: string; nome: string; email: string; avisos: Aviso[] }>();
    for (const r of rows) {
      const grupo = porUsuario.get(r.usuario_id) ?? { usuarioId: r.usuario_id, nome: r.nome, email: r.email, avisos: [] as Aviso[] };
      grupo.avisos.push({
        id: r.id,
        imovelId: r.imovel_id,
        codCar: r.cod_car,
        apelido: r.apelido ?? undefined,
        consultaId: r.consulta_id ?? undefined,
        alteracoes: r.alteracoes,
        criadoEm: r.criado_em.toISOString(),
        lido: false,
      });
      porUsuario.set(r.usuario_id, grupo);
    }
    return [...porUsuario.values()];
  }

  async marcarEmailados(ids: string[]) {
    await this.pool.query('UPDATE aviso SET emailado_em = now() WHERE id = ANY($1)', [ids]);
  }
}
