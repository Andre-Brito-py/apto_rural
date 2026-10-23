import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { conferirSenha, gerarHashSenha, novoTokenSessao, hashToken } from '../contas/senha.js';
import type { TipoCredito, TipoTokenEmail, Usuario } from '../contas/tipos.js';
import { COOKIE_SESSAO, ehAdmin, erro, opcoesCookie, usuarioDaRequisicao, type Contexto } from '../contexto.js';
import { mensagemConfirmacao, mensagemRedefinirSenha } from '../email/mensagens.js';
import { CREDITOS_BOAS_VINDAS } from '../produtos.js';

const cadastro = z.object({
  nome: z.string().trim().min(2, 'Informe seu nome.').max(120),
  email: z.string().trim().email('E-mail inválido.').max(200),
  whatsapp: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, ''))
    .refine((v) => v === '' || (v.length >= 10 && v.length <= 13), 'WhatsApp inválido.')
    .optional(),
  profissao: z.string().trim().max(80).optional(),
  senha: z.string().min(10, 'A senha precisa de pelo menos 10 caracteres.').max(200),
  aceiteTermos: z.literal(true, { errorMap: () => ({ message: 'É preciso aceitar os termos de uso e a política de privacidade.' }) }),
});

const entrada = z.object({
  email: z.string().trim().email('E-mail inválido.'),
  senha: z.string().min(1, 'Informe a senha.').max(200),
});

const LIMITE_LOGIN = { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } };
const LIMITE_EMAIL = { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } };
const HORAS = 3600 * 1000;
const VALIDADE = { confirmacao: 48 * HORAS, senha: 1 * HORAS };

const comToken = z.object({ token: z.string().min(20).max(200) });
const redefinir = comToken.extend({ senha: z.string().min(10, 'A senha precisa de pelo menos 10 caracteres.').max(200) });

