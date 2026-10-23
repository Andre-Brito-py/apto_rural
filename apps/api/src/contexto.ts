import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from './config.js';
import { hashToken } from './contas/senha.js';
import type { RepositorioContas, Usuario } from './contas/tipos.js';
import type { Enviador } from './email/enviador.js';
import type { ProvedorPagamento } from './pagamentos/tipos.js';
import type { Repositorio } from './repositorio/tipos.js';

export interface Contexto {
  /** Consultas reais (PostGIS); null sem banco. */
  banco: Repositorio | null;
  /** Consultas fictícias; null fora do modo demonstração. */
  demo: Repositorio | null;
  contas: RepositorioContas;
  pagamento: ProvedorPagamento | null;
  email: Enviador;
}

export const COOKIE_SESSAO = 'apto_sessao';

export function erro(reply: FastifyReply, status: number, mensagem: string, campo?: string) {
  return reply.status(status).send({ erro: { mensagem, campo } });
}

export async function usuarioDaRequisicao(ctx: Contexto, req: FastifyRequest): Promise<Usuario | null> {
  const token = req.cookies[COOKIE_SESSAO];
  return token ? ctx.contas.usuarioDaSessao(hashToken(token)) : null;
}

export function opcoesCookie(expira?: Date) {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: config.producao,
    ...(expira ? { expires: expira } : {}),
  };
}

/** Data de hoje no fuso de Brasília, que é o que vale para as datas do MCR. */
export function hojeBrasilia(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}
