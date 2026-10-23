import pg from 'pg';
import type { Lancamento, Pedido, RepositorioContas, Saldo, TipoCredito, Usuario } from './tipos.js';

const USUARIO = `id, nome, email, whatsapp, profissao, pagamento_cliente_id, email_confirmado_em, papel, bloqueado_em`;

function usuario(r: Record<string, unknown>): Usuario {
  return {
    id: r.id as string,
    nome: r.nome as string,
    email: r.email as string,
    whatsapp: (r.whatsapp as string) ?? undefined,
    profissao: (r.profissao as string) ?? undefined,
    pagamentoClienteId: (r.pagamento_cliente_id as string) ?? undefined,
    emailConfirmado: r.email_confirmado_em != null,
    papel: (r.papel as Usuario['papel']) ?? 'usuario',
    bloqueado: r.bloqueado_em != null,
    personificadoPor: (r.personificado_por as string) ?? undefined,
  };
}

function pedido(r: Record<string, unknown>): Pedido {
  return {
    id: r.id as string,
    usuarioId: r.usuario_id as string,
    produto: r.produto as string,
    valor: Number(r.valor),
    status: r.status as Pedido['status'],
    provedor: r.provedor as string,
    provedorId: (r.provedor_id as string) ?? undefined,
    link: (r.link as string) ?? undefined,
    criadoEm: (r.criado_em as Date).toISOString(),
  };
}

export class RepositorioContasPostgres implements RepositorioContas {
  constructor(private pool: pg.Pool) {}

  async buscarPorId(id: string) {
    const { rows } = await this.pool.query(`SELECT ${USUARIO} FROM usuario WHERE id = $1`, [id]);
    return rows[0] ? usuario(rows[0]) : null;
  }

  async confirmarEmail(usuarioId: string) {
    const { rowCount } = await this.pool.query(
      'UPDATE usuario SET email_confirmado_em = now() WHERE id = $1 AND email_confirmado_em IS NULL',
      [usuarioId],
    );
    return (rowCount ?? 0) > 0;
  }

  async definirSenha(usuarioId: string, senhaHash: string) {
    await this.pool.query('UPDATE usuario SET senha_hash = $2 WHERE id = $1', [usuarioId, senhaHash]);
  }

  async apagarSessoesDoUsuario(usuarioId: string) {
    await this.pool.query('DELETE FROM sessao WHERE usuario_id = $1', [usuarioId]);
  }

  async criarTokenEmail(usuarioId: string, tipo: 'confirmacao' | 'senha', tokenHash: string, expiraEm: Date) {
    await this.pool.query('INSERT INTO token_email (token_hash, usuario_id, tipo, expira_em) VALUES ($1, $2, $3, $4)', [
      tokenHash,
      usuarioId,
      tipo,
      expiraEm,
    ]);
  }

  async consumirTokenEmail(tokenHash: string, tipo: 'confirmacao' | 'senha') {
    // Atômico: dois cliques no mesmo link não usam o token duas vezes.
    const { rows } = await this.pool.query<{ usuario_id: string }>(
      `UPDATE token_email SET usado_em = now()
        WHERE token_hash = $1 AND tipo = $2 AND usado_em IS NULL AND expira_em > now()
        RETURNING usuario_id`,
      [tokenHash, tipo],
    );
    return rows[0]?.usuario_id ?? null;
  }

  async criarUsuario(u: Omit<Usuario, 'id' | 'emailConfirmado' | 'papel' | 'bloqueado' | 'personificadoPor'> & { senhaHash: string }) {
    const { rows } = await this.pool.query(
      `INSERT INTO usuario (nome, email, whatsapp, profissao, senha_hash, aceite_termos_em)
       VALUES ($1, lower($2), $3, $4, $5, now())
       ON CONFLICT (email) DO NOTHING
       RETURNING ${USUARIO}`,
      [u.nome, u.email, u.whatsapp ?? null, u.profissao ?? null, u.senhaHash],
    );
    return rows[0] ? usuario(rows[0]) : 'email_existe';
  }

  async buscarPorEmail(email: string) {
    const { rows } = await this.pool.query(`SELECT ${USUARIO}, senha_hash FROM usuario WHERE email = lower($1)`, [email]);
    return rows[0] ? { ...usuario(rows[0]), senhaHash: rows[0].senha_hash } : null;
  }

  async definirClientePagamento(usuarioId: string, clienteId: string) {
    await this.pool.query('UPDATE usuario SET pagamento_cliente_id = $2 WHERE id = $1', [usuarioId, clienteId]);
  }

  async criarSessao(usuarioId: string, tokenHash: string, expiraEm: Date, personificadoPor?: string) {
    await this.pool.query('INSERT INTO sessao (token_hash, usuario_id, expira_em, personificado_por) VALUES ($1, $2, $3, $4)', [
      tokenHash,
      usuarioId,
      expiraEm,
      personificadoPor ?? null,
    ]);
  }

