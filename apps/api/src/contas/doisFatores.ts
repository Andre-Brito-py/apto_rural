import type { Contexto } from '../contexto.js';
import { conferirCodigo, hashRecuperacao, pareceRecuperacao } from './totp.js';

/** O segredo do autenticador fica cifrado com o id da pessoa como contexto. */
export const contextoSegredo = (usuarioId: string) => `totp:${usuarioId}`;

/**
 * Confere o código da segunda etapa: os 6 dígitos do aplicativo (cada intervalo de 30 s
 * vale uma vez só) ou um código de recuperação (cada um vale uma vez só).
 * Devolve como foi conferido, ou null se o código não vale.
 */
export async function conferirSegundaEtapa(ctx: Contexto, usuarioId: string, codigo: string): Promise<'aplicativo' | 'recuperacao' | null> {
  const dados = await ctx.contas.dadosDoisFatores(usuarioId);
  if (!dados.ativo || !dados.segredoCifrado) return null;
  if (pareceRecuperacao(codigo)) {
    return (await ctx.contas.usarCodigoRecuperacao(usuarioId, hashRecuperacao(codigo))) ? 'recuperacao' : null;
  }
  const segredo = ctx.ia.segredos.decifrarValor(contextoSegredo(usuarioId), dados.segredoCifrado);
  if (!segredo) return null;
  const passo = conferirCodigo(segredo, codigo);
  if (passo == null) return null;
  return (await ctx.contas.registrarPassoTotp(usuarioId, passo)) ? 'aplicativo' : null;
}
