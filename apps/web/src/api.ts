import type { FonteId, Fonte, Norma, ResultadoConsulta, SituacaoCar } from '@apto/regras';

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
}

export interface Saldo {
  consulta: number;
  dossie: number;
}

export interface Sessao {
  usuario: Usuario;
  saldo: Saldo;
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

  produtos: () => pedir<Catalogo>('/v1/produtos'),
  comprar: (produto: string, documento?: string) => pedir<{ id: string; link: string }>('/v1/pedidos', post({ produto, documento })),
  pedidos: () => pedir<{ pedidos: Pedido[] }>('/v1/pedidos'),
  pedido: (id: string) => pedir<{ pedido: Pedido; produto?: Produto }>(`/v1/pedidos/${encodeURIComponent(id)}`),
  pagarSimulado: (id: string) => pedir<{ ok: boolean; saldo: Saldo }>(`/v1/dev/pedidos/${encodeURIComponent(id)}/pagar`, post()),
};
