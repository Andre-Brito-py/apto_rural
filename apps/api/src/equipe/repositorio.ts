import pg from 'pg';

/** Responsável paga e decide; administrador cuida da equipe; técnico usa. */
export type PapelEquipe = 'responsavel' | 'administrador' | 'tecnico';
export type PapelMembro = Exclude<PapelEquipe, 'responsavel'>;

/** Onde a pessoa está: a conta da equipe (do responsável) e o papel dela. */
export interface EquipeDoUsuario {
  equipeId: string;
  donoId: string;
  donoNome: string;
  papel: PapelEquipe;
}

export interface Membro {
  usuarioId: string;
  nome: string;
  email: string;
  papel: PapelEquipe;
  entrouEm: string;
  /** Consultas feitas por esta pessoa no mês corrente (fuso de Brasília). */
  consultasNoMes: number;
}

export interface ConvitePendente {
  id: string;
  email: string;
  papel: PapelMembro;
  criadoEm: string;
  expiraEm: string;
}

export interface Convite {
  id: string;
  equipeId: string;
  donoId: string;
  donoNome: string;
  email: string;
  papel: PapelMembro;
  situacao: 'pendente' | 'aceito' | 'cancelado' | 'vencido';
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const iso = (d: Date) => d.toISOString();

export class RepositorioEquipe {
  constructor(private pool: pg.Pool) {}

  async daPessoa(usuarioId: string): Promise<EquipeDoUsuario | null> {
    const { rows } = await this.pool.query(
      `SELECT e.id, e.dono_id, d.nome AS dono_nome, 'responsavel' AS papel
         FROM equipe e JOIN usuario d ON d.id = e.dono_id WHERE e.dono_id = $1
       UNION ALL
       SELECT e.id, e.dono_id, d.nome, m.papel
         FROM equipe_membro m JOIN equipe e ON e.id = m.equipe_id JOIN usuario d ON d.id = e.dono_id
        WHERE m.usuario_id = $1`,
      [usuarioId],
    );
    const r = rows[0];
    return r ? { equipeId: r.id, donoId: r.dono_id, donoNome: r.dono_nome, papel: r.papel } : null;
  }

  /** Ids de todos da equipe (responsável e membros): quem pode usar as consultas uns dos outros. */
  async pessoas(donoId: string): Promise<string[]> {
    const { rows } = await this.pool.query<{ id: string }>(
      `SELECT e.dono_id AS id FROM equipe e WHERE e.dono_id = $1
       UNION SELECT m.usuario_id FROM equipe_membro m JOIN equipe e ON e.id = m.equipe_id WHERE e.dono_id = $1`,
      [donoId],
    );
    return rows.length ? rows.map((r) => r.id) : [donoId];
  }

  /** Cria a equipe do responsável na primeira vez que ele convida alguém. */
  async garantir(donoId: string): Promise<string> {
    const { rows } = await this.pool.query<{ id: string }>(
      `INSERT INTO equipe (dono_id) VALUES ($1) ON CONFLICT (dono_id) DO UPDATE SET dono_id = EXCLUDED.dono_id RETURNING id`,
      [donoId],
    );
    return rows[0]!.id;
  }

  async membros(equipeId: string): Promise<Membro[]> {
    const { rows } = await this.pool.query(
      `WITH pessoas AS (
         SELECT e.dono_id AS usuario_id, 'responsavel' AS papel, e.criada_em AS entrou_em, 0 AS ordem FROM equipe e WHERE e.id = $1
         UNION ALL
         SELECT m.usuario_id, m.papel, m.entrou_em, CASE m.papel WHEN 'administrador' THEN 1 ELSE 2 END FROM equipe_membro m WHERE m.equipe_id = $1
       )
       SELECT p.usuario_id, u.nome, u.email, p.papel, p.entrou_em,
              (SELECT count(*)::int FROM consulta c
                WHERE c.usuario_id = p.usuario_id
                  AND c.criada_em >= date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo') AS no_mes
         FROM pessoas p JOIN usuario u ON u.id = p.usuario_id
        ORDER BY p.ordem, u.nome`,
      [equipeId],
    );
    return rows.map((r) => ({
      usuarioId: r.usuario_id,
      nome: r.nome,
      email: r.email,
      papel: r.papel,
      entrouEm: iso(r.entrou_em),
      consultasNoMes: r.no_mes,
    }));
  }

