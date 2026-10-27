import pg from 'pg';
import { VALIDADE_RESERVA_MS, type Cupom, type DadosCupom, type RepositorioCupons, type ResumoCupom, type UsoCupom } from './tipos.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RESERVA = `${VALIDADE_RESERVA_MS / 1000} seconds`;
/** Uso que conta no limite: pago, ou reservado há menos de 3 dias. */
const CONTA = `(status = 'usado' OR (status = 'reservado' AND criado_em > now() - interval '${RESERVA}'))`;

const dataIso = (v: unknown) => (v ? (v as Date).toISOString() : undefined);
// Coluna date: o pg devolve Date à meia-noite local; o texto AAAA-MM-DD vem com to_char no SELECT.
const COLUNAS = `id, codigo, descricao, tipo, valor, alvos, meses, limite_usos, limite_por_conta, apenas_novos,
  to_char(valido_de, 'YYYY-MM-DD') AS valido_de, to_char(valido_ate, 'YYYY-MM-DD') AS valido_ate, ativo, criado_em, atualizado_em`;

function cupom(r: Record<string, unknown>): Cupom {
  return {
    id: r.id as string,
    codigo: r.codigo as string,
    descricao: r.descricao as string,
    tipo: r.tipo as Cupom['tipo'],
    valor: Number(r.valor),
    alvos: (r.alvos as string[]) ?? [],
    meses: (r.meses as number) ?? null,
    limiteUsos: (r.limite_usos as number) ?? null,
    limitePorConta: r.limite_por_conta as number,
    apenasNovos: r.apenas_novos as boolean,
    validoDe: (r.valido_de as string) ?? null,
    validoAte: (r.valido_ate as string) ?? null,
    ativo: r.ativo as boolean,
    criadoEm: dataIso(r.criado_em)!,
    atualizadoEm: dataIso(r.atualizado_em)!,
  };
}

function uso(r: Record<string, unknown>): UsoCupom {
  return {
    id: r.id as string,
    cupomId: r.cupom_id as string,
    usuarioId: r.usuario_id as string,
    pedidoId: (r.pedido_id as string) ?? undefined,
    assinaturaId: (r.assinatura_id as string) ?? undefined,
    item: r.item as string,
    nomeItem: r.nome_item as string,
    valorOriginal: Number(r.valor_original),
    valorFinal: Number(r.valor_final),
    meses: (r.meses as number) ?? null,
    mensalidadesPagas: r.mensalidades_pagas as number,
    descontoEncerradoEm: dataIso(r.desconto_encerrado_em),
    status: r.status as UsoCupom['status'],
    criadoEm: dataIso(r.criado_em)!,
    usadoEm: dataIso(r.usado_em),
  };
}

const parametros = (d: DadosCupom) => [
  d.codigo,
  d.descricao,
  d.tipo,
  d.valor,
  d.alvos,
  d.meses,
  d.limiteUsos,
  d.limitePorConta,
  d.apenasNovos,
  d.validoDe,
  d.validoAte,
  d.ativo,
];

export class RepositorioCuponsPostgres implements RepositorioCupons {
  constructor(private pool: pg.Pool) {}

