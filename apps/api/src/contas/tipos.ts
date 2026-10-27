export type TipoCredito = 'consulta' | 'dossie';

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  whatsapp?: string;
  profissao?: string;
  pagamentoClienteId?: string;
  emailConfirmado: boolean;
  papel: Papel;
  bloqueado: boolean;
  /** Já viu (ou pulou) o tour de boas-vindas. */
  tourVisto?: boolean;
  /** Verificação em duas etapas (código do aplicativo autenticador) ligada. */
  doisFatores?: boolean;
  /** Quando a sessão atual foi aberta (só nas buscas pela sessão): o painel exige login recente. */
  sessaoCriadaEm?: string;
  /** Preenchido quando a sessão é de um administrador "entrando como" este usuário. */
  personificadoPor?: string;
}

export type Papel = 'usuario' | 'suporte' | 'admin';

export type TipoTokenEmail = 'confirmacao' | 'senha';

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
  /** Créditos e nome do pacote fixados na compra (pedidos antigos podem não ter). */
  creditos?: Saldo;
  nomeProduto?: string;
  /** Mensalidade de uma assinatura. */
  assinaturaId?: string;
  /** Cupom usado nesta compra e quanto saiu de desconto (docs/cupons.md). */
  cupom?: string;
  desconto?: number;
}

export type StatusAssinatura = 'pendente' | 'ativa' | 'inadimplente' | 'cancelada';

export interface Assinatura {
  id: string;
  usuarioId: string;
  planoId: string;
  /** Condições fixadas na contratação. */
  nomePlano: string;
  valorMensal: number;
  creditos: Saldo;
  limiteCarteira: number;
  /** Pessoas na equipe, contando o responsável (1 = sem equipe). */
  limiteMembros: number;
  /** Com cupom: valorMensal é o que está sendo cobrado agora e valorCheio, o preço do plano. */
  cupom?: string;
  valorCheio?: number;
  status: StatusAssinatura;
  provedor: string;
  provedorId?: string;
  link?: string;
  criadaEm: string;
  ativadaEm?: string;
  canceladaEm?: string;
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
  criarUsuario(
    u: Omit<Usuario, 'id' | 'emailConfirmado' | 'papel' | 'bloqueado' | 'personificadoPor'> & { senhaHash: string },
  ): Promise<Usuario | 'email_existe'>;
  buscarPorId(id: string): Promise<Usuario | null>;
  /** Marca o e-mail como confirmado. Retorna true só na primeira vez. */
  confirmarEmail(usuarioId: string): Promise<boolean>;
  definirSenha(usuarioId: string, senhaHash: string): Promise<void>;
  apagarSessoesDoUsuario(usuarioId: string): Promise<void>;

  criarTokenEmail(usuarioId: string, tipo: TipoTokenEmail, tokenHash: string, expiraEm: Date): Promise<void>;
  /** Usa o token (uma vez só). Retorna o dono, ou null se inválido, usado ou vencido. */
  consumirTokenEmail(tokenHash: string, tipo: TipoTokenEmail): Promise<string | null>;
  buscarPorEmail(email: string): Promise<(Usuario & { senhaHash: string }) | null>;
  definirClientePagamento(usuarioId: string, clienteId: string): Promise<void>;
  /** Marca que a pessoa já viu (ou pulou) o tour de boas-vindas. */
  marcarTourVisto(usuarioId: string): Promise<void>;

  /** personificadoPor: id do administrador que está "entrando como" (sessão só de leitura). */
  criarSessao(usuarioId: string, tokenHash: string, expiraEm: Date, personificadoPor?: string): Promise<void>;
  /** Conta bloqueada não tem sessão válida, exceto a de um administrador entrando como ela. */
  usuarioDaSessao(tokenHash: string): Promise<Usuario | null>;
  apagarSessao(tokenHash: string): Promise<void>;

  saldo(usuarioId: string): Promise<Saldo>;
  /** Lança créditos. Retorna false se a referência já foi usada. */
  lancar(l: Lancamento): Promise<boolean>;
  /**
   * Debita 1 crédito de forma atômica. Retorna false se não houver saldo.
   * autorId: quem da equipe usou (quando a conta é de outra pessoa, o responsável).
   */
  debitar(usuarioId: string, tipo: TipoCredito, motivo: string, referencia: string, autorId?: string): Promise<boolean>;

