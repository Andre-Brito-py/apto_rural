import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { limiteCarteira } from '../assinaturas/mensalidades.js';
import { erro, usuarioDaRequisicao, type Contexto } from '../contexto.js';
import { contaEmUso, pessoasDaConta, podeGerir } from '../equipe/conta.js';

const adicionar = z.object({
  consultaId: z.string(),
  apelido: z.string().trim().max(80).optional(),
});

/**
 * Carteira da conta em uso: na equipe, todos veem e incluem imóveis na carteira
 * do responsável; tirar imóveis é do responsável e dos administradores.
 */
export function rotasCarteira(app: FastifyInstance, ctx: Contexto) {
  // Com assinatura ativa vale o limite do plano; sem ela, o limite geral do painel.
  const limite = (contaId: string) => limiteCarteira(ctx, contaId);

  async function contaDaRequisicao(req: FastifyRequest) {
    const u = await usuarioDaRequisicao(ctx, req);
    return u ? { u, conta: await contaEmUso(ctx, u) } : null;
  }

  app.get('/v1/carteira', async (req, reply) => {
    const r = await contaDaRequisicao(req);
    if (!r) return erro(reply, 401, 'Entre na sua conta.');
    const { contaId } = r.conta;
    const podeRemover = podeGerir(r.conta);
    if (!ctx.carteira) return { imoveis: [], limite: await limite(contaId), disponivel: false, podeRemover };
    return { imoveis: await ctx.carteira.listar(contaId), limite: await limite(contaId), disponivel: true, podeRemover };
  });

  app.post('/v1/carteira', async (req, reply) => {
    const r = await contaDaRequisicao(req);
    if (!r) return erro(reply, 401, 'Entre na sua conta.');
    if (!ctx.carteira) return erro(reply, 503, 'A carteira precisa das bases reais carregadas.');
    const corpo = adicionar.safeParse(req.body);
    if (!corpo.success) return erro(reply, 400, 'Dados inválidos.');
    const max = await limite(r.conta.contaId);
    const autores = await pessoasDaConta(ctx, r.conta);
    const novo = await ctx.carteira.adicionarDeConsulta(r.conta.contaId, autores, corpo.data.consultaId, corpo.data.apelido, max);
    if (novo === 'nao_encontrada') return erro(reply, 404, 'Só dá para acompanhar imóveis de consultas reais feitas por você ou pela sua equipe.');
    if (novo === 'limite') {
      return erro(reply, 409, `A carteira comporta até ${max} imóveis. Assine um plano para acompanhar mais, ou remova um para incluir outro.`);
    }
    return reply.status(201).send(novo);
  });

  app.delete<{ Params: { id: string } }>('/v1/carteira/:id', async (req, reply) => {
    const r = await contaDaRequisicao(req);
    if (!r) return erro(reply, 401, 'Entre na sua conta.');
    if (!podeGerir(r.conta)) return erro(reply, 403, 'Só o responsável e os administradores da equipe tiram imóveis da carteira.');
    if (!ctx.carteira || !(await ctx.carteira.remover(r.conta.contaId, req.params.id))) return erro(reply, 404, 'Imóvel não encontrado.');
    return { ok: true };
  });

  app.get('/v1/avisos', async (req, reply) => {
    const r = await contaDaRequisicao(req);
    if (!r) return erro(reply, 401, 'Entre na sua conta.');
    if (!ctx.carteira) return { avisos: [], naoLidos: 0 };
    const { contaId } = r.conta;
    return { avisos: await ctx.carteira.avisos(contaId), naoLidos: await ctx.carteira.avisosNaoLidos(contaId) };
  });

  app.post('/v1/avisos/lidos', async (req, reply) => {
    const r = await contaDaRequisicao(req);
    if (!r) return erro(reply, 401, 'Entre na sua conta.');
    await ctx.carteira?.marcarAvisosLidos(r.conta.contaId);
    return { ok: true };
  });
}