  async listar(): Promise<ResumoCupom[]> {
    // Compra avulsa conta uma vez; assinatura, cada mensalidade paga com desconto.
    const { rows } = await this.pool.query(`
      SELECT c.id, c.codigo, c.descricao, c.tipo, c.valor, c.alvos, c.meses, c.limite_usos, c.limite_por_conta, c.apenas_novos,
             to_char(c.valido_de, 'YYYY-MM-DD') AS valido_de, to_char(c.valido_ate, 'YYYY-MM-DD') AS valido_ate,
             c.ativo, c.criado_em, c.atualizado_em,
             coalesce(u.usados, 0)::int AS usados, coalesce(u.reservados, 0)::int AS reservados,
             coalesce(u.desconto, 0) AS desconto, coalesce(u.receita, 0) AS receita
        FROM cupom c
        LEFT JOIN LATERAL (
          SELECT count(*) FILTER (WHERE status = 'usado') AS usados,
                 count(*) FILTER (WHERE status = 'reservado' AND criado_em > now() - interval '${RESERVA}') AS reservados,
                 sum((valor_original - valor_final) * CASE WHEN pedido_id IS NOT NULL THEN 1 ELSE mensalidades_pagas END)
                   FILTER (WHERE status = 'usado') AS desconto,
                 sum(valor_final * CASE WHEN pedido_id IS NOT NULL THEN 1 ELSE mensalidades_pagas END)
                   FILTER (WHERE status = 'usado') AS receita
            FROM cupom_uso WHERE cupom_id = c.id
        ) u ON true
       ORDER BY c.criado_em DESC`);
    return rows.map((r) => ({
      ...cupom(r),
      usados: r.usados,
      reservados: r.reservados,
      descontoConcedido: Number(r.desconto),
      receita: Number(r.receita),
    }));
  }

  async buscar(id: string) {
    if (!UUID.test(id)) return null;
    const { rows } = await this.pool.query(`SELECT ${COLUNAS} FROM cupom WHERE id = $1`, [id]);
    return rows[0] ? cupom(rows[0]) : null;
  }

  async buscarPorCodigo(codigo: string) {
    const { rows } = await this.pool.query(`SELECT ${COLUNAS} FROM cupom WHERE codigo = $1`, [codigo]);
    return rows[0] ? cupom(rows[0]) : null;
  }

