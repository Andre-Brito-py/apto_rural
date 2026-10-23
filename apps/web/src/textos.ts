import type { Status, Veredito } from '@apto/regras';

export const ROTULO_STATUS: Record<Status, string> = {
  impedimento: 'Impedimento',
  atencao: 'Atenção',
  sem_impedimento: 'OK',
  nao_verificado: 'Não verificado',
};

export const VEREDITO: Record<Veredito, { titulo: string; texto: string }> = {
  impedimento: {
    titulo: 'Impedimento provável',
    texto: 'O banco tende a negar com base no MCR. Veja abaixo o que foi encontrado e os caminhos de saída.',
  },
  atencao: {
    titulo: 'Atenção antes da proposta',
    texto: 'Nada impede hoje, mas há pontos que podem travar a análise. Resolva antes de montar a proposta.',
  },
  sem_impedimento: {
    titulo: 'Nenhum impedimento encontrado',
    texto: 'Nas bases consultadas, o imóvel passa nos impedimentos socioambientais do MCR.',
  },
  incompleto: {
    titulo: 'Checagem incompleta',
    texto: 'Nada foi encontrado, mas alguns itens não puderam ser verificados. Complete os dados para fechar a checagem.',
  },
};

/** Ordem de leitura: o que trava primeiro. */
export const PESO_STATUS: Record<Status, number> = {
  impedimento: 0,
  atencao: 1,
  nao_verificado: 2,
  sem_impedimento: 3,
};

export function dataBr(iso?: string): string {
  if (!iso) return '—';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

export function numeroBr(n: number, casas = 2): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: casas });
}
