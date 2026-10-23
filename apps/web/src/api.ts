import type { FonteId, Fonte, Norma, ResultadoConsulta, SituacaoCar, Status } from '@apto/regras';

export interface GeometriaImovel {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: number[][][] | number[][][][];
}

export interface ConsultaSalva {
  id: string;
  criadaEm: string;
  resultado: ResultadoConsulta;
  geometria?: GeometriaImovel;
  demo: boolean;
  /** A consulta é de quem está logado. */
  minha: boolean;
  dossieLiberado: boolean;
}

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  whatsapp?: string;
  profissao?: string;
  emailConfirmado: boolean;
}

export interface Saldo {
  consulta: number;
  dossie: number;
}

export interface Sessao {
  usuario: Usuario;
  saldo: Saldo;
  /** Acesso ao painel: admin altera; suporte só vê e entra como. */
  nivelAdmin?: 'admin' | 'suporte' | null;
  /** Preenchido no modo "entrar como" (só leitura). */
  personificadoPor?: { nome: string; email: string };
}

export type Papel = 'usuario' | 'suporte' | 'admin';

export interface FichaUsuario {
  usuario: {
    id: string;
    nome: string;
    email: string;
    whatsapp?: string;
    profissao?: string;
    papel: Papel;
    criadoEm: string;
    confirmadoEm: string | null;
    bloqueadoEm: string | null;
    bloqueioMotivo?: string;
  };
  saldo: Saldo;
  lancamentos: { tipo: string; quantidade: number; motivo: string; criadoEm: string }[];
  consultas: { id: string; codCar: string; criadaEm: string; veredito: string }[];
  carteira: { id: string; codCar: string; apelido?: string; verificadoEm: string; veredito: string; ultimaConsultaId?: string }[];
  pedidos: { id: string; produto: string; valor: number; status: string; criadoEm: string }[];
  auditoria: { quando: string; acao: string; detalhes: Record<string, unknown>; adminEmail: string }[];
}

export interface RegistroAuditoria {
  quando: string;
  acao: string;
  detalhes: Record<string, unknown>;
  adminEmail: string;
  alvoEmail?: string;
  alvoId?: string;
}

export interface PainelResumo {
  resumo: {
    usuarios: number;
    confirmados: number;
    usuarios7d: number;
    consultasHoje: number;
    consultas7d: number;
    consultas30d: number;
    receita30d: number;
    receitaTotal: number;
    pedidosPendentes: number;
    creditosEmCirculacao: Saldo;
    imoveisCarteira: number;
    avisos7d: number;
    erros24h: number;
  };
  bases: {
    fonteId: string;
    nome: string;
    registros: number | null;
    referencia: string | null;
    conferidoEm: string | null;
    diasSemConferir: number | null;
    situacao: 'em_dia' | 'atrasada' | 'nao_carregada';
  }[];
}

export interface UsuarioAdmin {
  id: string;
  nome: string;
  email: string;
  profissao?: string;
  criadoEm: string;
  confirmado: boolean;
  papel: Papel;
  bloqueado: boolean;
  saldo: Saldo;
  consultas: number;
  pago: number;
}

export interface ErroRegistrado {
  id: number;
  quando: string;
  origem: string;
  mensagem: string;
  detalhe?: string;
  rota?: string;
}

export interface Produto {
  id: string;
  nome: string;
  descricao: string;
  valor: number;
  creditos: Saldo;
  destaque?: boolean;
}

export interface Catalogo {
  produtos: Produto[];
  pagamentoDisponivel: boolean;
  exigeDocumento: boolean;
  simulado: boolean;
}

export interface ImovelCarteira {
  id: string;
  codCar: string;
  apelido?: string;
  verificadoEm: string;
  criadoEm: string;
  resultado: ResultadoConsulta;
  ultimaConsultaId?: string;
  avisosNaoLidos: number;
}

export interface Aviso {
  id: string;
  imovelId: string;
  codCar: string;
  apelido?: string;
  consultaId?: string;
  alteracoes: { regraId: string; titulo: string; de: Status; para: Status; resumo: string; piorou: boolean }[];
  criadoEm: string;
  lido: boolean;
}

export interface Pedido {
  id: string;
  produto: string;
  valor: number;
  status: 'pendente' | 'pago' | 'estornado' | 'cancelado';
  criadoEm: string;
}

export interface NovaConsulta {
  car: string;
  situacaoCar?: SituacaoCar;
  modulosFiscais?: number;
  usoColetivo?: boolean;
  geometria?: GeometriaImovel;
  documento?: string;
  consentimentoDocumento?: boolean;
}

export interface Saude {
  ok: boolean;
  banco: boolean;
  demo: Record<string, string> | null;
}

export interface CatalogoRegras {
  regras: { id: string; titulo: string; pergunta: string; normas: Norma[]; fontes: FonteId[] }[];
  fontes: Record<FonteId, Fonte>;
  atualizacoes: Partial<Record<FonteId, string>>;
}

export class ErroApi extends Error {
  constructor(
    message: string,
    public campo?: string,
    public status?: number,
  ) {
    super(message);
  }
}

