import type { Pedido, RepositorioContas, TipoCredito } from '../contas/tipos.js';
import { PRODUTOS_PADRAO } from '../produtos.js';
import type { EventoPagamento } from './tipos.js';

/** Créditos do pedido: os fixados na compra; pedidos antigos usam o pacote padrão. */
function creditosDoPedido(pedido: Pedido) {
  if (pedido.creditos) return { creditos: pedido.creditos, nome: pedido.nomeProduto ?? pedido.produto };
  const p = PRODUTOS_PADRAO.find((x) => x.id === pedido.produto);
  if (!p) throw new Error(`Pedido ${pedido.id} sem créditos e com pacote desconhecido: ${pedido.produto}`);
  return { creditos: p.creditos, nome: p.nome };
}

/**
 * Aplica um evento de pagamento ao pedido. Idempotente: cada lançamento tem
 * referência única (pedido:<id>:<tipo> / estorno:<id>:<tipo>).
 */
export async function aplicarEvento(contas: RepositorioContas, pedido: Pedido, tipo: EventoPagamento['tipo']): Promise<void> {
  const { creditos, nome } = creditosDoPedido(pedido);
  const tipos = Object.entries(creditos).filter(([, q]) => q > 0) as [TipoCredito, number][];

  if (tipo === 'pago' && pedido.status !== 'estornado') {
    for (const [t, q] of tipos) {
      await contas.lancar({ usuarioId: pedido.usuarioId, tipo: t, quantidade: q, motivo: `Compra: ${nome}`, referencia: `pedido:${pedido.id}:${t}` });
    }
    if (pedido.status !== 'pago') await contas.atualizarPedido(pedido.id, { status: 'pago' });
  } else if (tipo === 'estornado' && pedido.status === 'pago') {
    // O saldo pode ficar negativo: novas consultas param até regularizar.
    for (const [t, q] of tipos) {
      await contas.lancar({ usuarioId: pedido.usuarioId, tipo: t, quantidade: -q, motivo: `Estorno: ${nome}`, referencia: `estorno:${pedido.id}:${t}` });
    }
    await contas.atualizarPedido(pedido.id, { status: 'estornado' });
  } else if (tipo === 'cancelado' && pedido.status === 'pendente') {
    await contas.atualizarPedido(pedido.id, { status: 'cancelado' });
  }
}
