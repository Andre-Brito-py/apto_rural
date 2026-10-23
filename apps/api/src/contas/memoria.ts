import { randomUUID } from 'node:crypto';
import type { Assinatura, DadosDoTitular, Lancamento, Pedido, RepositorioContas, Saldo, TipoCredito, TipoTokenEmail, Usuario } from './tipos.js';

/**
 * Contas em memória, só para desenvolvimento e testes (APTO_DEMO=1 sem banco).
 * Tudo se perde ao reiniciar a API.
 */
export class RepositorioContasMemoria implements RepositorioContas {
  private usuarios = new Map<string, Usuario & { senhaHash: string }>();
  private sessoes = new Map<string, { usuarioId: string; expiraEm: Date; personificadoPor?: string }>();
  private lancamentos: (Lancamento & { criadoEm: Date })[] = [];
  private pedidos = new Map<string, Pedido>();
  private eventos = new Set<string>();
  private tokens = new Map<string, { usuarioId: string; tipo: TipoTokenEmail; expiraEm: Date; usado: boolean }>();

  async criarUsuario(u: Omit<Usuario, 'id' | 'emailConfirmado' | 'papel' | 'bloqueado' | 'personificadoPor'> & { senhaHash: string }) {
    const email = u.email.toLowerCase();
    if ([...this.usuarios.values()].some((x) => x.email === email)) return 'email_existe' as const;
    const novo: Usuario & { senhaHash: string } = { ...u, email, id: randomUUID(), emailConfirmado: false, papel: 'usuario', bloqueado: false };
    this.usuarios.set(novo.id, novo);
    const { senhaHash: _, ...publico } = novo;
    return publico;
  }

  async buscarPorId(id: string) {
    const u = this.usuarios.get(id);
    if (!u) return null;
    const { senhaHash: _, ...publico } = u;
    return publico;
  }

  async confirmarEmail(usuarioId: string) {
    const u = this.usuarios.get(usuarioId);
    if (!u || u.emailConfirmado) return false;
    u.emailConfirmado = true;
    return true;
  }

  async definirSenha(usuarioId: string, senhaHash: string) {
    const u = this.usuarios.get(usuarioId);
    if (u) u.senhaHash = senhaHash;
  }

  async apagarSessoesDoUsuario(usuarioId: string) {
    for (const [hash, s] of this.sessoes) if (s.usuarioId === usuarioId) this.sessoes.delete(hash);
  }

  async criarTokenEmail(usuarioId: string, tipo: TipoTokenEmail, tokenHash: string, expiraEm: Date) {
    this.tokens.set(tokenHash, { usuarioId, tipo, expiraEm, usado: false });
  }

  async consumirTokenEmail(tokenHash: string, tipo: TipoTokenEmail) {
    const t = this.tokens.get(tokenHash);
    if (!t || t.tipo !== tipo || t.usado || t.expiraEm <= new Date()) return null;
    t.usado = true;
    return t.usuarioId;
  }

  async buscarPorEmail(email: string) {
    return [...this.usuarios.values()].find((u) => u.email === email.toLowerCase()) ?? null;
  }

  async definirClientePagamento(usuarioId: string, clienteId: string) {
    const u = this.usuarios.get(usuarioId);
    if (u) u.pagamentoClienteId = clienteId;
  }

  async criarSessao(usuarioId: string, tokenHash: string, expiraEm: Date, personificadoPor?: string) {
    this.sessoes.set(tokenHash, { usuarioId, expiraEm, personificadoPor });
  }

  async usuarioDaSessao(tokenHash: string) {
    const s = this.sessoes.get(tokenHash);
    if (!s || s.expiraEm <= new Date()) return null;
    const u = this.usuarios.get(s.usuarioId);
    if (!u || (u.bloqueado && !s.personificadoPor)) return null;
    const { senhaHash: _, ...publico } = u;
    return { ...publico, personificadoPor: s.personificadoPor };
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

  private assinaturas = new Map<string, Assinatura>();

  async criarAssinatura(a: Omit<Assinatura, 'id' | 'status' | 'criadaEm' | 'ativadaEm' | 'canceladaEm'>) {
    if (await this.assinaturaAtual(a.usuarioId)) return 'ja_existe' as const;
    const nova: Assinatura = { ...a, id: randomUUID(), status: 'pendente', criadaEm: new Date().toISOString() };
    this.assinaturas.set(nova.id, nova);
    return nova;
  }

  async atualizarAssinatura(id: string, d: Partial<Pick<Assinatura, 'status' | 'provedorId' | 'link'>>) {
    const a = this.assinaturas.get(id);
    if (!a) return;
    Object.assign(a, Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined)));
    if (d.status === 'ativa' && !a.ativadaEm) a.ativadaEm = new Date().toISOString();
    if (d.status === 'cancelada') a.canceladaEm = new Date().toISOString();
  }

  async buscarAssinatura(id: string) {
    return this.assinaturas.get(id) ?? null;
  }

  async buscarAssinaturaPorProvedor(provedorId: string) {
    return [...this.assinaturas.values()].find((a) => a.provedorId === provedorId) ?? null;
  }

  async assinaturaAtual(usuarioId: string) {
    return [...this.assinaturas.values()].find((a) => a.usuarioId === usuarioId && a.status !== 'cancelada') ?? null;
  }

  async registrarEvento(id: string) {
    if (this.eventos.has(id)) return false;
    this.eventos.add(id);
    return true;
  }

  private emailsExcluidos = new Set<string>();

  async exportarDados(usuarioId: string): Promise<DadosDoTitular> {
    const u = await this.buscarPorId(usuarioId);
    const agora = new Date();
    return {
      conta: u ? { id: u.id, nome: u.nome, email: u.email, whatsapp: u.whatsapp, profissao: u.profissao, papel: u.papel } : {},
      creditos: this.lancamentos
        .filter((l) => l.usuarioId === usuarioId)
        .map(({ tipo, quantidade, motivo, criadoEm }) => ({ tipo, quantidade, motivo, criado_em: criadoEm })),
      pedidos: (await this.pedidosDoUsuario(usuarioId)).map(({ link: _, provedorId: __, ...p }) => p),
      assinaturas: [...this.assinaturas.values()].filter((a) => a.usuarioId === usuarioId).map(({ link: _, provedorId: __, ...a }) => a),
      consultas: [],
      carteira: [],
      avisos: [],
      sessoesAbertas: [...this.sessoes.values()]
        .filter((s) => s.usuarioId === usuarioId && s.expiraEm > agora)
        .map((s) => ({ expira_em: s.expiraEm, aberta_pelo_suporte: s.personificadoPor != null })),
    };
  }

  async excluirConta(usuarioId: string, emailHash: string) {
    this.emailsExcluidos.add(emailHash);
    for (const [hash, t] of this.tokens) if (t.usuarioId === usuarioId) this.tokens.delete(hash);
    for (const [hash, s] of this.sessoes) if (s.usuarioId === usuarioId || s.personificadoPor === usuarioId) this.sessoes.delete(hash);
    const u = this.usuarios.get(usuarioId);
    if (u) {
      Object.assign(u, { nome: 'Conta excluída', email: `excluida-${u.id}@excluida.invalid`, senhaHash: 'excluida', papel: 'usuario', bloqueado: true });
      delete u.whatsapp;
      delete u.profissao;
    }
  }

  async emailJaExcluido(emailHash: string) {
    return this.emailsExcluidos.has(emailHash);
  }
}
