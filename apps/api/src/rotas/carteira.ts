import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { LIMITE_CARTEIRA } from '../carteira/repositorio.js';
import { erro, usuarioDaRequisicao, type Contexto } from '../contexto.js';

const adicionar = z.object({
  consultaId: z.string(),
  apelido: z.string().trim().max(80).optional(),
});

export function rotasCarteira(app: FastifyInstance, ctx: Contexto) {
  app.get('/v1/carteira', async (req, reply) => {
    const u = await usuarioDaRequisicao(ctx, req);
    if (!u) return erro(reply, 401, 'Entre na sua conta.');
    if (!ctx.carteira) return { imoveis: [], limite: LIMITE_CARTEIRA, disponivel: false };
    return { imoveis: await ctx.carteira.listar(u.id), limite: LIMITE_CARTEIRA, disponivel: true };
  });

  app.post('/v1/carteira', async (req, reply) => {
    const u = await usuarioDaRequisicao(ctx, req);
    if (!u) return erro(reply, 401, 'Entre na sua conta.');
    if (!ctx.carteira) return erro(reply, 503, 'A carteira precisa das bases reais carregadas.');
    const corpo = adicionar.safeParse(req.body);
    if (!corpo.success) return erro(reply, 400, 'Dados inválidos.');
    const r = await ctx.carteira.adicionarDeConsulta(u.id, corpo.data.consultaId, corpo.data.apelido);
    if (r === 'nao_encontrada') return erro(reply, 404, 'Só dá para acompanhar imóveis de consultas reais feitas por você.');
    if (r === 'limite') return erro(reply, 409, `A carteira comporta até ${LIMITE_CARTEIRA} imóveis. Remova um para incluir outro.`);
    return reply.status(201).send(r);
  });

  app.delete<{ Params: { id: string } }>('/v1/carteira/:id', async (req, reply) => {
    const u = await usuarioDaRequisicao(ctx, req);
    if (!u) return erro(reply, 401, 'Entre na sua conta.');
    if (!ctx.carteira || !(await ctx.carteira.remover(u.id, req.params.id))) return erro(reply, 404, 'Imóvel não encontrado.');
    return { ok: true };
  });

  app.get('/v1/avisos', async (req, reply) => {
    const u = await usuarioDaRequisicao(ctx, req);
    if (!u) return erro(reply, 401, 'Entre na sua conta.');
    if (!ctx.carteira) return { avisos: [], naoLidos: 0 };
    return { avisos: await ctx.carteira.avisos(u.id), naoLidos: await ctx.carteira.avisosNaoLidos(u.id) };
  });

  app.post('/v1/avisos/lidos', async (req, reply) => {
    const u = await usuarioDaRequisicao(ctx, req);
    if (!u) return erro(reply, 401, 'Entre na sua conta.');
    await ctx.carteira?.marcarAvisosLidos(u.id);
    return { ok: true };
  });
}
