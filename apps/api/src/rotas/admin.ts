import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { enviarLinkEmail } from '../contas/links.js';
import { hashToken, novoTokenSessao } from '../contas/senha.js';
import type { Usuario } from '../contas/tipos.js';
import { config } from '../config.js';
import { COOKIE_SESSAO, erro, nivelAdmin, opcoesCookie, usuarioDaRequisicao, type Contexto, type NivelAdmin } from '../contexto.js';

/** "Entrar como" vale por pouco tempo. */
const DURACAO_PERSONIFICACAO_MS = 60 * 60 * 1000;

const ajuste = z.object({
  tipo: z.enum(['consulta', 'dossie']),
  quantidade: z
    .number()
    .int()
    .min(-1000)
    .max(1000)
    .refine((n) => n !== 0, 'A quantidade não pode ser zero.'),
  motivo: z.string().trim().min(3, 'Explique o motivo do ajuste.').max(200),
});
const comMotivo = z.object({ motivo: z.string().trim().min(3, 'Explique o motivo.').max(200) });
const comPapel = z.object({ papel: z.enum(['usuario', 'suporte', 'admin']) });

const erroDoSite = z.object({
  mensagem: z.string().min(1).max(500),
  detalhe: z.string().max(4000).optional(),
  rota: z.string().max(200).optional(),
});

