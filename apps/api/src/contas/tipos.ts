export type TipoCredito = 'consulta' | 'dossie';

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  whatsapp?: string;
  profissao?: string;
  pagamentoClienteId?: string;
}

export type Saldo = Record<TipoCredito, number>;

export type StatusPedido = 'pendente' | 'pago' | 'estornado' | 'cancelado';

export interface Pedido {
  id: string;
  usuarioId: string;
  produto: string;
  valor: number;
  status: StatusPedido;
  provedor: string;
  provedorId?: string;
  link?: string;
  criadoEm: string;
}

export interface Lancamento {
  usuarioId: string;
  tipo: TipoCredito;
  quantidade: number;
  motivo: string;
  /** Única: repetir a mesma referência não lança de novo. */
  referencia: string;
}

export interface RepositorioContas {
  criarUsuario(u: Omit<Usuario, 'id'> & { senhaHash: string }): Promise<Usuario | 'email_existe'>;
  buscarPorEmail(email: string): Promise<(Usuario & { senhaHash: string }) | null>;
  definirClientePagamento(usuarioId: string, clienteId: string): Promise<void>;

  criarSessao(usuarioId: string, tokenHash: string, expiraEm: Date): Promise<void>;
  usuarioDaSessao(tokenHash: string): Promise<Usuario | null>;
  apagarSessao(tokenHash: string): Promise<void>;

  saldo(usuarioId: string): Promise<Saldo>;
  /** Lança créditos. Retorna false se a referência já foi usada. */
  lancar(l: Lancamento): Promise<boolean>;
  /** Debita 1 crédito de forma atômica. Retorna false se não houver saldo. */
  debitar(usuarioId: string, tipo: TipoCredito, motivo: string, referencia: string): Promise<boolean>;

  criarPedido(p: Omit<Pedido, 'id' | 'status' | 'criadoEm'>): Promise<Pedido>;
  atualizarPedido(id: string, dados: Partial<Pick<Pedido, 'provedorId' | 'link' | 'status'>>): Promise<void>;
  buscarPedido(id: string): Promise<Pedido | null>;
  buscarPedidoPorProvedor(provedorId: string): Promise<Pedido | null>;
  pedidosDoUsuario(usuarioId: string): Promise<Pedido[]>;

  /** Guarda o evento do webhook. Retorna false se já tinha sido recebido. */
  registrarEvento(id: string, provedor: string, payload: unknown): Promise<boolean>;
}
