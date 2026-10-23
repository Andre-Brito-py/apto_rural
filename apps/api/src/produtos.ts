/**
 * Catálogo de créditos. Valores de partida do plano de negócio, a ajustar
 * depois das conversas com projetistas. Créditos não expiram nesta versão.
 */
export interface Produto {
  id: string;
  nome: string;
  descricao: string;
  valor: number;
  creditos: { consulta: number; dossie: number };
  destaque?: boolean;
}

export const PRODUTOS: Produto[] = [
  {
    id: 'consulta-avulsa',
    nome: 'Consulta avulsa',
    descricao: '1 consulta com semáforo e relatório em PDF.',
    valor: 39,
    creditos: { consulta: 1, dossie: 0 },
  },
  {
    id: 'dossie-avulso',
    nome: 'Dossiê avulso',
    descricao: '1 dossiê de contestação ou plano de saída para um imóvel já consultado.',
    valor: 190,
    creditos: { consulta: 0, dossie: 1 },
  },
  {
    id: 'pacote-projetista',
    nome: 'Pacote Projetista',
    descricao: '20 consultas e 2 dossiês.',
    valor: 199,
    creditos: { consulta: 20, dossie: 2 },
    destaque: true,
  },
  {
    id: 'pacote-escritorio',
    nome: 'Pacote Escritório',
    descricao: '100 consultas e 10 dossiês.',
    valor: 499,
    creditos: { consulta: 100, dossie: 10 },
  },
];

/** Amostra grátis do plano: 1 consulta para quem cria a conta. */
export const CREDITOS_BOAS_VINDAS = { consulta: 1, dossie: 0 };

export function produto(id: string): Produto | undefined {
  return PRODUTOS.find((p) => p.id === id);
}
