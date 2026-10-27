/** Cupom de desconto criado pelo administrador (docs/cupons.md). */
export interface Cupom {
  id: string;
  /** Sempre em maiúsculas. */
  codigo: string;
  /** Anotação interna (campanha, parceiro); o cliente não vê. */
  descricao: string;
  tipo: 'percentual' | 'fixo';
  /** Percentual (1 a 100) ou valor em reais. */
  valor: number;
  /** Ids dos produtos avulsos e planos em que vale. Vazio = todos. */
  alvos: string[];
  /** Assinatura: mensalidades com desconto. null = todas, enquanto a assinatura durar. */
  meses: number | null;
  /** Usos no total. null = sem limite. */
  limiteUsos: number | null;
  limitePorConta: number;
  /** Só para quem nunca pagou nada. */
  apenasNovos: boolean;
  /** AAAA-MM-DD, horário de Brasília, inclusive. null = sem limite daquele lado. */
  validoDe: string | null;
  validoAte: string | null;
  /** Pausado = false: some do checkout na hora, sem apagar o histórico. */
  ativo: boolean;
  criadoEm: string;
  atualizadoEm: string;
}

export type DadosCupom = Omit<Cupom, 'id' | 'criadoEm' | 'atualizadoEm'>;

export type StatusUso = 'reservado' | 'usado' | 'liberado';

export interface UsoCupom {
  id: string;
  cupomId: string;
  usuarioId: string;
  pedidoId?: string;
  assinaturaId?: string;
  /** Id e nome do produto ou plano, como eram no dia. */
  item: string;
  nomeItem: string;
  valorOriginal: number;
  valorFinal: number;
  /** Assinatura: mensalidades com desconto, fixadas na contratação. */
  meses: number | null;
  mensalidadesPagas: number;
  /** Quando a assinatura voltou ao valor cheio no provedor. */
  descontoEncerradoEm?: string;
  status: StatusUso;
  criadoEm: string;
  usadoEm?: string;
}

/** Números de cada cupom, para a lista do painel. */
export interface ResumoCupom extends Cupom {
  usados: number;
  /** Cobranças geradas com o cupom e ainda não pagas (contam no limite por 3 dias). */
  reservados: number;
  /** Soma dos descontos já pagos (compras avulsas e mensalidades com desconto). */
  descontoConcedido: number;
  /** O que entrou nas compras e mensalidades pagas com desconto (as de valor cheio, depois, não contam). */
  receita: number;
}

export type ResultadoReserva = UsoCupom | 'esgotado' | 'limite_conta';

export interface RepositorioCupons {
  listar(): Promise<ResumoCupom[]>;
  buscar(id: string): Promise<Cupom | null>;
  buscarPorCodigo(codigo: string): Promise<Cupom | null>;
  criar(dados: DadosCupom, adminId: string): Promise<Cupom | 'codigo_existe'>;
  atualizar(id: string, dados: DadosCupom): Promise<Cupom | 'codigo_existe' | null>;
  /** Só apaga cupom que nunca foi usado; senão 'tem_usos' (pause em vez de apagar). */
  apagar(id: string): Promise<'ok' | 'tem_usos' | null>;

  /**
   * Usos que contam no limite: pagos e reservas dos últimos 3 dias. Com a conta, as
   * reservas dela ficam de fora (a próxima cobrança com o cupom libera a anterior).
   */
  contarUsos(cupomId: string, usuarioId?: string): Promise<{ total: number; daConta: number }>;
  /**
   * Reserva um uso de forma atômica, conferindo de novo os limites (duas pessoas no
   * último uso: só uma leva). Reservas anteriores da mesma conta neste cupom, ainda
   * sem pagamento, são liberadas (a pessoa gerou outra cobrança).
   */
  reservar(
    cupom: Cupom,
    uso: Pick<UsoCupom, 'usuarioId' | 'pedidoId' | 'assinaturaId' | 'item' | 'nomeItem' | 'valorOriginal' | 'valorFinal' | 'meses'>,
  ): Promise<ResultadoReserva>;
  porPedido(pedidoId: string): Promise<UsoCupom | null>;
  porAssinatura(assinaturaId: string): Promise<UsoCupom | null>;
  buscarUso(id: string): Promise<UsoCupom | null>;
  atualizarUso(id: string, d: Partial<Pick<UsoCupom, 'status' | 'mensalidadesPagas'>> & { encerrarDesconto?: boolean }): Promise<void>;
  /** Usos de um cupom para o painel, com o e-mail de quem usou. */
  usos(cupomId: string): Promise<(UsoCupom & { email: string; nome: string })[]>;
}

/** Reserva sem pagamento deixa de contar no limite depois disto (a fatura do Asaas vence em 3 dias). */
export const VALIDADE_RESERVA_MS = 3 * 24 * 3600 * 1000;
