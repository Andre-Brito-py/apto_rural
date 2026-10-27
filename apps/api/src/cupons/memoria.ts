import { randomUUID } from 'node:crypto';
import type { RepositorioContas } from '../contas/tipos.js';
import { VALIDADE_RESERVA_MS, type Cupom, type DadosCupom, type RepositorioCupons, type ResumoCupom, type UsoCupom } from './tipos.js';

/** Cupons na memória (modo demonstração e testes). Mesmas regras do Postgres. */
export class RepositorioCuponsMemoria implements RepositorioCupons {
  private cupons = new Map<string, Cupom>();
  private usosLista: UsoCupom[] = [];

  constructor(private contas: RepositorioContas) {}

  private conta = (u: UsoCupom) => u.status === 'usado' || (u.status === 'reservado' && Date.now() - Date.parse(u.criadoEm) < VALIDADE_RESERVA_MS);

  async listar(): Promise<ResumoCupom[]> {
    return [...this.cupons.values()].reverse().map((c) => {
      const meus = this.usosLista.filter((u) => u.cupomId === c.id);
      const pagos = meus.filter((u) => u.status === 'usado');
      // Compra avulsa conta uma vez; assinatura, cada mensalidade paga com desconto.
      const vezes = (u: UsoCupom) => (u.pedidoId ? 1 : u.mensalidadesPagas);
      return {
        ...c,
        usados: pagos.length,
        reservados: meus.filter((u) => u.status === 'reservado' && this.conta(u)).length,
        descontoConcedido: Math.round(pagos.reduce((s, u) => s + (u.valorOriginal - u.valorFinal) * vezes(u), 0) * 100) / 100,
        receita: Math.round(pagos.reduce((s, u) => s + u.valorFinal * vezes(u), 0) * 100) / 100,
      };
    });
  }

  async buscar(id: string) {
    return this.cupons.get(id) ?? null;
  }

  async buscarPorCodigo(codigo: string) {
    return [...this.cupons.values()].find((c) => c.codigo === codigo) ?? null;
  }

  async criar(dados: DadosCupom) {
    if (await this.buscarPorCodigo(dados.codigo)) return 'codigo_existe' as const;
    const agora = new Date().toISOString();
    const c: Cupom = { ...dados, id: randomUUID(), criadoEm: agora, atualizadoEm: agora };
    this.cupons.set(c.id, c);
    return c;
  }

  async atualizar(id: string, dados: DadosCupom) {
    const c = this.cupons.get(id);
    if (!c) return null;
    const outro = await this.buscarPorCodigo(dados.codigo);
    if (outro && outro.id !== id) return 'codigo_existe' as const;
    const novo: Cupom = { ...c, ...dados, atualizadoEm: new Date().toISOString() };
    this.cupons.set(id, novo);
    return novo;
  }

  async apagar(id: string) {
    if (!this.cupons.has(id)) return null;
    if (this.usosLista.some((u) => u.cupomId === id)) return 'tem_usos' as const;
    this.cupons.delete(id);
    return 'ok' as const;
  }

  async contarUsos(cupomId: string, usuarioId?: string) {
    // As reservas da própria conta não contam: uma cobrança nova com o cupom libera a antiga.
    const validos = this.usosLista.filter(
      (u) => u.cupomId === cupomId && this.conta(u) && !(usuarioId && u.usuarioId === usuarioId && u.status === 'reservado'),
    );
    return { total: validos.length, daConta: usuarioId ? validos.filter((u) => u.usuarioId === usuarioId).length : 0 };
  }

  async reservar(cupom: Cupom, uso: Parameters<RepositorioCupons['reservar']>[1]) {
    // Sem await entre conferir e gravar: na memória isto já é atômico.
    const dela = (u: UsoCupom) => u.cupomId === cupom.id && u.usuarioId === uso.usuarioId && u.status === 'reservado';
    // As reservas antigas desta conta vão ser liberadas: não contam contra ela.
    const validos = this.usosLista.filter((u) => u.cupomId === cupom.id && this.conta(u) && !dela(u));
    if (cupom.limiteUsos != null && validos.length >= cupom.limiteUsos) return 'esgotado' as const;
    if (validos.filter((u) => u.usuarioId === uso.usuarioId).length >= cupom.limitePorConta) return 'limite_conta' as const;
    for (const u of this.usosLista) if (dela(u)) u.status = 'liberado';
    const novo: UsoCupom = { ...uso, id: randomUUID(), cupomId: cupom.id, mensalidadesPagas: 0, status: 'reservado', criadoEm: new Date().toISOString() };
    this.usosLista.push(novo);
    return { ...novo };
  }

  async porPedido(pedidoId: string) {
    const u = this.usosLista.find((x) => x.pedidoId === pedidoId);
    return u ? { ...u } : null;
  }

  async porAssinatura(assinaturaId: string) {
    const u = this.usosLista.find((x) => x.assinaturaId === assinaturaId);
    return u ? { ...u } : null;
  }

  async buscarUso(id: string) {
    const u = this.usosLista.find((x) => x.id === id);
    return u ? { ...u } : null;
  }

  async atualizarUso(id: string, d: Parameters<RepositorioCupons['atualizarUso']>[1]) {
    const u = this.usosLista.find((x) => x.id === id);
    if (!u) return;
    if (d.status) {
      if (d.status === 'usado' && u.status !== 'usado') u.usadoEm = new Date().toISOString();
      u.status = d.status;
    }
    if (d.mensalidadesPagas != null) u.mensalidadesPagas = d.mensalidadesPagas;
    if (d.encerrarDesconto && !u.descontoEncerradoEm) u.descontoEncerradoEm = new Date().toISOString();
  }

  async usos(cupomId: string) {
    const lista = this.usosLista.filter((u) => u.cupomId === cupomId).reverse();
    return Promise.all(
      lista.map(async (u) => {
        const dono = await this.contas.buscarPorId(u.usuarioId);
        return { ...u, email: dono?.email ?? '', nome: dono?.nome ?? '' };
      }),
    );
  }
}
