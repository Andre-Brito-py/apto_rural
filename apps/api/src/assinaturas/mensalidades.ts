import type { Assinatura, Pedido, RepositorioContas } from '../contas/tipos.js';
import type { Contexto } from '../contexto.js';
import { aplicarEvento } from '../pagamentos/aplicar.js';
import type { EventoPagamento } from '../pagamentos/tipos.js';

/**
 * Cada mensalidade vira um pedido ligado à assinatura, com os créditos do
 * plano fixados na contratação. Idempotente pelo id da cobrança no provedor.
 */
export async function registrarMensalidade(
  contas: RepositorioContas,
  a: Assinatura,
  cobrancaProvedorId: string,
  valor?: number,
): Promise<Pedido> {
  const existente = await contas.buscarPedidoPorProvedor(cobrancaProvedorId);
  if (existente) return existente;
  return contas.criarPedido({
    usuarioId: a.usuarioId,
    produto: a.planoId,
    valor: valor ?? a.valorMensal,
    provedor: a.provedor,
    provedorId: cobrancaProvedorId,
    creditos: a.creditos,
    nomeProduto: `Assinatura ${a.nomePlano}`,
    assinaturaId: a.id,
  });
}

/**
 * Até quando vale o ano pago do plano anual: 12 meses a partir de hoje ou, se ainda havia
 * tempo do ano anterior (renovação paga antes de vencer), a partir do fim dele.
 */
export function proximaValidade(validaAte: string | undefined, agora = new Date()): string {
  const base = validaAte && new Date(validaAte) > agora ? new Date(validaAte) : agora;
  const fim = new Date(base);
  fim.setUTCFullYear(fim.getUTCFullYear() + 1);
  return fim.toISOString();
}

/**
 * Aplica um evento de cobrança de assinatura (vindo do webhook ou da simulação).
 * aoPagar roda uma vez por cobrança, quando ela é paga pela primeira vez (o Asaas
 * manda CONFIRMED e RECEIVED da mesma cobrança): conta os meses de desconto do cupom.
 * No plano anual, cada anuidade paga estende a validade em 12 meses.
 */
export async function aplicarEventoAssinatura(
  contas: RepositorioContas,
  a: Assinatura,
  evento: EventoPagamento,
  aoPagar?: (a: Assinatura) => Promise<void>,
): Promise<void> {
  if (evento.tipo === 'pago') {
    const pedido = await registrarMensalidade(contas, a, evento.provedorId, evento.valor);
    const primeiraVez = pedido.status !== 'pago' && pedido.status !== 'estornado';
    await aplicarEvento(contas, pedido, 'pago');
    if (primeiraVez && a.ciclo === 'anual') await contas.atualizarAssinatura(a.id, { validaAte: proximaValidade(a.validaAte) });
    if (primeiraVez && aoPagar) await aoPagar(a);
    // Pagou: volta a valer (inclusive depois de atraso). Cancelada continua cancelada.
    if (a.status !== 'cancelada') await contas.atualizarAssinatura(a.id, { status: 'ativa' });
  } else if (evento.tipo === 'atrasado') {
    if (a.status === 'ativa' || a.status === 'pendente') await contas.atualizarAssinatura(a.id, { status: 'inadimplente' });
  } else if (evento.tipo === 'estornado') {
    const pedido = await contas.buscarPedidoPorProvedor(evento.provedorId);
    if (pedido) await aplicarEvento(contas, pedido, 'estornado');
  }
}

/**
 * Plano anual com a renovação cancelada: quando o ano pago acaba, a assinatura é encerrada
 * (roda na reconferência diária). Devolve quantas foram encerradas.
 */
export async function encerrarAnuaisVencidas(contas: RepositorioContas, agora = new Date()): Promise<number> {
  const vencidas = await contas.anuaisVencidas(agora);
  for (const a of vencidas) await contas.atualizarAssinatura(a.id, { status: 'cancelada' });
  return vencidas.length;
}

/** Limite da carteira: o do plano para quem tem assinatura ativa; senão, o geral. */
export async function limiteCarteira(ctx: Contexto, usuarioId: string): Promise<number> {
  const a = await ctx.contas.assinaturaAtual(usuarioId);
  if (a?.status === 'ativa') return a.limiteCarteira;
  return (await ctx.config.obter()).limite_carteira;
}
