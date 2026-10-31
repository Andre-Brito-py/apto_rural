import { useEffect, useRef, useState } from 'react';

/**
 * Botão "Continuar com o Google" (Google Identity Services, docs/login-google.md). O Google
 * desenha o botão e, quando a pessoa escolhe a conta, entrega um "ID token" (credential)
 * que vai para a API conferir. O site nunca vê a senha do Google.
 */

interface Gis {
  accounts: {
    id: {
      initialize(opcoes: { client_id: string; callback: (r: { credential?: string }) => void; ux_mode?: 'popup'; context?: string }): void;
      renderButton(elemento: HTMLElement, opcoes: Record<string, unknown>): void;
    };
  };
}

declare global {
  interface Window {
    google?: Gis;
  }
}

const SCRIPT = 'https://accounts.google.com/gsi/client';
let carregando: Promise<Gis> | null = null;

/** Carrega o script do Google uma vez só. */
function carregarGis(): Promise<Gis> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google);
  carregando ??= new Promise<Gis>((ok, falha) => {
    const s = document.createElement('script');
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => (window.google?.accounts?.id ? ok(window.google) : falha(new Error('script do Google sem a API')));
    s.onerror = () => {
      carregando = null;
      falha(new Error('script do Google não carregou'));
    };
    document.head.appendChild(s);
  });
  return carregando;
}

export function BotaoGoogle({ clienteId, criar, aoEntrar }: { clienteId: string; criar: boolean; aoEntrar: (credencial: string) => void }) {
  const lugar = useRef<HTMLDivElement>(null);
  const aoEntrarRef = useRef(aoEntrar);
  aoEntrarRef.current = aoEntrar;
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    let ativo = true;
    carregarGis()
      .then((g) => {
        if (!ativo || !lugar.current) return;
        g.accounts.id.initialize({
          client_id: clienteId,
          ux_mode: 'popup',
          context: criar ? 'signup' : 'signin',
          callback: (r) => r.credential && aoEntrarRef.current(r.credential),
        });
        lugar.current.innerHTML = '';
        g.accounts.id.renderButton(lugar.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          shape: 'rectangular',
          text: criar ? 'signup_with' : 'continue_with',
          logo_alignment: 'left',
          locale: 'pt-BR',
          width: Math.min(400, lugar.current.clientWidth || 320),
        });
      })
      .catch(() => ativo && setFalhou(true));
    return () => {
      ativo = false;
    };
  }, [clienteId, criar]);

  if (falhou) {
    return <p className="ajuda">O botão do Google não carregou agora. Use o e-mail e a senha, ou tente de novo mais tarde.</p>;
  }
  return <div ref={lugar} className="botao-google" />;
}