  criarPedido(p: Omit<Pedido, 'id' | 'status' | 'criadoEm'>): Promise<Pedido>;
  atualizarPedido(id: string, dados: Partial<Pick<Pedido, 'provedorId' | 'link' | 'status'>>): Promise<void>;
  buscarPedido(id: string): Promise<Pedido | null>;
  buscarPedidoPorProvedor(provedorId: string): Promise<Pedido | null>;
  pedidosDoUsuario(usuarioId: string): Promise<Pedido[]>;

  /** Cria a assinatura pendente. 'ja_existe' se a conta já tem uma em andamento. */
  criarAssinatura(a: Omit<Assinatura, 'id' | 'status' | 'criadaEm' | 'ativadaEm' | 'canceladaEm'>): Promise<Assinatura | 'ja_existe'>;
  atualizarAssinatura(id: string, dados: Partial<Pick<Assinatura, 'status' | 'provedorId' | 'link' | 'valorMensal'>>): Promise<void>;
  buscarAssinatura(id: string): Promise<Assinatura | null>;
  buscarAssinaturaPorProvedor(provedorId: string): Promise<Assinatura | null>;
  /** A assinatura em andamento (pendente, ativa ou inadimplente), se houver. */
  assinaturaAtual(usuarioId: string): Promise<Assinatura | null>;

  // ---- Verificação em duas etapas (TOTP): ver contas/totp.ts ----
  /** O segredo cifrado (ativo ou esperando o primeiro código) e o último intervalo aceito. */
  dadosDoisFatores(usuarioId: string): Promise<{ segredoCifrado?: string; ativo: boolean; ultimoPasso: number | null }>;
  /** Guarda o segredo novo, ainda não ativo (só se a verificação não estiver ligada). */
  guardarSegredoPendente(usuarioId: string, segredoCifrado: string): Promise<boolean>;
  /** Liga a verificação e troca os códigos de recuperação (só os hashes). */
  ativarDoisFatores(usuarioId: string, hashesRecuperacao: string[]): Promise<void>;
  /** Marca o intervalo de 30 s usado. false se ele (ou um mais novo) já foi usado: o mesmo código não vale duas vezes. */
  registrarPassoTotp(usuarioId: string, passo: number): Promise<boolean>;
  /** Usa um código de recuperação (uma vez só). */
  usarCodigoRecuperacao(usuarioId: string, hash: string): Promise<boolean>;
  codigosRecuperacaoRestantes(usuarioId: string): Promise<number>;
  /** Desliga a verificação, apaga o segredo e os códigos de recuperação. */
  desativarDoisFatores(usuarioId: string): Promise<void>;
  /** Apaga as sessões da pessoa, menos a atual (ao ligar a verificação em duas etapas). */
  apagarOutrasSessoes(usuarioId: string, tokenHashAtual: string): Promise<void>;

  /** Guarda o evento do webhook. Retorna false se já tinha sido recebido. */
  registrarEvento(id: string, provedor: string, payload: unknown): Promise<boolean>;

  /** Tudo o que guardamos sobre a pessoa, para ela baixar (LGPD, art. 18, II e V). */
  exportarDados(usuarioId: string): Promise<DadosDoTitular>;
  /**
   * Exclusão pedida pelo titular (LGPD, art. 18, VI). Apaga os dados pessoais e o
   * que é só dele (carteira, avisos, sessões, links); desliga as consultas da conta;
   * mantém pedidos e créditos, que a lei manda guardar, ligados à conta anonimizada.
   */
  excluirConta(usuarioId: string, emailHash: string): Promise<void>;
  /** true se este e-mail já pertenceu a uma conta excluída (sem amostra grátis de novo). */
  emailJaExcluido(emailHash: string): Promise<boolean>;
}

export interface DadosDoTitular {
  conta: Record<string, unknown>;
  creditos: Record<string, unknown>[];
  pedidos: Record<string, unknown>[];
  assinaturas: Record<string, unknown>[];
  consultas: Record<string, unknown>[];
  carteira: Record<string, unknown>[];
  avisos: Record<string, unknown>[];
  sessoesAbertas: Record<string, unknown>[];
  /** Participação em equipe (como responsável ou membro). */
  equipe: Record<string, unknown>[];
}
