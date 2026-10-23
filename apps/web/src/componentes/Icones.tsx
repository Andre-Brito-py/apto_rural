import type { Status } from '@apto/regras';

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
