import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { enviarLinkEmail } from '../contas/links.js';
import { hashToken, novoTokenSessao } from '../contas/senha.js';
import type { Usuario } from '../contas/tipos.js';
import { config } from '../config.js';
import { ErroConfiguracao, ESQUEMAS, type ChaveConfig } from '../configuracoes.js';
import { aplicarEvento } from '../pagamentos/aplicar.js';
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

// Chave de API da OpenAI: começa com "sk-" (as de projeto, com "sk-proj-").
const chaveIA = z.object({
  chave: z
    .string()
    .trim()
    .regex(/^sk-[A-Za-z0-9_-]{20,300}$/, 'Isso não parece uma chave da OpenAI: ela começa com "sk-" e é bem longa.'),
});

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

  const idValido = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  // ---- consulta (suporte e admin) ----

  app.get('/v1/admin/resumo', async (req, reply) => {
    if (!(await exigir(req, reply, 'suporte'))) return reply;
    const [resumo, bases, servidor] = await Promise.all([ctx.admin!.resumo(), ctx.admin!.saudeBases(), ctx.admin!.saudeServidor()]);
    return { resumo, bases, servidor: { ...servidor, vigiaAvisoConfigurado: !!config.vigia.url } };
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

  // ---- pedidos: estorno e cancelamento (só admin) ----

  app.post<{ Params: { id: string } }>('/v1/admin/pedidos/:id/estornar', async (req, reply) => {
    const admin = await exigir(req, reply, 'admin');
    if (!admin) return reply;
    const corpo = comMotivo.safeParse(req.body);
    if (!corpo.success) return erro(reply, 400, corpo.error.issues[0]!.message);
    const pedido = await ctx.contas.buscarPedido(req.params.id);
    if (!pedido) return erro(reply, 404, 'Pedido não encontrado.');
    if (pedido.status !== 'pago') return erro(reply, 409, 'Só dá para estornar pedido pago.');
    if (!ctx.pagamento || ctx.pagamento.nome !== pedido.provedor || !pedido.provedorId) {
      return erro(reply, 409, 'Este pedido foi pago por outro meio; estorne pelo painel do provedor.');
    }
    try {
      await ctx.pagamento.estornar(pedido.provedorId, `Apto Rural: ${corpo.data.motivo}`);
    } catch (e) {
      return erro(
        reply,
        502,
        `O Asaas recusou o estorno: ${(e as Error).message}. Boleto pago e Pix sem saldo na conta precisam ser estornados pelo painel do Asaas.`,
      );
    }
    // Retira os créditos já; o webhook PAYMENT_REFUNDED, quando chegar, não lança de novo.
    await aplicarEvento(ctx.contas, pedido, 'estornado');
    await ctx.admin!.registrarMotivoEstorno(pedido.id, corpo.data.motivo);
    await ctx.admin!.auditar(admin.id, 'estornou_pedido', pedido.usuarioId, { pedido: pedido.id, valor: pedido.valor, motivo: corpo.data.motivo });
    return { ok: true, saldo: await ctx.contas.saldo(pedido.usuarioId) };
  });

  app.post<{ Params: { id: string } }>('/v1/admin/pedidos/:id/cancelar', async (req, reply) => {
    const admin = await exigir(req, reply, 'admin');
    if (!admin) return reply;
    const pedido = await ctx.contas.buscarPedido(req.params.id);
    if (!pedido) return erro(reply, 404, 'Pedido não encontrado.');
    if (pedido.status !== 'pendente') return erro(reply, 409, 'Só dá para cancelar pedido que ainda não foi pago.');
    if (ctx.pagamento && ctx.pagamento.nome === pedido.provedor && pedido.provedorId) {
      try {
        await ctx.pagamento.cancelar(pedido.provedorId);
      } catch (e) {
        return erro(reply, 502, `O Asaas recusou o cancelamento: ${(e as Error).message}`);
      }
    }
    await aplicarEvento(ctx.contas, pedido, 'cancelado');
    await ctx.admin!.auditar(admin.id, 'cancelou_pedido', pedido.usuarioId, { pedido: pedido.id, valor: pedido.valor });
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/v1/admin/assinaturas/:id/cancelar', async (req, reply) => {
    const admin = await exigir(req, reply, 'admin');
    if (!admin) return reply;
    const a = await ctx.contas.buscarAssinatura(req.params.id);
    if (!a) return erro(reply, 404, 'Assinatura não encontrada.');
    if (a.status === 'cancelada') return erro(reply, 409, 'Esta assinatura já está cancelada.');
    if (a.provedorId && ctx.pagamento?.nome === a.provedor) {
      try {
        await ctx.pagamento.cancelarAssinatura(a.provedorId);
      } catch (e) {
        return erro(reply, 502, `O Asaas recusou o cancelamento: ${(e as Error).message}`);
      }
    }
    await ctx.contas.atualizarAssinatura(a.id, { status: 'cancelada' });
    await ctx.admin!.auditar(admin.id, 'cancelou_assinatura', a.usuarioId, { assinatura: a.id, plano: a.nomePlano });
    return { ok: true };
  });

  // ---- configurações do negócio (ver: suporte; mudar: admin) ----

  app.get('/v1/admin/configuracoes', async (req, reply) => {
    if (!(await exigir(req, reply, 'suporte'))) return reply;
    return ctx.config.obter();
  });

  app.put<{ Params: { chave: string } }>('/v1/admin/configuracoes/:chave', async (req, reply) => {
    const admin = await exigir(req, reply, 'admin');
    if (!admin) return reply;
    const chave = req.params.chave as ChaveConfig;
    if (!(chave in ESQUEMAS)) return erro(reply, 404, 'Configuração desconhecida.');
    const antes = (await ctx.config.obter())[chave];
    try {
      const depois = await ctx.config.salvar(chave, (req.body as { valor?: unknown })?.valor, admin.id);
      await ctx.admin!.auditar(admin.id, 'mudou_configuracao', null, { chave, antes, depois });
      return { ok: true, valor: depois };
    } catch (e) {
      if (e instanceof ErroConfiguracao) return erro(reply, 400, e.message);
      throw e;
    }
  });

  // ---- inteligência artificial (só admin): a chave nunca volta, só o final dela ----

  app.get('/v1/admin/ia', async (req, reply) => {
    if (!(await exigir(req, reply, 'admin'))) return reply;
    const [configuracao, chave, hoje, mes] = await Promise.all([
      ctx.config.obter().then((c) => c.ia),
      ctx.ia.segredos.info('openai_api_key'),
      ctx.ia.uso.hoje(),
      ctx.ia.uso.doMes(),
    ]);
    return { configuracao, chave, uso: { hoje, mes } };
  });

  app.put('/v1/admin/ia/chave', async (req, reply) => {
    const admin = await exigir(req, reply, 'admin');
    if (!admin) return reply;
    const corpo = chaveIA.safeParse(req.body);
    if (!corpo.success) return erro(reply, 400, corpo.error.issues[0]!.message, 'chave');
    const info = await ctx.ia.segredos.definir('openai_api_key', corpo.data.chave, admin.id);
    // Na auditoria, só o final da chave: o suficiente para saber qual foi cadastrada.
    await ctx.admin!.auditar(admin.id, 'definiu_chave_ia', null, { final: info.final });
    return { chave: info };
  });

  app.delete('/v1/admin/ia/chave', async (req, reply) => {
    const admin = await exigir(req, reply, 'admin');
    if (!admin) return reply;
    await ctx.ia.segredos.apagar('openai_api_key');
    await ctx.admin!.auditar(admin.id, 'apagou_chave_ia', null);
    return { chave: { definida: false } };
  });

  app.post('/v1/admin/ia/testar', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req, reply) => {
    if (!(await exigir(req, reply, 'admin'))) return reply;
    return ctx.ia.explicacao.testar();
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
