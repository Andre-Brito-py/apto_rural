import { config } from '../config.js';
import type { Contexto } from '../contexto.js';
import { mensagemConfirmacao, mensagemRedefinirSenha } from '../email/mensagens.js';
import { novoTokenSessao } from './senha.js';
import type { TipoTokenEmail, Usuario } from './tipos.js';

const HORAS = 3600 * 1000;
export const VALIDADE_LINK = { confirmacao: 48 * HORAS, senha: 1 * HORAS };

/** Cria o token (guarda só o hash) e manda o link por e-mail. */
export async function enviarLinkEmail(ctx: Contexto, u: Usuario, tipo: TipoTokenEmail): Promise<void> {
  const { token, hash } = novoTokenSessao();
  await ctx.contas.criarTokenEmail(u.id, tipo, hash, new Date(Date.now() + VALIDADE_LINK[tipo]));
  const caminho = tipo === 'confirmacao' ? 'confirmar-email' : 'redefinir-senha';
  const link = `${config.webOrigin}/${caminho}?token=${encodeURIComponent(token)}`;
  const msg = tipo === 'confirmacao' ? mensagemConfirmacao(u.nome, u.email, link) : mensagemRedefinirSenha(u.nome, u.email, link);
  await ctx.email.enviar(msg);
}
