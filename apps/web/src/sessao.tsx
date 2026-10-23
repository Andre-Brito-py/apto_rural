import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, type Saldo, type Sessao } from './api';

interface ValorSessao {
  sessao: Sessao | null;
  carregando: boolean;
  definir: (s: Sessao | null) => void;
  atualizarSaldo: (saldo?: Saldo) => Promise<void>;
  sair: () => Promise<void>;
}

const Contexto = createContext<ValorSessao | null>(null);

export function ProvedorSessao({ children }: { children: ReactNode }) {
  const [sessao, definir] = useState<Sessao | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    api
      .eu()
      .then(definir)
      .catch(() => definir(null))
      .finally(() => setCarregando(false));
  }, []);

  const atualizarSaldo = useCallback(async (saldo?: Saldo) => {
    if (saldo) {
      definir((s) => (s ? { ...s, saldo } : s));
      return;
    }
    definir(await api.eu().catch(() => null));
  }, []);

  const sair = useCallback(async () => {
    await api.sair().catch(() => undefined);
    definir(null);
  }, []);

  return <Contexto.Provider value={{ sessao, carregando, definir, atualizarSaldo, sair }}>{children}</Contexto.Provider>;
}

export function useSessao(): ValorSessao {
  const v = useContext(Contexto);
  if (!v) throw new Error('useSessao fora do ProvedorSessao');
  return v;
}