export function rotasContas(app: FastifyInstance, ctx: Contexto) {
  async function abrirSessao(usuarioId: string, reply: Parameters<typeof erro>[0]) {
    const { token, hash } = novoTokenSessao();
    const expira = new Date(Date.now() + config.sessaoDias * 24 * 3600 * 1000);
    await ctx.contas.criarSessao(usuarioId, hash, expira);
    reply.setCookie(COOKIE_SESSAO, token, opcoesCookie(expira));
  }

  /** Cria o token, guarda só o hash e manda o link por e-mail. */
  async function enviarLink(u: Usuario, tipo: TipoTokenEmail) {
    const { token, hash } = novoTokenSessao();
    await ctx.contas.criarTokenEmail(u.id, tipo, hash, new Date(Date.now() + VALIDADE[tipo]));
    const caminho = tipo === 'confirmacao' ? 'confirmar-email' : 'redefinir-senha';
    const link = `${config.webOrigin}/${caminho}?token=${encodeURIComponent(token)}`;
    const msg = tipo === 'confirmacao' ? mensagemConfirmacao(u.nome, u.email, link) : mensagemRedefinirSenha(u.nome, u.email, link);
    await ctx.email.enviar(msg);
  }

  /** Confirma o e-mail e, na primeira vez, libera a amostra grátis. */
  async function confirmar(usuarioId: string) {
    if (!(await ctx.contas.confirmarEmail(usuarioId))) return;
    for (const [tipo, quantidade] of Object.entries(CREDITOS_BOAS_VINDAS) as [TipoCredito, number][]) {
      if (quantidade > 0) {
        await ctx.contas.lancar({ usuarioId, tipo, quantidade, motivo: 'Amostra grátis', referencia: `boas-vindas:${usuarioId}:${tipo}` });
      }
    }
  }

  app.post('/v1/conta', LIMITE_LOGIN, async (req, reply) => {
    const corpo = cadastro.safeParse(req.body);
    if (!corpo.success) {
      const p = corpo.error.issues[0]!;
      return erro(reply, 400, p.message, p.path.join('.'));
    }
    const { senha, aceiteTermos: _, ...dados } = corpo.data;
    const criado = await ctx.contas.criarUsuario({
      ...dados,
      whatsapp: dados.whatsapp || undefined,
      senhaHash: await gerarHashSenha(senha),
    });
    if (criado === 'email_existe') return erro(reply, 409, 'Já existe uma conta com este e-mail.', 'email');

    // A amostra grátis só entra quando o e-mail for confirmado (evita contas falsas em série).
    try {
      await enviarLink(criado, 'confirmacao');
    } catch (e) {
      req.log.error(e, 'falha ao enviar e-mail de confirmação');
    }
    await abrirSessao(criado.id, reply);
    return reply.status(201).send({ usuario: criado, saldo: await ctx.contas.saldo(criado.id) });
  });

  app.post('/v1/sessao', LIMITE_LOGIN, async (req, reply) => {
    const corpo = entrada.safeParse(req.body);
    if (!corpo.success) return erro(reply, 400, corpo.error.issues[0]!.message);
    const u = await ctx.contas.buscarPorEmail(corpo.data.email);
    // Mesma mensagem para e-mail inexistente e senha errada.
    if (!u || !(await conferirSenha(corpo.data.senha, u.senhaHash))) {
      return erro(reply, 401, 'E-mail ou senha incorretos.');
    }
    await abrirSessao(u.id, reply);
    const { senhaHash: _, ...usuario } = u;
    return { usuario, saldo: await ctx.contas.saldo(u.id), admin: ehAdmin(usuario) };
  });

  app.delete('/v1/sessao', async (req, reply) => {
    const token = req.cookies[COOKIE_SESSAO];
    if (token) await ctx.contas.apagarSessao(hashToken(token));
    reply.clearCookie(COOKIE_SESSAO, opcoesCookie());
    return { ok: true };
  });

  app.get('/v1/eu', async (req, reply) => {
    const u = await usuarioDaRequisicao(ctx, req);
    if (!u) return erro(reply, 401, 'Entre na sua conta.');
    return { usuario: u, saldo: await ctx.contas.saldo(u.id), admin: ehAdmin(u) };
  });

  app.post('/v1/conta/confirmar', LIMITE_EMAIL, async (req, reply) => {
    const corpo = comToken.safeParse(req.body);
    const usuarioId = corpo.success ? await ctx.contas.consumirTokenEmail(hashToken(corpo.data.token), 'confirmacao') : null;
    if (!usuarioId) return erro(reply, 400, 'Este link de confirmação é inválido, já foi usado ou venceu. Peça um novo na sua conta.');
    await confirmar(usuarioId);
    return { ok: true, saldo: await ctx.contas.saldo(usuarioId) };
  });

  app.post('/v1/conta/confirmacao', LIMITE_EMAIL, async (req, reply) => {
    const u = await usuarioDaRequisicao(ctx, req);
    if (!u) return erro(reply, 401, 'Entre na sua conta.');
    if (u.emailConfirmado) return { ok: true, jaConfirmado: true };
    await enviarLink(u, 'confirmacao');
    return { ok: true };
  });

  // Sempre a mesma resposta: não revela se o e-mail tem conta.
  app.post('/v1/senha/esqueci', LIMITE_EMAIL, async (req, reply) => {
    const corpo = z.object({ email: z.string().trim().email('E-mail inválido.') }).safeParse(req.body);
    if (!corpo.success) return erro(reply, 400, corpo.error.issues[0]!.message, 'email');
    const u = await ctx.contas.buscarPorEmail(corpo.data.email);
    if (u) {
      const { senhaHash: _, ...usuario } = u;
      enviarLink(usuario, 'senha').catch((e) => req.log.error(e, 'falha ao enviar e-mail de senha'));
    }
    return { ok: true, mensagem: 'Se houver uma conta com este e-mail, enviamos um link para criar uma nova senha.' };
  });

  app.post('/v1/senha/redefinir', LIMITE_EMAIL, async (req, reply) => {
    const corpo = redefinir.safeParse(req.body);
    if (!corpo.success) {
      const p = corpo.error.issues[0]!;
      return erro(reply, 400, p.message, p.path.join('.'));
    }
    const usuarioId = await ctx.contas.consumirTokenEmail(hashToken(corpo.data.token), 'senha');
    if (!usuarioId) return erro(reply, 400, 'Este link é inválido, já foi usado ou venceu. Peça um novo.');
    await ctx.contas.definirSenha(usuarioId, await gerarHashSenha(corpo.data.senha));
    // Senha nova derruba as sessões abertas em outros aparelhos.
    await ctx.contas.apagarSessoesDoUsuario(usuarioId);
    // Quem recebeu o link no e-mail provou que ele é seu.
    await confirmar(usuarioId);
    await abrirSessao(usuarioId, reply);
    return { usuario: await ctx.contas.buscarPorId(usuarioId), saldo: await ctx.contas.saldo(usuarioId) };
  });
}
