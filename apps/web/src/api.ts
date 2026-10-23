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
  constructor(message: string, public campo?: string) {
    super(message);
  }
}

async function pedir<T>(caminho: string, init?: RequestInit): Promise<T> {
  let resposta: Response;
  try {
    resposta = await fetch(caminho, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new ErroApi('Sem conexão. Confira o sinal de internet e tente de novo.');
  }
  const corpo = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    throw new ErroApi(corpo?.erro?.mensagem ?? 'Algo deu errado. Tente de novo em instantes.', corpo?.erro?.campo);
  }
  return corpo as T;
}

export const api = {
  saude: () => pedir<Saude>('/v1/saude'),
  regras: () => pedir<CatalogoRegras>('/v1/regras'),
  consultar: (dados: NovaConsulta) => pedir<ConsultaSalva>('/v1/consultas', { method: 'POST', body: JSON.stringify(dados) }),
  consulta: (id: string) => pedir<ConsultaSalva>(`/v1/consultas/${encodeURIComponent(id)}`),
};
