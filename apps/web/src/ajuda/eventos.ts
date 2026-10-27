/**
 * Qualquer tela pode abrir o chat de ajuda ou o tour sem passar props: um evento na janela,
 * ouvido pela Central de ajuda e pelo Tour (montados uma vez, no App).
 */
const ABRIR_AJUDA = 'apto:abrir-ajuda';
const INICIAR_TOUR = 'apto:iniciar-tour';

/** Abre o chat; com perguntaId, já responde aquela pergunta. */
export function abrirAjuda(perguntaId?: string) {
  window.dispatchEvent(new CustomEvent(ABRIR_AJUDA, { detail: perguntaId }));
}

export function iniciarTour() {
  window.dispatchEvent(new Event(INICIAR_TOUR));
}

export function aoAbrirAjuda(f: (perguntaId?: string) => void) {
  const ouvir = (e: Event) => f((e as CustomEvent<string | undefined>).detail);
  window.addEventListener(ABRIR_AJUDA, ouvir);
  return () => window.removeEventListener(ABRIR_AJUDA, ouvir);
}

export function aoIniciarTour(f: () => void) {
  window.addEventListener(INICIAR_TOUR, f);
  return () => window.removeEventListener(INICIAR_TOUR, f);
}