  async usuarioDaSessao(tokenHash: string) {
    const { rows } = await this.pool.query(
      `SELECT ${USUARIO.split(', ').map((c) => `u.${c}`).join(', ')}, s.personificado_por
         FROM sessao s JOIN usuario u ON u.id = s.usuario_id
        WHERE s.token_hash = $1 AND s.expira_em > now()
          AND (u.bloqueado_em IS NULL OR s.personificado_por IS NOT NULL)`,
      [tokenHash],
    );
    return rows[0] ? usuario(rows[0]) : null;
  }

  async apagarSessao(tokenHash: string) {
    await this.pool.query('DELETE FROM sessao WHERE token_hash = $1', [tokenHash]);
  }

  async saldo(usuarioId: string): Promise<Saldo> {
    const { rows } = await this.pool.query<{ tipo: TipoCredito; total: string }>(
      'SELECT tipo, sum(quantidade) AS total FROM credito_lancamento WHERE usuario_id = $1 GROUP BY tipo',
      [usuarioId],
    );
    const saldo: Saldo = { consulta: 0, dossie: 0 };
    for (const r of rows) saldo[r.tipo] = Number(r.total);
    return saldo;
  }

  async lancar(l: Lancamento) {
    const { rowCount } = await this.pool.query(
      `INSERT INTO credito_lancamento (usuario_id, tipo, quantidade, motivo, referencia)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (referencia) DO NOTHING`,
      [l.usuarioId, l.tipo, l.quantidade, l.motivo, l.referencia],
    );
    return (rowCount ?? 0) > 0;
  }

  async debitar(usuarioId: string, tipo: TipoCredito, motivo: string, referencia: string) {
    const cliente = await this.pool.connect();
    try {
      await cliente.query('BEGIN');
      // Trava a conta: duas consultas simultâneas não gastam o mesmo crédito.
      await cliente.query('SELECT 1 FROM usuario WHERE id = $1 FOR UPDATE', [usuarioId]);
      const { rows } = await cliente.query(
        'SELECT coalesce(sum(quantidade), 0) AS total FROM credito_lancamento WHERE usuario_id = $1 AND tipo = $2',
        [usuarioId, tipo],
      );
      if (Number(rows[0].total) < 1) {
        await cliente.query('ROLLBACK');
        return false;
      }
      await cliente.query(
        `INSERT INTO credito_lancamento (usuario_id, tipo, quantidade, motivo, referencia) VALUES ($1, $2, -1, $3, $4)`,
        [usuarioId, tipo, motivo, referencia],
      );
      await cliente.query('COMMIT');
      return true;
    } catch (e) {
      await cliente.query('ROLLBACK');
      throw e;
    } finally {
      cliente.release();
    }
  }

  async criarPedido(p: Omit<Pedido, 'id' | 'status' | 'criadoEm'>) {
    const { rows } = await this.pool.query(
      `INSERT INTO pedido (usuario_id, produto, valor, provedor) VALUES ($1, $2, $3, $4) RETURNING *`,
      [p.usuarioId, p.produto, p.valor, p.provedor],
    );
    return pedido(rows[0]);
  }

  async atualizarPedido(id: string, d: Partial<Pick<Pedido, 'provedorId' | 'link' | 'status'>>) {
    await this.pool.query(
      `UPDATE pedido SET provedor_id = coalesce($2, provedor_id), link = coalesce($3, link),
              status = coalesce($4, status),
              pago_em = CASE WHEN $4 = 'pago' THEN now() ELSE pago_em END
        WHERE id = $1`,
      [id, d.provedorId ?? null, d.link ?? null, d.status ?? null],
    );
  }

  async buscarPedido(id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const { rows } = await this.pool.query('SELECT * FROM pedido WHERE id = $1', [id]);
    return rows[0] ? pedido(rows[0]) : null;
  }

  async buscarPedidoPorProvedor(provedorId: string) {
    const { rows } = await this.pool.query('SELECT * FROM pedido WHERE provedor_id = $1', [provedorId]);
    return rows[0] ? pedido(rows[0]) : null;
  }

  async pedidosDoUsuario(usuarioId: string) {
    const { rows } = await this.pool.query('SELECT * FROM pedido WHERE usuario_id = $1 ORDER BY criado_em DESC LIMIT 50', [usuarioId]);
    return rows.map(pedido);
  }

  async registrarEvento(id: string, provedor: string, payload: unknown) {
    const { rowCount } = await this.pool.query(
      'INSERT INTO webhook_evento (id, provedor, payload) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING',
      [id, provedor, payload],
    );
    return (rowCount ?? 0) > 0;
  }
}