  async criar(dados: DadosCupom, adminId: string) {
    try {
      const { rows } = await this.pool.query(
        `INSERT INTO cupom (codigo, descricao, tipo, valor, alvos, meses, limite_usos, limite_por_conta, apenas_novos, valido_de, valido_ate, ativo, criado_por)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
        [...parametros(dados), adminId],
      );
      return (await this.buscar(rows[0].id))!;
    } catch (e) {
      if ((e as { code?: string }).code === '23505') return 'codigo_existe' as const;
      throw e;
    }
  }

  async atualizar(id: string, dados: DadosCupom) {
    if (!UUID.test(id)) return null;
    try {
      const { rowCount } = await this.pool.query(
        `UPDATE cupom SET codigo = $1, descricao = $2, tipo = $3, valor = $4, alvos = $5, meses = $6, limite_usos = $7,
                limite_por_conta = $8, apenas_novos = $9, valido_de = $10, valido_ate = $11, ativo = $12, atualizado_em = now()
          WHERE id = $13`,
        [...parametros(dados), id],
      );
      return rowCount ? this.buscar(id) : null;
    } catch (e) {
      if ((e as { code?: string }).code === '23505') return 'codigo_existe' as const;
      throw e;
    }
  }

  async apagar(id: string) {
    if (!UUID.test(id)) return null;
    const { rows } = await this.pool.query('SELECT 1 FROM cupom_uso WHERE cupom_id = $1 LIMIT 1', [id]);
    if (rows.length) return 'tem_usos' as const;
    const { rowCount } = await this.pool.query('DELETE FROM cupom WHERE id = $1', [id]);
    return rowCount ? ('ok' as const) : null;
  }

  async contarUsos(cupomId: string, usuarioId?: string) {
    const { rows } = await this.pool.query(
      // As reservas da própria conta não contam: uma cobrança nova com o cupom libera a antiga.
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE usuario_id = $2)::int AS da_conta
         FROM cupom_uso WHERE cupom_id = $1 AND ${CONTA} AND NOT (usuario_id IS NOT DISTINCT FROM $2 AND status = 'reservado')`,
      [cupomId, usuarioId ?? null],
    );
    return { total: rows[0].total, daConta: rows[0].da_conta };
  }

  async reservar(c: Cupom, u: Parameters<RepositorioCupons['reservar']>[1]) {
    const cliente = await this.pool.connect();
    try {
      await cliente.query('BEGIN');
      // Trava o cupom: duas compras no último uso disponível esperam uma pela outra.
      await cliente.query('SELECT 1 FROM cupom WHERE id = $1 FOR UPDATE', [c.id]);
      // As reservas antigas desta conta vão ser liberadas: não contam contra ela.
      const { rows } = await cliente.query(
        `SELECT count(*)::int AS total, count(*) FILTER (WHERE usuario_id = $2)::int AS da_conta
           FROM cupom_uso WHERE cupom_id = $1 AND ${CONTA} AND NOT (usuario_id = $2 AND status = 'reservado')`,
        [c.id, u.usuarioId],
      );
      if (c.limiteUsos != null && rows[0].total >= c.limiteUsos) {
        await cliente.query('ROLLBACK');
        return 'esgotado' as const;
      }
      if (rows[0].da_conta >= c.limitePorConta) {
        await cliente.query('ROLLBACK');
        return 'limite_conta' as const;
      }
      await cliente.query(`UPDATE cupom_uso SET status = 'liberado' WHERE cupom_id = $1 AND usuario_id = $2 AND status = 'reservado'`, [
        c.id,
        u.usuarioId,
      ]);
      const { rows: novo } = await cliente.query(
        `INSERT INTO cupom_uso (cupom_id, usuario_id, pedido_id, assinatura_id, item, nome_item, valor_original, valor_final, meses)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [c.id, u.usuarioId, u.pedidoId ?? null, u.assinaturaId ?? null, u.item, u.nomeItem, u.valorOriginal, u.valorFinal, u.meses],
      );
      await cliente.query('COMMIT');
      return uso(novo[0]);
    } catch (e) {
      await cliente.query('ROLLBACK');
      throw e;
    } finally {
      cliente.release();
    }
  }

  async porPedido(pedidoId: string) {
    if (!UUID.test(pedidoId)) return null;
    const { rows } = await this.pool.query('SELECT * FROM cupom_uso WHERE pedido_id = $1', [pedidoId]);
    return rows[0] ? uso(rows[0]) : null;
  }

  async porAssinatura(assinaturaId: string) {
    if (!UUID.test(assinaturaId)) return null;
    const { rows } = await this.pool.query('SELECT * FROM cupom_uso WHERE assinatura_id = $1', [assinaturaId]);
    return rows[0] ? uso(rows[0]) : null;
  }

  async buscarUso(id: string) {
    if (!UUID.test(id)) return null;
    const { rows } = await this.pool.query('SELECT * FROM cupom_uso WHERE id = $1', [id]);
    return rows[0] ? uso(rows[0]) : null;
  }

  async atualizarUso(id: string, d: Parameters<RepositorioCupons['atualizarUso']>[1]) {
    await this.pool.query(
      `UPDATE cupom_uso SET status = coalesce($2, status),
              usado_em = CASE WHEN $2 = 'usado' AND status <> 'usado' THEN now() ELSE usado_em END,
              mensalidades_pagas = coalesce($3, mensalidades_pagas),
              desconto_encerrado_em = CASE WHEN $4 THEN coalesce(desconto_encerrado_em, now()) ELSE desconto_encerrado_em END
        WHERE id = $1`,
      [id, d.status ?? null, d.mensalidadesPagas ?? null, d.encerrarDesconto ?? false],
    );
  }

  async usos(cupomId: string) {
    if (!UUID.test(cupomId)) return [];
    const { rows } = await this.pool.query(
      `SELECT cu.*, u.email, u.nome FROM cupom_uso cu JOIN usuario u ON u.id = cu.usuario_id
        WHERE cu.cupom_id = $1 ORDER BY cu.criado_em DESC LIMIT 500`,
      [cupomId],
    );
    return rows.map((r) => ({ ...uso(r), email: r.email as string, nome: r.nome as string }));
  }
}
