import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { DocumentoConferido } from './documentos.js';
import type { AnaliseNorma } from './normas.js';
import type { Rascunho } from './rascunhos.js';

/**
 * O que a IA produziu e fica guardado (docs/ia.md): documentos conferidos e rascunhos de
 * cada consulta, e as análises de norma do painel. Sem o arquivo enviado: só o resultado.
 * No banco quando houver; na memória no modo demonstração e nos testes.
 */
export type ItemApoio =
  | { id: string; tipo: 'documento'; regraId: string; dados: DocumentoConferido; criadoEm: string }
  | { id: string; tipo: 'rascunho'; regraId: string; dados: Rascunho; criadoEm: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class RepositorioApoio {
  private itens: (ItemApoio & { consultaId: string })[] = [];
  private analises: (AnaliseNorma & { id: string })[] = [];

  private demo: RepositorioApoio | null = null;

  constructor(private pool: pg.Pool | null) {}

  /** Consulta de exemplo (fictícia) não está no banco: o apoio dela fica na memória. */
  para(consulta: { demo: boolean }): RepositorioApoio {
    if (!consulta.demo || !this.pool) return this;
    return (this.demo ??= new RepositorioApoio(null));
  }

  async salvar(consultaId: string, tipo: ItemApoio['tipo'], regraId: string, dados: DocumentoConferido | Rascunho, usuarioId: string): Promise<ItemApoio> {
    if (!this.pool) {
      const item = { id: randomUUID(), consultaId, tipo, regraId, dados, criadoEm: new Date().toISOString() } as ItemApoio & { consultaId: string };
      this.itens.push(item);
      return item;
    }
    const { rows } = await this.pool.query(
      `INSERT INTO consulta_apoio (consulta_id, tipo, regra_id, dados, criado_por) VALUES ($1, $2, $3, $4, $5) RETURNING id, criado_em`,
      [consultaId, tipo, regraId, JSON.stringify(dados), usuarioId],
    );
    return { id: rows[0].id, tipo, regraId, dados, criadoEm: (rows[0].criado_em as Date).toISOString() } as ItemApoio;
  }

  async listar(consultaId: string): Promise<ItemApoio[]> {
    if (!this.pool) return this.itens.filter((i) => i.consultaId === consultaId).map(({ consultaId: _, ...i }) => i as ItemApoio);
    if (!UUID.test(consultaId)) return [];
    const { rows } = await this.pool.query(
      'SELECT id, tipo, regra_id, dados, criado_em FROM consulta_apoio WHERE consulta_id = $1 ORDER BY criado_em',
      [consultaId],
    );
    return rows.map((r) => ({ id: r.id, tipo: r.tipo, regraId: r.regra_id, dados: r.dados, criadoEm: (r.criado_em as Date).toISOString() }) as ItemApoio);
  }

  /** Apaga um item da consulta (o técnico tirou o documento ou o rascunho). */
  async apagar(consultaId: string, id: string): Promise<boolean> {
    if (!this.pool) {
      const antes = this.itens.length;
      this.itens = this.itens.filter((i) => !(i.consultaId === consultaId && i.id === id));
      return this.itens.length < antes;
    }
    if (!UUID.test(id) || !UUID.test(consultaId)) return false;
    const { rowCount } = await this.pool.query('DELETE FROM consulta_apoio WHERE id = $1 AND consulta_id = $2', [id, consultaId]);
    return (rowCount ?? 0) > 0;
  }

  async salvarAnalise(a: AnaliseNorma, usuarioId: string): Promise<AnaliseNorma & { id: string }> {
    if (!this.pool) {
      const nova = { ...a, id: randomUUID() };
      this.analises.unshift(nova);
      return nova;
    }
    const { rows } = await this.pool.query('INSERT INTO analise_norma (titulo, analise, criado_por) VALUES ($1, $2, $3) RETURNING id', [
      a.titulo,
      JSON.stringify(a),
      usuarioId,
    ]);
    return { ...a, id: rows[0].id };
  }

  async analisesRecentes(limite = 20): Promise<(AnaliseNorma & { id: string })[]> {
    if (!this.pool) return this.analises.slice(0, limite);
    const { rows } = await this.pool.query('SELECT id, analise FROM analise_norma ORDER BY criado_em DESC LIMIT $1', [limite]);
    return rows.map((r) => ({ ...(r.analise as AnaliseNorma), id: r.id }));
  }
}
