import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { hashToken, novoTokenSessao } from '../contas/senha.js';
import { erro, usuarioDaRequisicao, type Contexto } from '../contexto.js';
import { mensagemConviteEquipe } from '../email/mensagens.js';
import { contaEmUso, limiteMembros, podeGerir } from '../equipe/conta.js';
import { limiteMembrosDoPlano } from '../produtos.js';

const VALIDADE_CONVITE_MS = 7 * 24 * 3600 * 1000;
const papelMembro = z.enum(['administrador', 'tecnico']);
const novoConvite = z.object({ email: z.string().trim().email('E-mail inválido.').max(200), papel: papelMembro });
const comToken = z.object({ token: z.string().min(20).max(200) });

// Convites mandam e-mail: limite próprio, folgado para convidar a equipe toda de uma vez.
const LIMITE_CONVITES = { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } };

/**
 * Equipes do plano Escritório. O responsável (quem assina) convida pessoas por
 * e-mail; elas usam os créditos e a carteira da conta dele.
 */
export function rotasEquipe(app: FastifyInstance, ctx: Contexto) {
  const semBanco = 'As equipes precisam do banco de dados.';

  app.get('/v1/equipe', async (req, reply) => {
    const u = await usuarioDaRequisicao(ctx, req);
    if (!u) return erro(reply, 401, 'Entre na sua conta.');
    const conta = await contaEmUso(ctx, u);
    const limite = await limiteMembros(ctx, conta.contaId);
    const gere = podeGerir(conta);
    if (!ctx.equipe || !conta.equipe) {
      return { papel: 'responsavel', donoNome: u.nome, limite, ocupacao: 1, membros: [], convites: [], podeGerir: gere };
    }
    const { equipeId } = conta.equipe;
    const membros = await ctx.equipe.membros(equipeId);
    return {
      papel: conta.equipe.papel,
      donoNome: conta.equipe.donoNome,
      limite,
      ocupacao: await ctx.equipe.ocupacao(equipeId),
      // Técnico vê quem está na equipe, mas não os e-mails nem o uso de cada um.
      membros: gere ? membros : membros.map(({ usuarioId, nome, papel }) => ({ usuarioId, nome, papel })),
      convites: gere ? await ctx.equipe.convitesPendentes(equipeId) : [],
      podeGerir: gere,
    };
  });

  app.post('/v1/equipe/convites', LIMITE_CONVITES, async (req, reply) => {
    const u = await usuarioDaRequisicao(ctx, req);
    if (!u) return erro(reply, 401, 'Entre na sua conta.');
    if (!ctx.equipe) return erro(reply, 503, semBanco);
    const conta = await contaEmUso(ctx, u);
    if (!podeGerir(conta)) return erro(reply, 403, 'Só o responsável e os administradores convidam pessoas.');
    const corpo = novoConvite.safeParse(req.body);
    if (!corpo.success) {
      const p = corpo.error.issues[0]!;
      return erro(reply, 400, p.message, p.path.join('.'));
    }

    const limite = await limiteMembros(ctx, conta.contaId);
    if (limite <= 1) {
      const escritorio = (await ctx.config.obter()).planos.find((p) => p.ativo && limiteMembrosDoPlano(p) > 1);
      return erro(
        reply,
        402,
        escritorio
          ? `Seu plano não inclui equipe. O plano ${escritorio.nome} inclui até ${limiteMembrosDoPlano(escritorio)} pessoas.`
          : 'Seu plano não inclui equipe.',
      );
    }
    const equipeId = conta.equipe?.equipeId ?? (await ctx.equipe.garantir(conta.contaId));
    if ((await ctx.equipe.ocupacao(equipeId)) >= limite) {
      return erro(reply, 409, `A equipe já tem ${limite} pessoas, contando os convites em aberto. Remova alguém ou cancele um convite.`);
    }

    const { token, hash } = novoTokenSessao();
    const r = await ctx.equipe.convidar(equipeId, corpo.data.email, corpo.data.papel, hash, u.id, new Date(Date.now() + VALIDADE_CONVITE_MS));
    if (r === 'ja_na_equipe') return erro(reply, 409, 'Esta pessoa já faz parte da equipe.', 'email');
    if (r === 'ja_convidado') return erro(reply, 409, 'Já existe um convite em aberto para este e-mail.', 'email');

    const responsavel = conta.equipe?.donoNome ?? u.nome;
    const link = `${config.webOrigin}/convite?token=${encodeURIComponent(token)}`;
    try {
      await ctx.email.enviar(mensagemConviteEquipe(u.nome, responsavel, corpo.data.papel, corpo.data.email.toLowerCase(), link));
    } catch (e) {
      req.log.error(e, 'falha ao enviar o convite da equipe');
    }
    return reply.status(201).send({ ok: true });
  });

  app.delete<{ Params: { id: string } }>('/v1/equipe/convites/:id', async (req, reply) => {
    const u = await usuarioDaRequisicao(ctx, req);
    if (!u) return erro(reply, 401, 'Entre na sua conta.');
    const conta = await contaEmUso(ctx, u);
    if (!ctx.equipe || !conta.equipe || !podeGerir(conta)) return erro(reply, 403, 'Só o responsável e os administradores cancelam convites.');
    if (!(await ctx.equipe.cancelarConvite(conta.equipe.equipeId, req.params.id))) return erro(reply, 404, 'Convite não encontrado.');
    return { ok: true };
  });

  app.patch<{ Params: { id: string } }>('/v1/equipe/membros/:id', async (req, reply) => {
    const u = await usuarioDaRequisicao(ctx, req);
    if (!u) return erro(reply, 401, 'Entre na sua conta.');
    const conta = await contaEmUso(ctx, u);
    if (!ctx.equipe || !conta.equipe || !podeGerir(conta)) return erro(reply, 403, 'Só o responsável e os administradores mudam papéis.');
    const corpo = z.object({ papel: papelMembro }).safeParse(req.body);
    if (!corpo.success) return erro(reply, 400, 'Papel inválido.');
    // O responsável não está entre os membros: o papel dele não muda por aqui.
    if (!(await ctx.equipe.mudarPapel(conta.equipe.equipeId, req.params.id, corpo.data.papel))) return erro(reply, 404, 'Pessoa não encontrada na equipe.');
    return { ok: true };
  });

  /** Remover alguém (responsável e administradores) ou sair da equipe (a própria pessoa). */
  app.delete<{ Params: { id: string } }>('/v1/equipe/membros/:id', async (req, reply) => {
    const u = await usuarioDaRequisicao(ctx, req);
    if (!u) return erro(reply, 401, 'Entre na sua conta.');
    const conta = await contaEmUso(ctx, u);
    if (!ctx.equipe || !conta.equipe) return erro(reply, 404, 'Você não está em uma equipe.');
    const saindo = req.params.id === u.id;
    if (saindo && conta.equipe.papel === 'responsavel') {
      return erro(reply, 400, 'O responsável não sai da equipe: remova as pessoas, ou cancele o plano.');
    }
    if (!saindo && !podeGerir(conta)) return erro(reply, 403, 'Só o responsável e os administradores removem pessoas.');
    if (!(await ctx.equipe.remover(conta.equipe.equipeId, req.params.id))) return erro(reply, 404, 'Pessoa não encontrada na equipe.');
    return { ok: true };
  });

  // ---- convite (a pessoa convidada) ----

  /** O que o link mostra antes de aceitar. Token no corpo (POST), para não ir parar nos logs de acesso. */
  app.post('/v1/convites/ver', LIMITE_CONVITES, async (req, reply) => {
    if (!ctx.equipe) return erro(reply, 503, semBanco);
    const corpo = comToken.safeParse(req.body);
    const c = corpo.success ? await ctx.equipe.convitePorToken(hashToken(corpo.data.token)) : null;
    if (!c) return erro(reply, 404, 'Convite não encontrado. Confira o link do e-mail.');
    return { donoNome: c.donoNome, papel: c.papel, email: c.email, situacao: c.situacao };
  });

  app.post('/v1/convites/aceitar', LIMITE_CONVITES, async (req, reply) => {
    const u = await usuarioDaRequisicao(ctx, req);
    if (!u) return erro(reply, 401, 'Entre na sua conta para aceitar o convite.');
    if (!ctx.equipe) return erro(reply, 503, semBanco);
    const corpo = comToken.safeParse(req.body);
    const tokenHash = corpo.success ? hashToken(corpo.data.token) : '';
    const c = tokenHash ? await ctx.equipe.convitePorToken(tokenHash) : null;
    if (!c || c.situacao !== 'pendente') return erro(reply, 400, 'Este convite já foi usado, foi cancelado ou venceu. Peça um novo.');
    // O link vale só para quem recebeu: com outro e-mail, o convite não serve.
    if (c.email !== u.email.toLowerCase()) {
      return erro(reply, 403, `Este convite foi enviado para ${c.email}. Entre com a conta desse e-mail para aceitar.`);
    }
    if (c.donoId === u.id) return erro(reply, 400, 'Você é o responsável por esta equipe.');
    if (await ctx.contas.assinaturaAtual(u.id)) {
      return erro(reply, 409, 'Você tem uma assinatura própria. Cancele-a em Planos antes de entrar na equipe, para não pagar em dobro.');
    }

    const r = await ctx.equipe.aceitar(tokenHash, u.id);
    if (r === 'invalido') return erro(reply, 400, 'Este convite já foi usado, foi cancelado ou venceu. Peça um novo.');
    if (r === 'ja_em_equipe') {
      return erro(reply, 409, 'Você já está em outra equipe (ou é responsável por uma com pessoas). Saia dela antes de aceitar este convite.');
    }
    // O link chegou no e-mail da pessoa: isso confirma o e-mail.
    if (!u.emailConfirmado) await ctx.contas.confirmarEmail(u.id);
    return { ok: true, saldo: await ctx.contas.saldo(c.donoId), equipe: { papel: c.papel, donoNome: c.donoNome } };
  });
}
