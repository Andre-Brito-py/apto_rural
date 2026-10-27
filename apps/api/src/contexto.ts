import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from './config.js';
import { hashToken } from './contas/senha.js';
import type { RepositorioAdmin } from './admin/repositorio.js';
import type { RepositorioCarteira } from './carteira/repositorio.js';
import type { Configuracoes } from './configuracoes.js';
import type { RegistroErros } from './monitoramento/erros.js';
import type { RepositorioContas, Usuario } from './contas/tipos.js';
import type { RepositorioCupons } from './cupons/tipos.js';
import type { Enviador } from './email/enviador.js';
import type { RepositorioEquipe } from './equipe/repositorio.js';
import type { ServicoExplicacao } from './ia/explicacao.js';
import type { Segredos } from './ia/segredos.js';
import type { UsoIA } from './ia/uso.js';
import type { ProvedorPagamento } from './pagamentos/tipos.js';
import type { Repositorio } from './repositorio/tipos.js';

export interface Contexto {
  /** Consultas reais (PostGIS); null sem banco. */
  banco: Repositorio | null;
  /** Consultas fictícias; null fora do modo demonstração. */
  demo: Repositorio | null;
  contas: RepositorioContas;
  pagamento: ProvedorPagamento | null;
  /** Cupons de desconto (docs/cupons.md): no banco, ou na memória no modo demonstração. */
  cupons: RepositorioCupons;
  email: Enviador;
  /** Carteira de imóveis acompanhados; null sem banco. */
  carteira: RepositorioCarteira | null;
  erros: RegistroErros;
  /** Preços, limites e aviso do site, editáveis pelo painel. */
  config: Configuracoes;
  /** Consultas do painel administrativo; null sem banco. */
  admin: RepositorioAdmin | null;
  /** Equipes do plano Escritório; null sem banco (cada pessoa usa só a própria conta). */
  equipe: RepositorioEquipe | null;
  /** O banco responde agora? true/false; null quando não há banco (modo demonstração). */
  bancoResponde: () => Promise<boolean | null>;
  /** Explicação por IA para o produtor, a chave cifrada e o uso (docs/ia.md). */
  ia: { explicacao: ServicoExplicacao; segredos: Segredos; uso: UsoIA };
}

export type NivelAdmin = 'admin' | 'suporte';

/**
 * Nível de acesso ao painel. Exige e-mail confirmado e conta não bloqueada.
 * E-mails de ADMIN_EMAILS são sempre admin (primeiro acesso, antes de existir
 * qualquer papel no banco). Sessão de "entrar como" nunca tem poder de admin.
 */
export function nivelAdmin(u: Usuario | null): NivelAdmin | null {
  if (!u || !u.emailConfirmado || u.bloqueado || u.personificadoPor) return null;
  if (config.adminEmails.includes(u.email.toLowerCase()) || u.papel === 'admin') return 'admin';
  return u.papel === 'suporte' ? 'suporte' : null;
}

export function ehAdmin(u: Usuario | null): boolean {
  return nivelAdmin(u) === 'admin';
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
