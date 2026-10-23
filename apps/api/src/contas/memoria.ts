import { randomUUID } from 'node:crypto';
import type { Lancamento, Pedido, RepositorioContas, Saldo, TipoCredito, Usuario } from './tipos.js';

/**
 * Contas em memória, só para desenvolvimento e testes (APTO_DEMO=1 sem banco).
 * Tudo se perde ao reiniciar a API.
 */
export class RepositorioContasMemoria implements RepositorioContas {
  private usuarios = new Map<string, Usuario & { senhaHash: string }>();
  private sessoes = new Map<string, { usuarioId: string; expiraEm: Date }>();
  private lancamentos: (Lancamento & { criadoEm: Date })[] = [];
  private pedidos = new Map<string, Pedido>();
  private eventos = new Set<string>();

  async criarUsuario(u: Omit<Usuario, 'id'> & { senhaHash: string }) {
    const email = u.email.toLowerCase();
    if ([...this.usuarios.values()].some((x) => x.email === email)) return 'email_existe' as const;
    const novo = { ...u, email, id: randomUUID() };
    this.usuarios.set(novo.id, novo);
    const { senhaHash: _, ...publico } = novo;
    return publico;
  }

  async buscarPorEmail(email: string) {
    return [...this.usuarios.values()].find((u) => u.email === email.toLowerCase()) ?? null;
  }

  async definirClientePagamento(usuarioId: string, clienteId: string) {
    const u = this.usuarios.get(usuarioId);
    if (u) u.pagamentoClienteId = clienteId;
  }

  async criarSessao(usuarioId: string, tokenHash: string, expiraEm: Date) {
    this.sessoes.set(tokenHash, { usuarioId, expiraEm });
  }

  async usuarioDaSessao(tokenHash: string) {
    const s = this.sessoes.get(tokenHash);
    if (!s || s.expiraEm <= new Date()) return null;
    const u = this.usuarios.get(s.usuarioId);
    if (!u) return null;
    const { senhaHash: _, ...publico } = u;
    return publico;
  }

  async apagarSessao(tokenHash: string) {
    this.sessoes.delete(tokenHash);
  }

  async saldo(usuarioId: string): Promise<Saldo> {
    const saldo: Saldo = { consulta: 0, dossie: 0 };
    for (const l of this.lancamentos) if (l.usuarioId === usuarioId) saldo[l.tipo] += l.quantidade;
    return saldo;
  }

  async lancar(l: Lancamento) {
    if (this.lancamentos.some((x) => x.referencia === l.referencia)) return false;
    this.lancamentos.push({ ...l, criadoEm: new Date() });
    return true;
  }

  async debitar(usuarioId: string, tipo: TipoCredito, motivo: string, referencia: string) {
    if ((await this.saldo(usuarioId))[tipo] < 1) return false;
    return this.lancar({ usuarioId, tipo, quantidade: -1, motivo, referencia });
  }

  async criarPedido(p: Omit<Pedido, 'id' | 'status' | 'criadoEm'>) {
    const novo: Pedido = { ...p, id: randomUUID(), status: 'pendente', criadoEm: new Date().toISOString() };
    this.pedidos.set(novo.id, novo);
    return novo;
  }

  async atualizarPedido(id: string, d: Partial<Pick<Pedido, 'provedorId' | 'link' | 'status'>>) {
    const p = this.pedidos.get(id);
    if (p) Object.assign(p, Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined)));
  }

  async buscarPedido(id: string) {
    return this.pedidos.get(id) ?? null;
  }

  async buscarPedidoPorProvedor(provedorId: string) {
    return [...this.pedidos.values()].find((p) => p.provedorId === provedorId) ?? null;
  }

  async pedidosDoUsuario(usuarioId: string) {
    return [...this.pedidos.values()].filter((p) => p.usuarioId === usuarioId).reverse();
  }

  async registrarEvento(id: string) {
    if (this.eventos.has(id)) return false;
    this.eventos.add(id);
    return true;
  }
}
