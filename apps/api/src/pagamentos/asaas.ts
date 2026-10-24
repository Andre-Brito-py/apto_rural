import { timingSafeEqual } from 'node:crypto';
import type { Cobranca, DadosAssinatura, DadosCliente, DadosCobranca, EventoPagamento, ProvedorPagamento } from './tipos.js';

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
  PAYMENT_OVERDUE: 'atrasado',
};

const hojeSaoPaulo = (daqui = 0) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() + daqui * 24 * 3600 * 1000));

export class ProvedorAsaas implements ProvedorPagamento {
  nome = 'asaas';
  exigeDocumento = true;
  private base: string;

  constructor(
    private chave: string,
    ambiente: 'producao' | 'sandbox',
    private tokenWebhook: string,
    /** Endereço alternativo, só para o ensaio de produção (Asaas falso). */
    url?: string,
  ) {
    this.base = url ?? BASE[ambiente];
  }

  private async chamar<T>(caminho: string, corpo?: unknown, metodo: 'POST' | 'DELETE' | 'GET' = 'POST'): Promise<T> {
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

  /** Cliente no Asaas (POST /customers exige name e cpfCnpj). */
  private async cliente(c: DadosCliente): Promise<string> {
    if (c.id) return c.id;
    if (!c.cpfCnpj) throw new Error('CPF/CNPJ do pagador é obrigatório no Asaas.');
    const novo = await this.chamar<{ id: string }>('/customers', { name: c.nome, cpfCnpj: c.cpfCnpj, email: c.email, mobilePhone: c.whatsapp });
    return novo.id;
  }

  async criarCobranca(d: DadosCobranca): Promise<Cobranca> {
    const clienteId = await this.cliente(d.cliente);
    const pagamento = await this.chamar<{ id: string; invoiceUrl: string }>('/payments', {
      customer: clienteId,
      billingType: 'UNDEFINED', // o pagador escolhe Pix, cartão ou boleto na fatura
      value: d.valor,
      dueDate: hojeSaoPaulo(3),
      description: d.descricao,
      externalReference: d.pedidoId,
    });
    return { provedorId: pagamento.id, link: pagamento.invoiceUrl, clienteId };
  }

  /**
   * POST /subscriptions (cycle MONTHLY) com o primeiro vencimento hoje. As
   * mensalidades são geradas pelo Asaas; o link da primeira vem de
   * GET /subscriptions/{id}/payments (pode levar um instante para existir).
   */
  async criarAssinatura(d: DadosAssinatura): Promise<Cobranca> {
    const clienteId = await this.cliente(d.cliente);
    const sub = await this.chamar<{ id: string }>('/subscriptions', {
      customer: clienteId,
      billingType: 'UNDEFINED',
      value: d.valorMensal,
      nextDueDate: hojeSaoPaulo(),
      cycle: 'MONTHLY',
      description: d.descricao,
      externalReference: d.assinaturaId,
    });
    for (let tentativa = 0; tentativa < 5; tentativa++) {
      const lista = await this.chamar<{ data: { invoiceUrl?: string }[] }>(`/subscriptions/${encodeURIComponent(sub.id)}/payments`, undefined, 'GET');
      const link = lista.data[0]?.invoiceUrl;
      if (link) return { provedorId: sub.id, link, clienteId };
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error('O Asaas criou a assinatura, mas ainda não gerou a primeira mensalidade.');
  }

  /** DELETE /subscriptions/{id}: encerra a recorrência e remove as mensalidades pendentes. */
  async cancelarAssinatura(provedorId: string) {
    await this.chamar(`/subscriptions/${encodeURIComponent(provedorId)}`, undefined, 'DELETE');
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
    const e = corpo as {
      id?: string;
      event?: string;
      payment?: { id?: string; externalReference?: string; subscription?: string; value?: number };
    };
    if (!e?.id || !e.event || !e.payment?.id) return { id: String(e?.id ?? ''), tipo: 'ignorar', provedorId: '' };
    return {
      id: e.id,
      tipo: EVENTOS[e.event] ?? 'ignorar',
      provedorId: e.payment.id,
      // Mensalidade de assinatura: o externalReference é o da assinatura, não de um pedido.
      pedidoId: e.payment.subscription ? undefined : e.payment.externalReference,
      assinaturaProvedorId: e.payment.subscription,
      valor: e.payment.value,
    };
  }
}
