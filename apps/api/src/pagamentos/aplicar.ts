import type { Pedido, RepositorioContas, TipoCredito } from '../contas/tipos.js';
import { produto } from '../produtos.js';
import type { EventoPagamento } from './tipos.js';

/**
 * Aplica um evento de pagamento ao pedido. Idempotente: cada lançamento tem
 * referência única (pedido:<id>:<tipo> / estorno:<id>:<tipo>).
 */
export async function aplicarEvento(contas: RepositorioContas, pedido: Pedido, tipo: EventoPagamento['tipo']): Promise<void> {
  const p = produto(pedido.produto);
  if (!p) throw new Error(`Produto desconhecido no pedido ${pedido.id}: ${pedido.produto}`);
  const tipos = Object.entries(p.creditos).filter(([, q]) => q > 0) as [TipoCredito, number][];

  if (tipo === 'pago' && pedido.status !== 'estornado') {
    for (const [t, q] of tipos) {
      await contas.lancar({ usuarioId: pedido.usuarioId, tipo: t, quantidade: q, motivo: `Compra: ${p.nome}`, referencia: `pedido:${pedido.id}:${t}` });
    }
    if (pedido.status !== 'pago') await contas.atualizarPedido(pedido.id, { status: 'pago' });
  } else if (tipo === 'estornado' && pedido.status === 'pago') {
    // O saldo pode ficar negativo: novas consultas param até regularizar.
    for (const [t, q] of tipos) {
      await contas.lancar({ usuarioId: pedido.usuarioId, tipo: t, quantidade: -q, motivo: `Estorno: ${p.nome}`, referencia: `estorno:${pedido.id}:${t}` });
    }
    await contas.atualizarPedido(pedido.id, { status: 'estornado' });
  } else if (tipo === 'cancelado' && pedido.status === 'pendente') {
    await contas.atualizarPedido(pedido.id, { status: 'cancelado' });
  }
}
