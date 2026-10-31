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

/** Compras avulsas (pagamento único). Os pacotes viraram planos mensais. */
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
];

/**
 * Pacotes avulsos que existiram antes dos planos mensais. Só servem para
 * reconhecer pedidos antigos que não guardaram os créditos da compra.
 */
export const PACOTES_LEGADOS: Produto[] = [
  { id: 'pacote-projetista', nome: 'Pacote Projetista', descricao: '', valor: 199, creditos: { consulta: 20, dossie: 2 }, ativo: false },
  { id: 'pacote-escritorio', nome: 'Pacote Escritório', descricao: '', valor: 499, creditos: { consulta: 100, dossie: 10 }, ativo: false },
];

/** Assinatura mensal (ou anual): créditos e carteira de imóveis acompanhados. */
export interface Plano {
  id: string;
  nome: string;
  descricao: string;
  valorMensal: number;
  /**
   * Preço do plano anual: uma cobrança por ano, com os créditos de 12 meses liberados no
   * pagamento (docs/plano-anual.md). null = sem opção anual; ausente = o padrão do plano.
   */
  valorAnual?: number | null;
  /** Créditos lançados a cada mensalidade paga (acumulam: não vencem). */
  creditosMensais: { consulta: number; dossie: number };
  /** Quantos imóveis a conta pode acompanhar na carteira com este plano. */
  limiteCarteira: number;
  /** Quantas pessoas usam a conta, contando o responsável. 1 = sem equipe. */
  limiteMembros: number;
  destaque?: boolean;
  ativo: boolean;
}

/** Configurações salvas antes do plano anual não têm o campo: vale o padrão do plano (ou sem anual). */
export function valorAnualDoPlano(p: Pick<Plano, 'id'> & { valorAnual?: number | null }): number | null {
  if (p.valorAnual !== undefined) return p.valorAnual;
  return PLANOS_PADRAO.find((x) => x.id === p.id)?.valorAnual ?? null;
}

/** Créditos de um ano do plano (liberados de uma vez no plano anual). */
export function creditosDoAno(p: Pick<Plano, 'creditosMensais'>) {
  return { consulta: p.creditosMensais.consulta * 12, dossie: p.creditosMensais.dossie * 12 };
}

/** Configurações salvas antes das equipes não têm o campo: vale o padrão do plano (ou 1). */
export function limiteMembrosDoPlano(p: Pick<Plano, 'id'> & { limiteMembros?: number }): number {
  return p.limiteMembros ?? PLANOS_PADRAO.find((x) => x.id === p.id)?.limiteMembros ?? 1;
}

/** Valores de partida do plano de negócio; editáveis no painel. */
export const PLANOS_PADRAO: Plano[] = [
  {
    id: 'plano-projetista',
    nome: 'Projetista',
    descricao: '20 consultas e 2 dossiês por mês, carteira com até 50 imóveis.',
    valorMensal: 199,
    // Anual = 10 mensalidades (2 meses grátis).
    valorAnual: 1990,
    creditosMensais: { consulta: 20, dossie: 2 },
    limiteCarteira: 50,
    limiteMembros: 1,
    destaque: true,
    ativo: true,
  },
  {
    id: 'plano-escritorio',
    nome: 'Escritório',
    descricao: '100 consultas e 10 dossiês por mês, carteira com até 300 imóveis e equipe de até 5 pessoas.',
    valorMensal: 499,
    valorAnual: 4990,
    creditosMensais: { consulta: 100, dossie: 10 },
    limiteCarteira: 300,
    limiteMembros: 5,
    ativo: true,
  },
];

/** Amostra grátis padrão: 1 consulta para quem confirma o e-mail. */
export const CREDITOS_BOAS_VINDAS_PADRAO = { consulta: 1, dossie: 0 };

/** Imóveis na carteira de quem não assina (com assinatura, vale o limite do plano). */
export const LIMITE_CARTEIRA_PADRAO = 5;