  /** Pessoas na equipe mais convites ainda válidos: é o que conta para o limite do plano. */
  async ocupacao(equipeId: string): Promise<number> {
    const { rows } = await this.pool.query(
      `SELECT 1 + (SELECT count(*) FROM equipe_membro WHERE equipe_id = $1)
                + (SELECT count(*) FROM convite_equipe
                    WHERE equipe_id = $1 AND aceito_em IS NULL AND cancelado_em IS NULL AND expira_em > now()) AS n`,
      [equipeId],
    );
    return Number(rows[0].n);
  }

  async convitesPendentes(equipeId: string): Promise<ConvitePendente[]> {
    const { rows } = await this.pool.query(
      `SELECT id, email, papel, criado_em, expira_em FROM convite_equipe
        WHERE equipe_id = $1 AND aceito_em IS NULL AND cancelado_em IS NULL AND expira_em > now()
        ORDER BY criado_em`,
      [equipeId],
    );
    return rows.map((r) => ({ id: r.id, email: r.email, papel: r.papel, criadoEm: iso(r.criado_em), expiraEm: iso(r.expira_em) }));
  }

  /**
   * Novo convite. Um convite vencido para o mesmo e-mail é substituído.
   * 'ja_convidado': já há um válido; 'ja_na_equipe': a pessoa já faz parte.
   */
  async convidar(
    equipeId: string,
    email: string,
    papel: PapelMembro,
    tokenHash: string,
    convidadoPor: string,
    expiraEm: Date,
  ): Promise<'ok' | 'ja_convidado' | 'ja_na_equipe'> {
    const emailMin = email.trim().toLowerCase();
    const { rows: ja } = await this.pool.query(
      `SELECT 1 FROM usuario u WHERE u.email = $2
          AND (u.id = (SELECT dono_id FROM equipe WHERE id = $1)
               OR EXISTS (SELECT 1 FROM equipe_membro m WHERE m.equipe_id = $1 AND m.usuario_id = u.id))`,
      [equipeId, emailMin],
    );
    if (ja[0]) return 'ja_na_equipe';
    await this.pool.query(
      `UPDATE convite_equipe SET cancelado_em = now()
        WHERE equipe_id = $1 AND email = $2 AND aceito_em IS NULL AND cancelado_em IS NULL AND expira_em <= now()`,
      [equipeId, emailMin],
    );
    try {
      await this.pool.query(
        `INSERT INTO convite_equipe (token_hash, equipe_id, email, papel, convidado_por, expira_em) VALUES ($1, $2, $3, $4, $5, $6)`,
        [tokenHash, equipeId, emailMin, papel, convidadoPor, expiraEm],
      );
      return 'ok';
    } catch (e) {
      if ((e as { code?: string }).code === '23505') return 'ja_convidado';
      throw e;
    }
  }

  async cancelarConvite(equipeId: string, conviteId: string): Promise<boolean> {
    if (!UUID.test(conviteId)) return false;
    const { rowCount } = await this.pool.query(
      `UPDATE convite_equipe SET cancelado_em = now() WHERE id = $1 AND equipe_id = $2 AND aceito_em IS NULL AND cancelado_em IS NULL`,
      [conviteId, equipeId],
    );
    return (rowCount ?? 0) > 0;
  }

