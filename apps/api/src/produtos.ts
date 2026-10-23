/**
 * Valores padrão dos pacotes de créditos. Os preços que valem de fato são os
 * do painel (/admin → Configurações); estes só valem enquanto ninguém mudou.
 */
export interface Produto {
  id: string;
  nome: string;
  descricao: string;
  valor: number;
  creditos: { consulta: number; dossie: number };
  destaque?: boolean;
  /** Pacote desativado some da página de preços, mas pedidos antigos continuam valendo. */
  ativo: boolean;
}

export const PRODUTOS_PADRAO: Produto[] = [
  {
    id: 'consulta-avulsa',
    nome: 'Consulta avulsa',
    descricao: '1 consulta com semáforo e relatório em PDF.',
    valor: 39,
    creditos: { consulta: 1, dossie: 0 },
    ativo: true,
  },
  {
    id: 'dossie-avulso',
    nome: 'Dossiê avulso',
    descricao: '1 dossiê de contestação ou plano de saída para um imóvel já consultado.',
    valor: 190,
    creditos: { consulta: 0, dossie: 1 },
    ativo: true,
  },
  {
    id: 'pacote-projetista',
    nome: 'Pacote Projetista',
    descricao: '20 consultas e 2 dossiês.',
    valor: 199,
    creditos: { consulta: 20, dossie: 2 },
    destaque: true,
    ativo: true,
  },
  {
    id: 'pacote-escritorio',
    nome: 'Pacote Escritório',
    descricao: '100 consultas e 10 dossiês.',
    valor: 499,
    creditos: { consulta: 100, dossie: 10 },
    ativo: true,
  },
];

/** Amostra grátis padrão: 1 consulta para quem confirma o e-mail. */
export const CREDITOS_BOAS_VINDAS_PADRAO = { consulta: 1, dossie: 0 };

/** Quantos imóveis cada conta pode acompanhar, por padrão. */
export const LIMITE_CARTEIRA_PADRAO = 50;
