import { FONTES, type FonteId } from '@apto/regras';
import pg from 'pg';

/** Dias sem conferência até a base ser considerada atrasada (agenda dos coletores). */
export const PRAZO_BASE_DIAS: Partial<Record<FonteId, number>> = {
  ibama_embargos: 3,
  mma_lista_mcr: 3,
  funai_ti: 3,
  mte_empregadores: 3,
  cnuc: 10,
  sfb_cnfp: 10,
};

export interface SaudeBase {
  fonteId: FonteId;
  nome: string;
  registros: number | null;
  referencia: string | null;
  conferidoEm: string | null;
  diasSemConferir: number | null;
  situacao: 'em_dia' | 'atrasada' | 'nao_carregada';
}

const dia = (d: Date | null) => (d ? d.toISOString() : null);

export class RepositorioAdmin {
  constructor(private pool: pg.Pool) {}

  async resumo() {
    const { rows } = await this.pool.query(`
      SELECT
        (SELECT count(*) FROM usuario)::int AS usuarios,
        (SELECT count(*) FROM usuario WHERE email_confirmado_em IS NOT NULL)::int AS confirmados,
        (SELECT count(*) FROM usuario WHERE criado_em > now() - interval '7 days')::int AS usuarios_7d,
        (SELECT count(*) FROM consulta WHERE usuario_id IS NOT NULL AND criada_em::date = current_date)::int AS consultas_hoje,
        (SELECT count(*) FROM consulta WHERE usuario_id IS NOT NULL AND criada_em > now() - interval '7 days')::int AS consultas_7d,
        (SELECT count(*) FROM consulta WHERE usuario_id IS NOT NULL AND criada_em > now() - interval '30 days')::int AS consultas_30d,
        (SELECT coalesce(sum(valor), 0) FROM pedido WHERE status = 'pago' AND pago_em > now() - interval '30 days') AS receita_30d,
        (SELECT coalesce(sum(valor), 0) FROM pedido WHERE status = 'pago') AS receita_total,
        (SELECT count(*) FROM pedido WHERE status = 'pendente')::int AS pedidos_pendentes,
        (SELECT coalesce(sum(quantidade), 0) FROM credito_lancamento WHERE tipo = 'consulta')::int AS creditos_consulta,
        (SELECT coalesce(sum(quantidade), 0) FROM credito_lancamento WHERE tipo = 'dossie')::int AS creditos_dossie,
        (SELECT count(*) FROM imovel_monitorado)::int AS imoveis_carteira,
        (SELECT count(*) FROM aviso WHERE criado_em > now() - interval '7 days')::int AS avisos_7d,
        (SELECT count(*) FROM erro_registro WHERE quando > now() - interval '24 hours')::int AS erros_24h
    `);
    const r = rows[0];
    return {
      usuarios: r.usuarios,
      confirmados: r.confirmados,
      usuarios7d: r.usuarios_7d,
      consultasHoje: r.consultas_hoje,
      consultas7d: r.consultas_7d,
      consultas30d: r.consultas_30d,
      receita30d: Number(r.receita_30d),
      receitaTotal: Number(r.receita_total),
      pedidosPendentes: r.pedidos_pendentes,
      creditosEmCirculacao: { consulta: r.creditos_consulta, dossie: r.creditos_dossie },
      imoveisCarteira: r.imoveis_carteira,
      avisos7d: r.avisos_7d,
      erros24h: r.erros_24h,
    };
  }

  async saudeBases(): Promise<SaudeBase[]> {
    const { rows } = await this.pool.query(
      `SELECT fonte_id, registros, referencia_em, conferido_em,
              extract(epoch FROM now() - conferido_em) / 86400 AS dias
         FROM fonte_carga WHERE ativa`,
    );
    const porFonte = new Map(rows.map((r) => [r.fonte_id as FonteId, r]));
    return (Object.keys(PRAZO_BASE_DIAS) as FonteId[]).map((id) => {
      const r = porFonte.get(id);
      const dias = r?.dias == null ? null : Math.floor(Number(r.dias));
      return {
        fonteId: id,
        nome: FONTES[id].nome,
        registros: r?.registros ?? null,
        referencia: r?.referencia_em ? (r.referencia_em as Date).toISOString().slice(0, 10) : null,
        conferidoEm: dia(r?.conferido_em ?? null),
        diasSemConferir: dias,
        situacao: !r ? 'nao_carregada' : dias != null && dias > PRAZO_BASE_DIAS[id]! ? 'atrasada' : 'em_dia',
      };
    });
  }

  async usuarios(busca = '', limite = 100) {
    const { rows } = await this.pool.query(
      `SELECT u.id, u.nome, u.email, u.profissao, u.criado_em, u.email_confirmado_em IS NOT NULL AS confirmado,
              coalesce((SELECT sum(quantidade) FROM credito_lancamento c WHERE c.usuario_id = u.id AND c.tipo = 'consulta'), 0)::int AS saldo_consulta,
              coalesce((SELECT sum(quantidade) FROM credito_lancamento c WHERE c.usuario_id = u.id AND c.tipo = 'dossie'), 0)::int AS saldo_dossie,
              (SELECT count(*) FROM consulta q WHERE q.usuario_id = u.id)::int AS consultas,
              coalesce((SELECT sum(valor) FROM pedido p WHERE p.usuario_id = u.id AND p.status = 'pago'), 0) AS pago
         FROM usuario u
        WHERE $1 = '' OR u.email ILIKE '%' || $1 || '%' OR u.nome ILIKE '%' || $1 || '%'
        ORDER BY u.criado_em DESC LIMIT $2`,
      [busca.trim(), limite],
    );
    return rows.map((r) => ({
      id: r.id,
      nome: r.nome,
      email: r.email,
      profissao: r.profissao ?? undefined,
      criadoEm: dia(r.criado_em),
      confirmado: r.confirmado,
      saldo: { consulta: r.saldo_consulta, dossie: r.saldo_dossie },
      consultas: r.consultas,
      pago: Number(r.pago),
    }));
  }

  async pedidos(limite = 100) {
    const { rows } = await this.pool.query(
      `SELECT p.id, p.produto, p.valor, p.status, p.provedor, p.criado_em, p.pago_em, u.email
         FROM pedido p JOIN usuario u ON u.id = p.usuario_id ORDER BY p.criado_em DESC LIMIT $1`,
      [limite],
    );
    return rows.map((r) => ({
      id: r.id,
      produto: r.produto,
      valor: Number(r.valor),
      status: r.status,
      provedor: r.provedor,
      email: r.email,
      criadoEm: dia(r.criado_em),
      pagoEm: dia(r.pago_em),
    }));
  }

  async erros(limite = 100) {
    const { rows } = await this.pool.query(
      `SELECT id, quando, origem, mensagem, detalhe, rota FROM erro_registro ORDER BY quando DESC LIMIT $1`,
      [limite],
    );
    return rows.map((r) => ({
      id: Number(r.id),
      quando: dia(r.quando),
      origem: r.origem,
      mensagem: r.mensagem,
      detalhe: r.detalhe ?? undefined,
      rota: r.rota ?? undefined,
    }));
  }
}
