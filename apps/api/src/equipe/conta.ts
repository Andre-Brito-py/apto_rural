import type { Usuario } from '../contas/tipos.js';
import type { Contexto } from '../contexto.js';
import type { EquipeDoUsuario } from './repositorio.js';

/**
 * A conta que a pessoa está usando agora. Quem é de uma equipe usa a conta do
 * responsável: os créditos, a carteira, os avisos e o plano são dele. Fora de
 * equipe, é a própria conta. Seus créditos pessoais ficam guardados e voltam
 * se a pessoa sair da equipe.
 */
export interface ContaEmUso {
  /** Id do usuário dono dos créditos e da carteira (o responsável da equipe, ou a própria pessoa). */
  contaId: string;
  equipe: EquipeDoUsuario | null;
}

export async function contaEmUso(ctx: Contexto, u: Usuario): Promise<ContaEmUso> {
  const equipe = ctx.equipe ? await ctx.equipe.daPessoa(u.id) : null;
  return { contaId: equipe?.donoId ?? u.id, equipe };
}

/** Todos que usam a mesma conta (responsável e membros), para dividir consultas e dossiês. */
export async function pessoasDaConta(ctx: Contexto, conta: ContaEmUso): Promise<string[]> {
  return conta.equipe && ctx.equipe ? ctx.equipe.pessoas(conta.contaId) : [conta.contaId];
}

/** Comprar, assinar e cancelar: só quem paga (fora de equipe, a própria pessoa). */
export const podePagar = (c: ContaEmUso) => !c.equipe || c.equipe.papel === 'responsavel';

/** Convidar, remover, mudar papéis e tirar imóveis da carteira: responsável e administradores. */
export const podeGerir = (c: ContaEmUso) => !c.equipe || c.equipe.papel !== 'tecnico';

/** Pessoas que a conta comporta (com o responsável): o do plano ativo; sem plano, só a própria pessoa. */
export async function limiteMembros(ctx: Contexto, contaId: string): Promise<number> {
  const a = await ctx.contas.assinaturaAtual(contaId);
  return a?.status === 'ativa' ? a.limiteMembros : 1;
}
