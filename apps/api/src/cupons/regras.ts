import type { Cupom } from './tipos.js';

/**
 * Menor valor de uma cobrança no Asaas (docs.asaas.com). Abaixo disso o Asaas recusa a
 * cobrança; por isso o cupom não pode deixar um pagamento entre R$ 0,01 e R$ 4,99.
 * Compra avulsa que fica de graça (R$ 0) é liberada direto, sem cobrança.
 */
export const MINIMO_COBRANCA = 5;

export const normalizarCodigo = (codigo: string) => codigo.trim().toUpperCase();

export const FORMATO_CODIGO = /^[A-Z0-9_-]{3,30}$/;

const centavos = (v: number) => Math.round(v * 100) / 100;

/** Preço com o cupom. Nunca fica negativo. */
export function precoComCupom(c: Pick<Cupom, 'tipo' | 'valor'>, valor: number): { final: number; desconto: number } {
  const desconto = c.tipo === 'percentual' ? (valor * c.valor) / 100 : c.valor;
  const final = Math.max(0, centavos(valor - desconto));
  return { final, desconto: centavos(valor - final) };
}

export type SituacaoCupom = 'ativo' | 'pausado' | 'agendado' | 'vencido' | 'esgotado';

/** Situação do cupom hoje (AAAA-MM-DD de Brasília) com os usos que já contam. */
export function situacao(c: Cupom, hoje: string, usos: number): SituacaoCupom {
  if (!c.ativo) return 'pausado';
  if (c.validoAte && hoje > c.validoAte) return 'vencido';
  if (c.limiteUsos != null && usos >= c.limiteUsos) return 'esgotado';
  if (c.validoDe && hoje < c.validoDe) return 'agendado';
  return 'ativo';
}

/** O cupom vale neste produto ou plano? Lista vazia = vale em tudo. */
export const valeEm = (c: Pick<Cupom, 'alvos'>, itemId: string) => c.alvos.length === 0 || c.alvos.includes(itemId);

const dataBr = (iso: string) => iso.split('-').reverse().join('/');

/** O que dizer ao cliente quando o cupom não vale (nunca revela números internos). */
export function motivoSituacao(s: Exclude<SituacaoCupom, 'ativo'>, c: Cupom): string {
  switch (s) {
    case 'pausado':
      return 'Este cupom não está valendo no momento.';
    case 'vencido':
      return `Este cupom venceu em ${dataBr(c.validoAte!)}.`;
    case 'esgotado':
      return 'Este cupom já foi usado o número máximo de vezes.';
    case 'agendado':
      return `Este cupom começa a valer em ${dataBr(c.validoDe!)}.`;
  }
}

/** Texto curto do desconto, para a tela: "30% de desconto" ou "R$ 50,00 de desconto". */
export function descreverDesconto(c: Pick<Cupom, 'tipo' | 'valor' | 'meses'>, plano: boolean): string {
  const quanto =
    c.tipo === 'percentual' ? `${c.valor.toLocaleString('pt-BR')}%` : c.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  if (!plano) return `${quanto} de desconto`;
  if (c.meses == null) return `${quanto} de desconto em todas as mensalidades`;
  return c.meses === 1 ? `${quanto} de desconto na primeira mensalidade` : `${quanto} de desconto nas ${c.meses} primeiras mensalidades`;
}
