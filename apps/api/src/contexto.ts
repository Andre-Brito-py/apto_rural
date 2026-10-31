import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from './config.js';
import { hashToken } from './contas/senha.js';
import type { RepositorioAdmin } from './admin/repositorio.js';
import type { RepositorioCarteira } from './carteira/repositorio.js';
import type { Configuracoes } from './configuracoes.js';
import type { RegistroErros } from './monitoramento/erros.js';
import type { VerificadorGoogle } from './contas/google.js';
import type { RepositorioContas, Usuario } from './contas/tipos.js';
import type { RepositorioCupons } from './cupons/tipos.js';
import type { Enviador } from './email/enviador.js';
import type { RepositorioEquipe } from './equipe/repositorio.js';
import type { RepositorioApoio } from './ia/apoio.js';
import type { ExecutorIA } from './ia/executor.js';
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
  /**
   * IA (docs/ia.md): a explicação do resultado e o executor das outras funções (recibo do
   * CAR, documentos e rascunhos do dossiê, frase da carteira, análise de norma).
   */
  ia: { explicacao: ServicoExplicacao; executor: ExecutorIA; apoio: RepositorioApoio; segredos: Segredos; uso: UsoIA };
  /** Confere o login pela conta Google (docs/login-google.md). Nos testes, um Google falso. */
  google: Pick<VerificadorGoogle, 'verificar'>;
}

export type NivelAdmin = 'admin' | 'suporte';

/** Os poderes do painel valem por estas horas depois do login; depois, é preciso entrar de novo. */
export const HORAS_SESSAO_PAINEL = 12;

/** O papel da pessoa no painel, sem olhar a sessão (ADMIN_EMAILS conta como admin). */
export function papelNoPainel(u: Usuario | null): NivelAdmin | null {
  if (!u || !u.emailConfirmado || u.bloqueado) return null;
  if (config.adminEmails.includes(u.email.toLowerCase()) || u.papel === 'admin') return 'admin';
  return u.papel === 'suporte' ? 'suporte' : null;
}

/**
 * Por que quem tem papel no painel não pode usá-lo nesta sessão:
 * - 'reentrar': o login foi há mais de HORAS_SESSAO_PAINEL horas (sessão roubada ou
 *   esquecida aberta não dá poder de admin por 30 dias);
 * - 'dois_fatores': em produção, administrador e suporte precisam da verificação em
 *   duas etapas ligada (ligar é em Minha conta, que não depende do painel).
 */
export function bloqueioDoPainel(u: Usuario | null): 'reentrar' | 'dois_fatores' | null {
  if (!papelNoPainel(u) || u!.personificadoPor) return null;
  if (config.producao && !u!.doisFatores) return 'dois_fatores';
  if (u!.sessaoCriadaEm && Date.now() - Date.parse(u!.sessaoCriadaEm) > HORAS_SESSAO_PAINEL * 3600 * 1000) return 'reentrar';
  return null;
}

/**
 * Nível de acesso ao painel. Exige e-mail confirmado, conta não bloqueada, login recente e,
 * em produção, a verificação em duas etapas. E-mails de ADMIN_EMAILS são sempre admin
 * (primeiro acesso, antes de existir qualquer papel no banco). Sessão de "entrar como"
 * nunca tem poder de admin.
 */
export function nivelAdmin(u: Usuario | null): NivelAdmin | null {
  if (!u || u.personificadoPor || bloqueioDoPainel(u)) return null;
  return papelNoPainel(u);
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
