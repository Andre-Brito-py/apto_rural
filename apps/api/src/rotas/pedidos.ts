import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { normalizarDocumento } from '../documento.js';
import { erro, usuarioDaRequisicao, type Contexto } from '../contexto.js';
import { aplicarEvento } from '../pagamentos/aplicar.js';

const novoPedido = z.object({
  produto: z.string(),
  /** CPF/CNPJ do pagador: vai direto ao provedor de pagamento, não é guardado. */
  documento: z.string().max(20).optional(),
});

export function rotasPedidos(app: FastifyInstance, ctx: Contexto) {
  app.get('/v1/produtos', async () => ({
    produtos: (await ctx.config.obter()).produtos.filter((p) => p.ativo),
    pagamentoDisponivel: ctx.pagamento != null,
    exigeDocumento: ctx.pagamento?.exigeDocumento ?? false,
    simulado: ctx.pagamento?.nome === 'simulado',
  }));

  app.post('/v1/pedidos', async (req, reply) => {
    const u = await usuarioDaRequisicao(ctx, req);
    if (!u) return erro(reply, 401, 'Entre na sua conta para comprar.');
    if (!ctx.pagamento) return erro(reply, 503, 'Pagamentos ainda não estão disponíveis.');

    const corpo = novoPedido.safeParse(req.body);
    const produtos = (await ctx.config.obter()).produtos;
    const p = corpo.success ? produtos.find((x) => x.id === corpo.data.produto && x.ativo) : undefined;
    if (!corpo.success || !p) return erro(reply, 400, 'Produto inválido.');

    let cpfCnpj: string | undefined;
    if (ctx.pagamento.exigeDocumento && !u.pagamentoClienteId) {
      cpfCnpj = normalizarDocumento(corpo.data.documento ?? '') ?? undefined;
      if (!cpfCnpj) return erro(reply, 400, 'Informe um CPF ou CNPJ válido para a cobrança.', 'documento');
    }

    // Preço, créditos e nome ficam fixados no pedido: mudar o pacote depois não muda esta compra.
    const pedido = await ctx.contas.criarPedido({
      usuarioId: u.id,
      produto: p.id,
      valor: p.valor,
      provedor: ctx.pagamento.nome,
      creditos: p.creditos,
      nomeProduto: p.nome,
    });
    try {
      const cobranca = await ctx.pagamento.criarCobranca({
        pedidoId: pedido.id,
        valor: p.valor,
        descricao: `Apto Rural — ${p.nome}`,
        cliente: { id: u.pagamentoClienteId, nome: u.nome, email: u.email, whatsapp: u.whatsapp, cpfCnpj },
      });
      if (!u.pagamentoClienteId) await ctx.contas.definirClientePagamento(u.id, cobranca.clienteId);
      await ctx.contas.atualizarPedido(pedido.id, { provedorId: cobranca.provedorId, link: cobranca.link });
      return reply.status(201).send({ id: pedido.id, link: cobranca.link });
    } catch (e) {
      req.log.error(e, 'falha ao criar cobrança');
      await ctx.contas.atualizarPedido(pedido.id, { status: 'cancelado' });
      return erro(reply, 502, 'Não foi possível gerar a cobrança agora. Tente de novo em instantes.');
    }
  });

  app.get('/v1/pedidos', async (req, reply) => {
    const u = await usuarioDaRequisicao(ctx, req);
    if (!u) return erro(reply, 401, 'Entre na sua conta.');
    return { pedidos: await ctx.contas.pedidosDoUsuario(u.id) };
  });

  app.get<{ Params: { id: string } }>('/v1/pedidos/:id', async (req, reply) => {
    const u = await usuarioDaRequisicao(ctx, req);
    const pedido = await ctx.contas.buscarPedido(req.params.id);
    if (!u || !pedido || pedido.usuarioId !== u.id) return erro(reply, 404, 'Pedido não encontrado.');
    return { pedido, produto: { nome: pedido.nomeProduto ?? pedido.produto } };
  });

  // Webhook do Asaas: valida o token, guarda o evento (dedup) e aplica.
  app.post('/v1/webhooks/asaas', { config: { rateLimit: false } }, async (req, reply) => {
    if (!ctx.pagamento || ctx.pagamento.nome !== 'asaas') return erro(reply, 404, 'Não encontrado.');
    const evento = ctx.pagamento.lerWebhook(req.headers, req.body);
    if (!evento) return erro(reply, 401, 'Token inválido.');
    if (evento.tipo === 'ignorar' || !evento.id) return { ok: true };
    if (!(await ctx.contas.registrarEvento(evento.id, 'asaas', req.body))) return { ok: true, repetido: true };

    const pedido =
      (await ctx.contas.buscarPedidoPorProvedor(evento.provedorId)) ??
      (evento.pedidoId ? await ctx.contas.buscarPedido(evento.pedidoId) : null);
    if (!pedido) {
      req.log.warn({ evento }, 'webhook sem pedido correspondente');
      return { ok: true };
    }
    await aplicarEvento(ctx.contas, pedido, evento.tipo);
    return { ok: true };
  });

  // Só no modo demonstração com pagamento simulado: confirma o pedido.
  if (config.demo) {
    app.post<{ Params: { id: string } }>('/v1/dev/pedidos/:id/pagar', async (req, reply) => {
      if (ctx.pagamento?.nome !== 'simulado') return erro(reply, 404, 'Não encontrado.');
      const u = await usuarioDaRequisicao(ctx, req);
      const pedido = await ctx.contas.buscarPedido(req.params.id);
      if (!u || !pedido || pedido.usuarioId !== u.id) return erro(reply, 404, 'Pedido não encontrado.');
      await aplicarEvento(ctx.contas, pedido, 'pago');
      return { ok: true, saldo: await ctx.contas.saldo(u.id) };
    });
  }
}
