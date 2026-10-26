import type { Status } from '@apto/regras';

/** Ícones de traço da página de vendas (desenhados aqui: nada de biblioteca nem arquivo externo). */
const TRACOS = {
  relogio: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  escudo: 'M12 3 4.5 6v5.5c0 4.6 3.1 8.3 7.5 9.5 4.4-1.2 7.5-4.9 7.5-9.5V6L12 3Zm-3.2 9 2.2 2.2 4.3-4.4',
  documento: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Zm0 0v5h5M9 13h6M9 17h4',
  sino: 'M18 16v-5a6 6 0 1 0-12 0v5l-2 2h16l-2-2ZM10 21h4',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2',
  mapa: 'm9 4-5 2v14l5-2 6 2 5-2V4l-5 2-6-2Zm0 0v14m6-12v14',
  banco: 'M3 10h18M5 10v8m4.7-8v8m4.6-8v8M19 10v8M3 21h18M12 3l9 5H3l9-5Z',
  seta: 'M5 12h14m-6-6 6 6-6 6',
  check: 'm5 12.5 4.5 4.5L19 7.5',
  busca: 'm20 20-4.2-4.2M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z',
  camadas: 'm12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5',
  caminho: 'M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm12-10a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM8 17h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7',
  olho: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  conversa: 'M20 12a8 8 0 0 1-11.8 7L4 20l1.1-3.9A8 8 0 1 1 20 12ZM8.5 10.5h7M8.5 13.5h4.5',
  chave: 'M14.5 9.5a4 4 0 1 1-1.2-2.8l7.7 7.8v3h-3v-2h-2v-2h-2l-1.4-1.4M7.5 11.5h.01',
  olhoFechado: 'M3 3l18 18M10.6 5.1A9.8 9.8 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6A17.3 17.3 0 0 0 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2',
} as const;

export type NomeIcone = keyof typeof TRACOS;

export function Icone({ nome, className }: { nome: NomeIcone; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={TRACOS[nome]} />
    </svg>
  );
}

/** Um ícone por status, para que a informação nunca dependa só da cor. */
export function IconeStatus({ status, className }: { status: Status; className?: string }) {
  const comum = { viewBox: '0 0 24 24', className, 'aria-hidden': true, focusable: false } as const;
  switch (status) {
    case 'impedimento':
      return (
        <svg {...comum}>
          <circle cx="12" cy="12" r="11" fill="currentColor" />
          <path d="m8 8 8 8M16 8l-8 8" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
        </svg>
      );
    case 'atencao':
      return (
        <svg {...comum}>
          <path d="M12 2 23 21H1z" fill="currentColor" strokeLinejoin="round" />
          <path d="M12 9v5" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
          <circle cx="12" cy="17.6" r="1.5" fill="#fff" />
        </svg>
      );
    case 'sem_impedimento':
      return (
        <svg {...comum}>
          <circle cx="12" cy="12" r="11" fill="currentColor" />
          <path d="m7 12.5 3.2 3.2L17 9" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default:
      return (
        <svg {...comum}>
          <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2.4" />
          <path d="M9.5 9.3a2.6 2.6 0 1 1 3.4 2.5c-.6.2-.9.7-.9 1.3v.6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="12" cy="17" r="1.3" fill="currentColor" />
        </svg>
      );
  }
}
