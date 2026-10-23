import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Usuario } from '../contas/tipos.js';
import { ehAdmin, erro, usuarioDaRequisicao, type Contexto } from '../contexto.js';

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

const erroDoSite = z.object({
  mensagem: z.string().min(1).max(500),
  detalhe: z.string().max(4000).optional(),
  rota: z.string().max(200).optional(),
});

export function rotasAdmin(app: FastifyInstance, ctx: Contexto) {
  /** Só administradores; responde 403 para os demais. */
  async function exigirAdmin(req: FastifyRequest, reply: FastifyReply): Promise<Usuario | null> {
    const u = await usuarioDaRequisicao(ctx, req);
    if (!ehAdmin(u)) {
      await erro(reply, 403, 'Acesso restrito.');
      return null;
    }
    if (!ctx.admin) {
      await erro(reply, 503, 'O painel precisa do banco de dados.');
      return null;
    }
    return u;
  }

  app.get('/v1/admin/resumo', async (req, reply) => {
    if (!(await exigirAdmin(req, reply))) return reply;
    const [resumo, bases] = await Promise.all([ctx.admin!.resumo(), ctx.admin!.saudeBases()]);
    return { resumo, bases };
  });

  app.get<{ Querystring: { busca?: string } }>('/v1/admin/usuarios', async (req, reply) => {
    if (!(await exigirAdmin(req, reply))) return reply;
    return { usuarios: await ctx.admin!.usuarios(String(req.query.busca ?? '').slice(0, 100)) };
  });

  app.get('/v1/admin/pedidos', async (req, reply) => {
    if (!(await exigirAdmin(req, reply))) return reply;
    return { pedidos: await ctx.admin!.pedidos() };
  });

  app.get('/v1/admin/erros', async (req, reply) => {
    if (!(await exigirAdmin(req, reply))) return reply;
    return { erros: await ctx.admin!.erros() };
  });

  // Cortesia ou correção manual de créditos. Fica no livro-razão com o autor e o motivo.
  app.post<{ Params: { id: string } }>('/v1/admin/usuarios/:id/creditos', async (req, reply) => {
    const admin = await exigirAdmin(req, reply);
    if (!admin) return reply;
    const corpo = ajuste.safeParse(req.body);
    if (!corpo.success) return erro(reply, 400, corpo.error.issues[0]!.message);
    const alvo = await ctx.contas.buscarPorId(req.params.id).catch(() => null);
    if (!alvo) return erro(reply, 404, 'Usuário não encontrado.');
    await ctx.contas.lancar({
      usuarioId: alvo.id,
      tipo: corpo.data.tipo,
      quantidade: corpo.data.quantidade,
      motivo: `Ajuste manual (${admin.email}): ${corpo.data.motivo}`,
      referencia: `admin:${randomUUID()}`,
    });
    return { ok: true, saldo: await ctx.contas.saldo(alvo.id) };
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
