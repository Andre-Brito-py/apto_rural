import type { ResultadoConsulta, Status } from './tipos.js';

export interface Alteracao {
  regraId: string;
  titulo: string;
  de: Status;
  para: Status;
  /** Resumo novo do item, para o aviso explicar o que mudou. */
  resumo: string;
  piorou: boolean;
}

const GRAVIDADE: Record<Status, number> = {
  sem_impedimento: 0,
  nao_verificado: 1,
  atencao: 2,
  impedimento: 3,
};

/**
 * O que mudou de um resultado para outro, item a item.
 *
 * Mudança para "não verificado" é ignorada: costuma ser uma base que falhou ao
 * atualizar, não uma mudança no imóvel, e não deve gerar alarme.
 */
export function compararResultados(antigo: ResultadoConsulta, novo: ResultadoConsulta): Alteracao[] {
  const antes = new Map(antigo.itens.map((i) => [i.regraId, i.status]));
  const alteracoes: Alteracao[] = [];
  for (const item of novo.itens) {
    const de = antes.get(item.regraId);
    if (de === undefined || de === item.status || item.status === 'nao_verificado') continue;
    alteracoes.push({
      regraId: item.regraId,
      titulo: item.titulo,
      de,
      para: item.status,
      resumo: item.resumo,
      piorou: GRAVIDADE[item.status] > GRAVIDADE[de],
    });
  }
  // O que piorou aparece primeiro.
  return alteracoes.sort((a, b) => Number(b.piorou) - Number(a.piorou));
}
