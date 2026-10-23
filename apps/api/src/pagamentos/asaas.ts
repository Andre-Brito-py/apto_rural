import { timingSafeEqual } from 'node:crypto';
import type { Cobranca, DadosCobranca, EventoPagamento, ProvedorPagamento } from './tipos.js';

/**
 * Asaas (docs.asaas.com, conferido em 23/10/2026):
 * - API: https://api.asaas.com/v3 (produção) e https://api-sandbox.asaas.com/v3 (testes),
 *   chave no cabeçalho "access_token";
 * - POST /customers exige name e cpfCnpj; POST /payments exige customer, billingType,
 *   value e dueDate e devolve invoiceUrl (fatura hospedada pelo Asaas: o Apto Rural
 *   nunca vê dados de cartão);
 * - webhook traz o token configurado no cabeçalho "asaas-access-token" e é entregue
 *   "pelo menos uma vez": deduplicar pelo id do evento.
 * Pix vai direto a PAYMENT_RECEIVED; cartão passa por PAYMENT_CONFIRMED (pago, saldo
 * ainda não disponível), que já basta para liberar os créditos.
 */
const BASE = {
  producao: 'https://api.asaas.com/v3',
  sandbox: 'https://api-sandbox.asaas.com/v3',
};

const EVENTOS: Record<string, EventoPagamento['tipo']> = {
  PAYMENT_CONFIRMED: 'pago',
  PAYMENT_RECEIVED: 'pago',
  PAYMENT_REFUNDED: 'estornado',
  PAYMENT_CHARGEBACK_REQUESTED: 'estornado',
  PAYMENT_DELETED: 'cancelado',
};

export class ProvedorAsaas implements ProvedorPagamento {
  nome = 'asaas';
  exigeDocumento = true;
  private base: string;

  constructor(
    private chave: string,
    ambiente: 'producao' | 'sandbox',
    private tokenWebhook: string,
  ) {
    this.base = BASE[ambiente];
  }

  private async chamar<T>(caminho: string, corpo?: unknown, metodo: 'POST' | 'DELETE' = 'POST'): Promise<T> {
    const r = await fetch(`${this.base}${caminho}`, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', access_token: this.chave, 'User-Agent': 'AptoRural' },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const json = (await r.json().catch(() => ({}))) as { errors?: { description: string }[] } & T;
    if (!r.ok) {
      throw new Error(`Asaas ${caminho} ${r.status}: ${json.errors?.map((e) => e.description).join('; ') ?? 'erro'}`);
    }
    return json;
  }

  async criarCobranca(d: DadosCobranca): Promise<Cobranca> {
    let clienteId = d.cliente.id;
    if (!clienteId) {
      if (!d.cliente.cpfCnpj) throw new Error('CPF/CNPJ do pagador é obrigatório no Asaas.');
      const cliente = await this.chamar<{ id: string }>('/customers', {
        name: d.cliente.nome,
        cpfCnpj: d.cliente.cpfCnpj,
        email: d.cliente.email,
        mobilePhone: d.cliente.whatsapp,
      });
      clienteId = cliente.id;
    }
    const venc = new Date(Date.now() + 3 * 24 * 3600 * 1000);
    const pagamento = await this.chamar<{ id: string; invoiceUrl: string }>('/payments', {
      customer: clienteId,
      billingType: 'UNDEFINED', // o pagador escolhe Pix, cartão ou boleto na fatura
      value: d.valor,
      dueDate: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(venc),
      description: d.descricao,
      externalReference: d.pedidoId,
    });
    return { provedorId: pagamento.id, link: pagamento.invoiceUrl, clienteId };
  }

  /**
   * POST /payments/{id}/refund sem valor = estorno total. Vale para Pix e cartão;
   * boleto pago tem fluxo próprio (dados bancários do cliente) e deve ser
   * estornado pelo painel do Asaas. Pix exige saldo na conta Asaas.
   */
  async estornar(provedorId: string, descricao: string) {
    await this.chamar(`/payments/${encodeURIComponent(provedorId)}/refund`, { description: descricao.slice(0, 500) });
  }

  /** DELETE /payments/{id}: remove a cobrança pendente (gera PAYMENT_DELETED). */
  async cancelar(provedorId: string) {
    await this.chamar(`/payments/${encodeURIComponent(provedorId)}`, undefined, 'DELETE');
  }

  lerWebhook(cabecalhos: Record<string, string | string[] | undefined>, corpo: unknown): EventoPagamento | null {
    const recebido = Buffer.from(String(cabecalhos['asaas-access-token'] ?? ''));
    const esperado = Buffer.from(this.tokenWebhook);
    if (!this.tokenWebhook || recebido.length !== esperado.length || !timingSafeEqual(recebido, esperado)) return null;
    const e = corpo as { id?: string; event?: string; payment?: { id?: string; externalReference?: string } };
    if (!e?.id || !e.event || !e.payment?.id) return { id: String(e?.id ?? ''), tipo: 'ignorar', provedorId: '' };
    return {
      id: e.id,
      tipo: EVENTOS[e.event] ?? 'ignorar',
      provedorId: e.payment.id,
      pedidoId: e.payment.externalReference,
    };
  }
}