  async convitePorToken(tokenHash: string): Promise<Convite | null> {
    const { rows } = await this.pool.query(
      `SELECT c.id, c.equipe_id, e.dono_id, d.nome AS dono_nome, c.email, c.papel,
              CASE WHEN c.aceito_em IS NOT NULL THEN 'aceito'
                   WHEN c.cancelado_em IS NOT NULL THEN 'cancelado'
                   WHEN c.expira_em <= now() THEN 'vencido'
                   ELSE 'pendente' END AS situacao
         FROM convite_equipe c JOIN equipe e ON e.id = c.equipe_id JOIN usuario d ON d.id = e.dono_id
        WHERE c.token_hash = $1`,
      [tokenHash],
    );
    const r = rows[0];
    return r
      ? { id: r.id, equipeId: r.equipe_id, donoId: r.dono_id, donoNome: r.dono_nome, email: r.email, papel: r.papel, situacao: r.situacao }
      : null;
  }

  /** Usa o convite (uma vez só) e coloca a pessoa na equipe, numa transação. */
  async aceitar(tokenHash: string, usuarioId: string): Promise<'ok' | 'invalido' | 'ja_em_equipe'> {
    const cliente = await this.pool.connect();
    try {
      await cliente.query('BEGIN');
      const { rows } = await cliente.query(
        `UPDATE convite_equipe SET aceito_em = now()
          WHERE token_hash = $1 AND aceito_em IS NULL AND cancelado_em IS NULL AND expira_em > now()
          RETURNING equipe_id, papel`,
        [tokenHash],
      );
      if (!rows[0]) {
        await cliente.query('ROLLBACK');
        return 'invalido';
      }
      // Equipe própria vazia (só o responsável) não impede: é desfeita.
      await cliente.query(
        `DELETE FROM equipe e WHERE e.dono_id = $1 AND NOT EXISTS (SELECT 1 FROM equipe_membro m WHERE m.equipe_id = e.id)`,
        [usuarioId],
      );
      const { rows: dono } = await cliente.query('SELECT 1 FROM equipe WHERE dono_id = $1', [usuarioId]);
      if (dono[0]) {
        await cliente.query('ROLLBACK');
        return 'ja_em_equipe';
      }
      const { rowCount } = await cliente.query(
        `INSERT INTO equipe_membro (equipe_id, usuario_id, papel) VALUES ($1, $2, $3) ON CONFLICT (usuario_id) DO NOTHING`,
        [rows[0].equipe_id, usuarioId, rows[0].papel],
      );
      if (!rowCount) {
        await cliente.query('ROLLBACK');
        return 'ja_em_equipe';
      }
      await cliente.query('COMMIT');
      return 'ok';
    } catch (e) {
      await cliente.query('ROLLBACK');
      throw e;
    } finally {
      cliente.release();
    }
  }

  async mudarPapel(equipeId: string, usuarioId: string, papel: PapelMembro): Promise<boolean> {
    const { rowCount } = await this.pool.query('UPDATE equipe_membro SET papel = $3 WHERE equipe_id = $1 AND usuario_id = $2', [
      equipeId,
      usuarioId,
      papel,
    ]);
    return (rowCount ?? 0) > 0;
  }

  async remover(equipeId: string, usuarioId: string): Promise<boolean> {
    if (!UUID.test(usuarioId)) return false;
    const { rowCount } = await this.pool.query('DELETE FROM equipe_membro WHERE equipe_id = $1 AND usuario_id = $2', [equipeId, usuarioId]);
    return (rowCount ?? 0) > 0;
  }

  /** Quem recebe também os e-mails de aviso da carteira: os administradores da equipe. */
  async administradores(donoId: string): Promise<{ nome: string; email: string }[]> {
    const { rows } = await this.pool.query(
      `SELECT u.nome, u.email FROM equipe e
         JOIN equipe_membro m ON m.equipe_id = e.id AND m.papel = 'administrador'
         JOIN usuario u ON u.id = m.usuario_id
        WHERE e.dono_id = $1 AND u.email_confirmado_em IS NOT NULL AND u.bloqueado_em IS NULL`,
      [donoId],
    );
    return rows;
  }
}