async function pedir<T>(caminho: string, init?: RequestInit): Promise<T> {
  let resposta: Response;
  try {
    resposta = await fetch(caminho, {
      ...init,
      credentials: 'same-origin',
      headers: init?.body ? { 'Content-Type': 'application/json', ...init.headers } : init?.headers,
    });
  } catch {
    throw new ErroApi('Sem conexão. Confira o sinal de internet e tente de novo.');
  }
  const corpo = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    throw new ErroApi(corpo?.erro?.mensagem ?? 'Algo deu errado. Tente de novo em instantes.', corpo?.erro?.campo, resposta.status);
  }
  return corpo as T;
}

const post = (corpo?: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(corpo ?? {}) });

export const api = {
  saude: () => pedir<Saude>('/v1/saude'),
  regras: () => pedir<CatalogoRegras>('/v1/regras'),
  consultar: (dados: NovaConsulta) => pedir<ConsultaSalva>('/v1/consultas', post(dados)),
  consulta: (id: string) => pedir<ConsultaSalva>(`/v1/consultas/${encodeURIComponent(id)}`),
  liberarDossie: (id: string) => pedir<{ ok: boolean; saldo?: Saldo }>(`/v1/consultas/${encodeURIComponent(id)}/dossie`, post()),

  eu: () => pedir<Sessao>('/v1/eu'),
  criarConta: (dados: { nome: string; email: string; whatsapp?: string; profissao?: string; senha: string; aceiteTermos: boolean }) =>
    pedir<Sessao>('/v1/conta', post(dados)),
  entrar: (email: string, senha: string) => pedir<Sessao>('/v1/sessao', post({ email, senha })),
  sair: () => pedir<{ ok: boolean }>('/v1/sessao', { method: 'DELETE' }),
  confirmarEmail: (token: string) => pedir<{ ok: boolean; saldo: Saldo }>('/v1/conta/confirmar', post({ token })),
  reenviarConfirmacao: () => pedir<{ ok: boolean; jaConfirmado?: boolean }>('/v1/conta/confirmacao', post()),
  esqueciSenha: (email: string) => pedir<{ ok: boolean; mensagem: string }>('/v1/senha/esqueci', post({ email })),
  redefinirSenha: (token: string, senha: string) => pedir<Sessao>('/v1/senha/redefinir', post({ token, senha })),

  produtos: () => pedir<Catalogo>('/v1/produtos'),
  comprar: (produto: string, documento?: string) => pedir<{ id: string; link: string }>('/v1/pedidos', post({ produto, documento })),
  pedidos: () => pedir<{ pedidos: Pedido[] }>('/v1/pedidos'),
  pedido: (id: string) => pedir<{ pedido: Pedido; produto?: Produto }>(`/v1/pedidos/${encodeURIComponent(id)}`),
  carteira: () => pedir<{ imoveis: ImovelCarteira[]; limite: number; disponivel: boolean }>('/v1/carteira'),
  acompanhar: (consultaId: string, apelido?: string) => pedir<ImovelCarteira>('/v1/carteira', post({ consultaId, apelido })),
  deixarDeAcompanhar: (id: string) => pedir<{ ok: boolean }>(`/v1/carteira/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  avisos: () => pedir<{ avisos: Aviso[]; naoLidos: number }>('/v1/avisos'),
  marcarAvisosLidos: () => pedir<{ ok: boolean }>('/v1/avisos/lidos', post()),

  admin: {
    resumo: () => pedir<PainelResumo>('/v1/admin/resumo'),
    usuarios: (busca = '') => pedir<{ usuarios: UsuarioAdmin[] }>(`/v1/admin/usuarios?busca=${encodeURIComponent(busca)}`),
    pedidos: () => pedir<{ pedidos: (Pedido & { email: string; provedor: string; pagoEm: string | null })[] }>('/v1/admin/pedidos'),
    erros: () => pedir<{ erros: ErroRegistrado[] }>('/v1/admin/erros'),
    ajustarCreditos: (usuarioId: string, tipo: 'consulta' | 'dossie', quantidade: number, motivo: string) =>
      pedir<{ ok: boolean; saldo: Saldo }>(`/v1/admin/usuarios/${encodeURIComponent(usuarioId)}/creditos`, post({ tipo, quantidade, motivo })),
    ficha: (id: string) => pedir<FichaUsuario>(`/v1/admin/usuarios/${encodeURIComponent(id)}`),
    auditoria: () => pedir<{ auditoria: RegistroAuditoria[] }>('/v1/admin/auditoria'),
    entrarComo: (id: string) => pedir<{ ok: boolean }>(`/v1/admin/usuarios/${encodeURIComponent(id)}/entrar-como`, post()),
    voltar: () => pedir<{ ok: boolean; voltarPara: string }>('/v1/admin/voltar', post()),
    bloquear: (id: string, motivo: string) => pedir<{ ok: boolean }>(`/v1/admin/usuarios/${encodeURIComponent(id)}/bloquear`, post({ motivo })),
    desbloquear: (id: string) => pedir<{ ok: boolean }>(`/v1/admin/usuarios/${encodeURIComponent(id)}/desbloquear`, post()),
    definirPapel: (id: string, papel: Papel) => pedir<{ ok: boolean }>(`/v1/admin/usuarios/${encodeURIComponent(id)}/papel`, post({ papel })),
    reenviarConfirmacao: (id: string) => pedir<{ ok: boolean }>(`/v1/admin/usuarios/${encodeURIComponent(id)}/reenviar-confirmacao`, post()),
  },

  pagarSimulado: (id: string) => pedir<{ ok: boolean; saldo: Saldo }>(`/v1/dev/pedidos/${encodeURIComponent(id)}/pagar`, post()),
};
