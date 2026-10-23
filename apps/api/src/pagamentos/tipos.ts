export interface DadosCliente {
  /** Cliente já criado no provedor, se houver. */
  id?: string;
  nome: string;
  email: string;
  whatsapp?: string;
  /** Só trafega até o provedor; não é guardado pelo Apto Rural. */
  cpfCnpj?: string;
}

export interface DadosCobranca {
  pedidoId: string;
  valor: number;
  descricao: string;
  cliente: DadosCliente;
}

export interface DadosAssinatura {
  assinaturaId: string;
  valorMensal: number;
  descricao: string;
  cliente: DadosCliente;
}

export interface Cobranca {
  provedorId: string;
  link: string;
  clienteId: string;
}

/** Evento normalizado vindo do webhook do provedor. */
export interface EventoPagamento {
  id: string;
  tipo: 'pago' | 'estornado' | 'cancelado' | 'atrasado' | 'ignorar';
  provedorId: string;
  /** Nosso id do pedido, quando o provedor devolve a referência externa. */
  pedidoId?: string;
  /** Assinatura do provedor que gerou esta cobrança (mensalidade). */
  assinaturaProvedorId?: string;
  /** Valor cobrado, para registrar a mensalidade. */
  valor?: number;
}

export interface ProvedorPagamento {
  nome: string;
  /** Precisa do CPF/CNPJ do pagador para criar o cliente. */
  exigeDocumento: boolean;
  criarCobranca(dados: DadosCobranca): Promise<Cobranca>;
  /** Devolve o dinheiro de uma cobrança paga (total). */
  estornar(provedorId: string, descricao: string): Promise<void>;
  /** Remove uma cobrança ainda não paga. */
  cancelar(provedorId: string): Promise<void>;
  /** Cria a assinatura mensal; o link é o da primeira mensalidade. */
  criarAssinatura(dados: DadosAssinatura): Promise<Cobranca>;
  /** Encerra a recorrência (as mensalidades pendentes são removidas). */
  cancelarAssinatura(provedorId: string): Promise<void>;
  /** Valida a origem e traduz o corpo do webhook. null = origem inválida. */
  lerWebhook(cabecalhos: Record<string, string | string[] | undefined>, corpo: unknown): EventoPagamento | null;
}
