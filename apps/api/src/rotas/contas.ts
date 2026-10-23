import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { conferirSenha, gerarHashSenha, novoTokenSessao, hashToken } from '../contas/senha.js';
import { COOKIE_SESSAO, erro, opcoesCookie, usuarioDaRequisicao, type Contexto } from '../contexto.js';
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

export function rotasContas(app: FastifyInstance, ctx: Contexto) {
  async function abrirSessao(usuarioId: string, reply: Parameters<typeof erro>[0]) {
    const { token, hash } = novoTokenSessao();
    const expira = new Date(Date.now() + config.sessaoDias * 24 * 3600 * 1000);
    await ctx.contas.criarSessao(usuarioId, hash, expira);
    reply.setCookie(COOKIE_SESSAO, token, opcoesCookie(expira));
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

    for (const [tipo, quantidade] of Object.entries(CREDITOS_BOAS_VINDAS) as ['consulta' | 'dossie', number][]) {
      if (quantidade > 0) {
        await ctx.contas.lancar({ usuarioId: criado.id, tipo, quantidade, motivo: 'Amostra grátis', referencia: `boas-vindas:${criado.id}:${tipo}` });
      }
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
    return { usuario, saldo: await ctx.contas.saldo(u.id) };
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
    return { usuario: u, saldo: await ctx.contas.saldo(u.id) };
  });
}