export function rotasAdmin(app: FastifyInstance, ctx: Contexto) {
  /**
   * Suporte: vê tudo e pode "entrar como" (só leitura).
   * Admin: também altera (créditos, bloqueio, papéis).
   */
  async function exigir(req: FastifyRequest, reply: FastifyReply, minimo: NivelAdmin): Promise<Usuario | null> {
    const u = await usuarioDaRequisicao(ctx, req);
    const nivel = nivelAdmin(u);
    if (!nivel || (minimo === 'admin' && nivel !== 'admin')) {
      await erro(reply, 403, 'Acesso restrito.');
      return null;
    }
    if (!ctx.admin) {
      await erro(reply, 503, 'O painel precisa do banco de dados.');
      return null;
    }
    return u;
  }

  const idValido = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

  // ---- consulta (suporte e admin) ----

  app.get('/v1/admin/resumo', async (req, reply) => {
    if (!(await exigir(req, reply, 'suporte'))) return reply;
    const [resumo, bases] = await Promise.all([ctx.admin!.resumo(), ctx.admin!.saudeBases()]);
    return { resumo, bases };
  });

  app.get<{ Querystring: { busca?: string } }>('/v1/admin/usuarios', async (req, reply) => {
    if (!(await exigir(req, reply, 'suporte'))) return reply;
    return { usuarios: await ctx.admin!.usuarios(String(req.query.busca ?? '').slice(0, 100)) };
  });

  app.get<{ Params: { id: string } }>('/v1/admin/usuarios/:id', async (req, reply) => {
    if (!(await exigir(req, reply, 'suporte'))) return reply;
    const ficha = await ctx.admin!.fichaUsuario(req.params.id);
    if (!ficha) return erro(reply, 404, 'Usuário não encontrado.');
    return { ...ficha, saldo: await ctx.contas.saldo(req.params.id) };
  });

  app.get('/v1/admin/pedidos', async (req, reply) => {
    if (!(await exigir(req, reply, 'suporte'))) return reply;
    return { pedidos: await ctx.admin!.pedidos() };
  });

  app.get('/v1/admin/erros', async (req, reply) => {
    if (!(await exigir(req, reply, 'suporte'))) return reply;
    return { erros: await ctx.admin!.erros() };
  });

  app.get('/v1/admin/auditoria', async (req, reply) => {
    if (!(await exigir(req, reply, 'admin'))) return reply;
    return { auditoria: await ctx.admin!.auditoria() };
  });

  app.post<{ Params: { id: string } }>('/v1/admin/usuarios/:id/reenviar-confirmacao', async (req, reply) => {
    const admin = await exigir(req, reply, 'suporte');
    if (!admin) return reply;
    const alvo = idValido(req.params.id) ? await ctx.contas.buscarPorId(req.params.id) : null;
    if (!alvo) return erro(reply, 404, 'Usuário não encontrado.');
    if (alvo.emailConfirmado) return erro(reply, 409, 'Este e-mail já está confirmado.');
    await enviarLinkEmail(ctx, alvo, 'confirmacao');
    await ctx.admin!.auditar(admin.id, 'reenviou_confirmacao', alvo.id);
    return { ok: true };
  });

  // ---- entrar como (suporte e admin): sessão só de leitura, com registro ----

  app.post<{ Params: { id: string } }>('/v1/admin/usuarios/:id/entrar-como', async (req, reply) => {
    const admin = await exigir(req, reply, 'suporte');
    if (!admin) return reply;
    const alvo = idValido(req.params.id) ? await ctx.contas.buscarPorId(req.params.id) : null;
    if (!alvo) return erro(reply, 404, 'Usuário não encontrado.');
    if (alvo.id === admin.id) return erro(reply, 400, 'Você já está na sua própria conta.');
    // Encerra a sessão do admin; /v1/admin/voltar abre uma nova para ele.
    const atual = req.cookies[COOKIE_SESSAO];
    if (atual) await ctx.contas.apagarSessao(hashToken(atual));
    const { token, hash } = novoTokenSessao();
    const expira = new Date(Date.now() + DURACAO_PERSONIFICACAO_MS);
    await ctx.contas.criarSessao(alvo.id, hash, expira, admin.id);
    await ctx.admin!.auditar(admin.id, 'entrou_como', alvo.id);
    reply.setCookie(COOKIE_SESSAO, token, opcoesCookie(expira));
    return { ok: true };
  });

  app.post('/v1/admin/voltar', async (req, reply) => {
    const u = await usuarioDaRequisicao(ctx, req);
    if (!u?.personificadoPor) return erro(reply, 400, 'Você não está no modo "entrar como".');
    const token = req.cookies[COOKIE_SESSAO];
    if (token) await ctx.contas.apagarSessao(hashToken(token));
    const { token: novo, hash } = novoTokenSessao();
    const expira = new Date(Date.now() + config.sessaoDias * 24 * 3600 * 1000);
    await ctx.contas.criarSessao(u.personificadoPor, hash, expira);
    await ctx.admin?.auditar(u.personificadoPor, 'saiu_do_modo_entrar_como', u.id);
    reply.setCookie(COOKIE_SESSAO, novo, opcoesCookie(expira));
    return { ok: true, voltarPara: `/admin/usuarios/${u.id}` };
  });

  // ---- alterações (só admin), sempre auditadas ----

  app.post<{ Params: { id: string } }>('/v1/admin/usuarios/:id/creditos', async (req, reply) => {
    const admin = await exigir(req, reply, 'admin');
    if (!admin) return reply;
    const corpo = ajuste.safeParse(req.body);
    if (!corpo.success) return erro(reply, 400, corpo.error.issues[0]!.message);
    const alvo = idValido(req.params.id) ? await ctx.contas.buscarPorId(req.params.id) : null;
    if (!alvo) return erro(reply, 404, 'Usuário não encontrado.');
    await ctx.contas.lancar({
      usuarioId: alvo.id,
      tipo: corpo.data.tipo,
      quantidade: corpo.data.quantidade,
      motivo: `Ajuste manual (${admin.email}): ${corpo.data.motivo}`,
      referencia: `admin:${randomUUID()}`,
    });
    await ctx.admin!.auditar(admin.id, 'ajustou_creditos', alvo.id, corpo.data);
    return { ok: true, saldo: await ctx.contas.saldo(alvo.id) };
  });

  app.post<{ Params: { id: string } }>('/v1/admin/usuarios/:id/bloquear', async (req, reply) => {
    const admin = await exigir(req, reply, 'admin');
    if (!admin) return reply;
    const corpo = comMotivo.safeParse(req.body);
    if (!corpo.success) return erro(reply, 400, corpo.error.issues[0]!.message);
    if (req.params.id === admin.id) return erro(reply, 400, 'Você não pode bloquear a própria conta.');
    const alvo = idValido(req.params.id) ? await ctx.contas.buscarPorId(req.params.id) : null;
    if (!alvo) return erro(reply, 404, 'Usuário não encontrado.');
    await ctx.admin!.bloquear(alvo.id, corpo.data.motivo);
    await ctx.admin!.auditar(admin.id, 'bloqueou', alvo.id, corpo.data);
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/v1/admin/usuarios/:id/desbloquear', async (req, reply) => {
    const admin = await exigir(req, reply, 'admin');
    if (!admin) return reply;
    const alvo = idValido(req.params.id) ? await ctx.contas.buscarPorId(req.params.id) : null;
    if (!alvo) return erro(reply, 404, 'Usuário não encontrado.');
    await ctx.admin!.desbloquear(alvo.id);
    await ctx.admin!.auditar(admin.id, 'desbloqueou', alvo.id);
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/v1/admin/usuarios/:id/papel', async (req, reply) => {
    const admin = await exigir(req, reply, 'admin');
    if (!admin) return reply;
    const corpo = comPapel.safeParse(req.body);
    if (!corpo.success) return erro(reply, 400, 'Papel inválido.');
    if (req.params.id === admin.id) return erro(reply, 400, 'Você não pode mudar o próprio papel.');
    const alvo = idValido(req.params.id) ? await ctx.contas.buscarPorId(req.params.id) : null;
    if (!alvo) return erro(reply, 404, 'Usuário não encontrado.');
    await ctx.admin!.definirPapel(alvo.id, corpo.data.papel);
    await ctx.admin!.auditar(admin.id, 'mudou_papel', alvo.id, { de: alvo.papel, para: corpo.data.papel });
    return { ok: true };
  });

  // Erros do navegador (tela quebrada, falha de JavaScript). Sem login obrigatório.
  app.post('/v1/erros', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const corpo = erroDoSite.safeParse(req.body);
    if (!corpo.success) return erro(reply, 400, 'Erro inválido.');
    const u = await usuarioDaRequisicao(ctx, req).catch(() => null);
    await ctx.erros.registrar({ origem: 'site', ...corpo.data, usuarioId: u?.id });
    return reply.status(204).send();
  });
}
