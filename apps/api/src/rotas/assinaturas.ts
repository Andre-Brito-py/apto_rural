import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { aplicarEventoAssinatura, limiteCarteira } from '../assinaturas/mensalidades.js';
import { config } from '../config.js';
import { erro, usuarioDaRequisicao, type Contexto } from '../contexto.js';
import { normalizarDocumento } from '../documento.js';
import { contaEmUso, podePagar } from '../equipe/conta.js';
import { limiteMembrosDoPlano } from '../produtos.js';
import { avaliarCupom, cupomAoCancelarAssinatura, cupomAposMensalidade, MENSAGEM_RESERVA } from '../cupons/aplicar.js';
import { normalizarCodigo } from '../cupons/regras.js';

const novaAssinatura = z.object({
  plano: z.string(),
  /** CPF/CNPJ do pagador: vai direto ao provedor de pagamento, não é guardado. */
  documento: z.string().max(20).optional(),
  /** Código do cupom de desconto (docs/cupons.md). */
  cupom: z.string().trim().max(40).optional(),
});

export function rotasAssinaturas(app: FastifyInstance, ctx: Contexto) {
  app.get('/v1/planos', async () => ({
    planos: (await ctx.config.obter()).planos.filter((p) => p.ativo).map((p) => ({ ...p, limiteMembros: limiteMembrosDoPlano(p) })),
    pagamentoDisponivel: ctx.pagamento != null,
    exigeDocumento: ctx.pagamento?.exigeDocumento ?? false,
  }));

  /** A assinatura em andamento da conta em uso (na equipe, a do responsável) e o limite da carteira que vale hoje. */
  app.get('/v1/assinatura', async (req, reply) => {
    const u = await usuarioDaRequisicao(ctx, req);
    if (!u) return erro(reply, 401, 'Entre na sua conta.');
    const conta = await contaEmUso(ctx, u);
    const assinatura = await ctx.contas.assinaturaAtual(conta.contaId);
    // Com cupom: quantas mensalidades com desconto ainda faltam (null = todas).
    const uso = assinatura?.cupom ? await ctx.cupons.porAssinatura(assinatura.id) : null;
    const desconto =
      uso && !uso.descontoEncerradoEm && uso.status !== 'liberado'
        ? { cupom: assinatura!.cupom!, valorCheio: assinatura!.valorCheio ?? uso.valorOriginal, mesesRestantes: uso.meses == null ? null : Math.max(0, uso.meses - uso.mensalidadesPagas) }
        : null;
    return {
      assinatura: assinatura ? { ...assinatura, desconto } : null,
      limiteCarteira: await limiteCarteira(ctx, conta.contaId),
      podePagar: podePagar(conta),
    };
  });

  app.post('/v1/assinaturas', async (req, reply) => {
    const u = await usuarioDaRequisicao(ctx, req);
    if (!u) return erro(reply, 401, 'Entre na sua conta para assinar.');
    if (!ctx.pagamento) return erro(reply, 503, 'Pagamentos ainda não estão disponíveis.');
    const conta = await contaEmUso(ctx, u);
    if (!podePagar(conta)) return erro(reply, 403, `O plano é da equipe. Quem assina é ${conta.equipe!.donoNome}, responsável pela equipe.`);
    const corpo = novaAssinatura.safeParse(req.body);
    const planos = (await ctx.config.obter()).planos;
    const plano = corpo.success ? planos.find((p) => p.id === corpo.data.plano && p.ativo) : undefined;
    if (!corpo.success || !plano) return erro(reply, 400, 'Plano inválido.');
    const codigo = corpo.data.cupom ? normalizarCodigo(corpo.data.cupom) : undefined;

    const atual = await ctx.contas.assinaturaAtual(u.id);
    if (atual?.status === 'pendente' && atual.planoId === plano.id && atual.link) {
      // Reabre a mesma fatura, se o cupom é o mesmo. Outro cupom pede uma assinatura nova.
      if ((atual.cupom ?? undefined) === codigo || !codigo) return reply.status(200).send({ id: atual.id, link: atual.link });
      return erro(
        reply,
        409,
        'Você já tem uma assinatura deste plano aguardando o primeiro pagamento. Cancele-a abaixo e assine de novo para usar o cupom.',
        'cupom',
      );
    }
    if (atual) return erro(reply, 409, 'Você já tem uma assinatura. Cancele a atual para trocar de plano.');

    // Cupom: a mensalidade com desconto é o que vai para o Asaas; o valor cheio volta sozinho
    // quando acabam os meses de desconto (cupomAposMensalidade).
    const cupom = codigo ? await avaliarCupom(ctx, codigo, { id: plano.id, nome: plano.nome, valor: plano.valorMensal, plano: true }, u) : null;
    if (cupom && !cupom.ok) return erro(reply, 400, cupom.mensagem, 'cupom');
    const valorMensal = cupom?.ok ? cupom.final : plano.valorMensal;

    let cpfCnpj: string | undefined;
    if (ctx.pagamento.exigeDocumento && !u.pagamentoClienteId) {
      cpfCnpj = normalizarDocumento(corpo.data.documento ?? '') ?? undefined;
      if (!cpfCnpj) return erro(reply, 400, 'Informe um CPF ou CNPJ válido para a cobrança.', 'documento');
    }

    const criada = await ctx.contas.criarAssinatura({
      usuarioId: u.id,
      planoId: plano.id,
      nomePlano: plano.nome,
      valorMensal,
      creditos: plano.creditosMensais,
      limiteCarteira: plano.limiteCarteira,
      limiteMembros: limiteMembrosDoPlano(plano),
      provedor: ctx.pagamento.nome,
      cupom: cupom?.ok ? cupom.cupom.codigo : undefined,
      valorCheio: cupom?.ok ? plano.valorMensal : undefined,
    });
    if (criada === 'ja_existe') return erro(reply, 409, 'Você já tem uma assinatura. Cancele a atual para trocar de plano.');
    if (cupom?.ok) {
      const reserva = await ctx.cupons.reservar(cupom.cupom, {
        usuarioId: u.id,
        assinaturaId: criada.id,
        item: plano.id,
        nomeItem: plano.nome,
        valorOriginal: plano.valorMensal,
        valorFinal: valorMensal,
        meses: cupom.meses,
      });
      if (typeof reserva === 'string') {
        await ctx.contas.atualizarAssinatura(criada.id, { status: 'cancelada' });
        return erro(reply, 409, MENSAGEM_RESERVA[reserva], 'cupom');
      }
    }
    try {
      const r = await ctx.pagamento.criarAssinatura({
        assinaturaId: criada.id,
        valorMensal,
        descricao: `Apto Rural — plano ${plano.nome} (mensal)${cupom?.ok ? ` — cupom ${cupom.cupom.codigo}` : ''}`,
        cliente: { id: u.pagamentoClienteId, nome: u.nome, email: u.email, whatsapp: u.whatsapp, cpfCnpj },
      });
      if (!u.pagamentoClienteId) await ctx.contas.definirClientePagamento(u.id, r.clienteId);
      await ctx.contas.atualizarAssinatura(criada.id, { provedorId: r.provedorId, link: r.link });
      return reply.status(201).send({ id: criada.id, link: r.link });
    } catch (e) {
      req.log.error(e, 'falha ao criar assinatura');
      await ctx.contas.atualizarAssinatura(criada.id, { status: 'cancelada' });
      await cupomAoCancelarAssinatura(ctx.cupons, criada.id);
      return erro(reply, 502, 'Não foi possível criar a assinatura agora. Tente de novo em instantes.');
    }
  });

  /** O cliente cancela: a recorrência acaba, os créditos já recebidos continuam dele. */
  app.post('/v1/assinatura/cancelar', async (req, reply) => {
    const u = await usuarioDaRequisicao(ctx, req);
    if (!u) return erro(reply, 401, 'Entre na sua conta.');
    const conta = await contaEmUso(ctx, u);
    if (!podePagar(conta)) return erro(reply, 403, `O plano é da equipe. Só ${conta.equipe!.donoNome}, responsável pela equipe, pode cancelar.`);
    const a = await ctx.contas.assinaturaAtual(u.id);
    if (!a) return erro(reply, 404, 'Você não tem assinatura em andamento.');
    if (a.provedorId && ctx.pagamento?.nome === a.provedor) {
      try {
        await ctx.pagamento.cancelarAssinatura(a.provedorId);
      } catch (e) {
        req.log.error(e, 'falha ao cancelar assinatura no provedor');
        return erro(reply, 502, 'Não foi possível cancelar agora. Tente de novo em instantes.');
      }
    }
    await ctx.contas.atualizarAssinatura(a.id, { status: 'cancelada' });
    await cupomAoCancelarAssinatura(ctx.cupons, a.id);
    return { ok: true };
  });

  // Só no modo demonstração com pagamento simulado: paga uma mensalidade.
  if (config.demo) {
    app.post<{ Params: { id: string } }>('/v1/dev/assinaturas/:id/pagar-mes', async (req, reply) => {
      if (ctx.pagamento?.nome !== 'simulado') return erro(reply, 404, 'Não encontrado.');
      const u = await usuarioDaRequisicao(ctx, req);
      const a = await ctx.contas.buscarAssinatura(req.params.id);
      if (!u || !a || a.usuarioId !== u.id) return erro(reply, 404, 'Assinatura não encontrada.');
      await aplicarEventoAssinatura(
        ctx.contas,
        a,
        { id: randomUUID(), tipo: 'pago', provedorId: `sim_pay_${randomUUID()}`, valor: a.valorMensal },
        (x) => cupomAposMensalidade(ctx, x),
      );
      return { ok: true, saldo: await ctx.contas.saldo(u.id) };
    });
  }
}
