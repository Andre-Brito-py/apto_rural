/**
 * Manda erros do navegador para a API (aparecem no painel e geram alerta).
 * No máximo 5 por página, para um erro em loop não inundar o registro.
 */
let enviados = 0;

export function relatarErro(erro: unknown, extra?: string) {
  if (enviados >= 5) return;
  enviados++;
  const e = erro instanceof Error ? erro : new Error(String(erro));
  const corpo = {
    mensagem: e.message.slice(0, 500) || 'Erro sem mensagem',
    detalhe: [e.stack, extra, navigator.userAgent].filter(Boolean).join('\n').slice(0, 4000),
    rota: location.pathname.slice(0, 200),
  };
  fetch('/v1/erros', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
    keepalive: true,
  }).catch(() => undefined);
}

export function capturarErrosGlobais() {
  window.addEventListener('error', (ev) => relatarErro(ev.error ?? ev.message));
  window.addEventListener('unhandledrejection', (ev) => relatarErro(ev.reason));
}
