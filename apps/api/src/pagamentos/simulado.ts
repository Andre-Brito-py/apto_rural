import { randomUUID } from 'node:crypto';
import type { Cobranca, DadosCobranca, EventoPagamento, ProvedorPagamento } from './tipos.js';

/**
 * Pagamento de mentira para desenvolver o fluxo sem conta no provedor.
 * Só é criado com APTO_DEMO=1 e sem chave do Asaas. A "fatura" é uma página do
 * próprio site com um botão que confirma o pedido.
 */
export class ProvedorSimulado implements ProvedorPagamento {
  nome = 'simulado';
  exigeDocumento = false;

  constructor(private webOrigin: string) {}

  async criarCobranca(d: DadosCobranca): Promise<Cobranca> {
    return {
      provedorId: `sim_${randomUUID()}`,
      link: `${this.webOrigin}/pagamento-simulado/${d.pedidoId}`,
      clienteId: d.cliente.id ?? `sim_cliente_${randomUUID()}`,
    };
  }

  async estornar() {}

  async cancelar() {}

  lerWebhook(): EventoPagamento | null {
    return null;
  }
}
