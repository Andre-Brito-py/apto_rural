import { REGRAS } from './regras.js';
import type { Evidencias, ResultadoConsulta, Veredito } from './tipos.js';

export const AVISOS_GERAIS = [
  'Pré-checagem com bases públicas. Não é aprovação de crédito, laudo técnico nem parecer jurídico: a decisão é da instituição financeira.',
  'O MCR também veda crédito com recursos controlados ou direcionados para projeto que preveja supressão de vegetação nativa (item 16), o que não é verificável por mapa.',
  'O contrato deve prever desclassificação se as obrigações socioambientais forem descumpridas durante o financiamento (item 19).',
];

export function avaliar(ev: Evidencias, dataReferencia: string): ResultadoConsulta {
  const itens = REGRAS.map((r) => r.avaliar(ev, dataReferencia));
  let veredito: Veredito = 'sem_impedimento';
  if (itens.some((i) => i.status === 'impedimento')) veredito = 'impedimento';
  else if (itens.some((i) => i.status === 'atencao')) veredito = 'atencao';
  else if (itens.some((i) => i.status === 'nao_verificado')) veredito = 'incompleto';
  return {
    car: ev.imovel.car,
    dataReferencia,
    veredito,
    itens,
    avisos: AVISOS_GERAIS,
    atualizacoes: ev.atualizacoes,
  };
}
