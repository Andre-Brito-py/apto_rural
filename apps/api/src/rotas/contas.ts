import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { conferirSenha, gerarHashSenha, novoTokenSessao, hashToken } from '../contas/senha.js';
import type { TipoCredito, TipoTokenEmail, Usuario } from '../contas/tipos.js';
import { enviarLinkEmail } from '../contas/links.js';
import { TentativasLogin } from '../contas/tentativas.js';
import { COOKIE_SESSAO, erro, hojeBrasilia, nivelAdmin, opcoesCookie, usuarioDaRequisicao, type Contexto } from '../contexto.js';
import { hashEmail } from '../documento.js';
import { contaEmUso } from '../equipe/conta.js';
import { mensagemContaExcluida } from '../email/mensagens.js';

/**
 * Senha nova: sem espaço no começo nem no fim. Assim o login pode ignorar os
 * espaços que vêm sem querer ao copiar e colar, sem confundir duas senhas.
 */
const senhaNova = z
  .string()
  .min(10, 'A senha precisa de pelo menos 10 caracteres.')
  .max(200)
  .refine((s) => s === s.trim(), 'A senha não pode começar nem terminar com espaço.');

/** Senha digitada para entrar ou confirmar: espaços nas pontas são ignorados (copiar e colar). */
const senhaDigitada = (vazia: string) => z.string().max(200).trim().min(1, vazia);

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
  senha: senhaNova,
  aceiteTermos: z.literal(true, { error: 'É preciso aceitar os termos de uso e a política de privacidade.' }),
});

const entrada = z.object({
  email: z.string().trim().email('E-mail inválido.'),
  senha: senhaDigitada('Informe a senha.'),
});

const LIMITE_LOGIN = { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } };
const LIMITE_EMAIL = { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } };
// Confirmar o e-mail: o link traz um código aleatório de 256 bits (impossível de adivinhar), então o
// freio só evita abuso. Com 5, o 6º técnico de um escritório atrás do mesmo endereço de internet
// não conseguia confirmar a conta (achado nos testes de navegador).
const LIMITE_CONFIRMAR = { config: { rateLimit: { max: 30, timeWindow: '15 minutes' } } };

const comToken = z.object({ token: z.string().min(20).max(200) });
const redefinir = comToken.extend({ senha: senhaNova });

export function rotasContas(app: FastifyInstance, ctx: Contexto) {
  const tentativas = new TentativasLogin();
  // Conferir contra um hash qualquer quando o e-mail não existe gasta o mesmo tempo do scrypt.
  const hashFalso = gerarHashSenha(randomBytes(16).toString('hex'));
  async function abrirSessao(usuarioId: string, reply: Parameters<typeof erro>[0]) {
    const { token, hash } = novoTokenSessao();
    const expira = new Date(Date.now() + config.sessaoDias * 24 * 3600 * 1000);
    await ctx.contas.criarSessao(usuarioId, hash, expira);
    reply.setCookie(COOKIE_SESSAO, token, opcoesCookie(expira));
  }

  const enviarLink = (u: Usuario, tipo: TipoTokenEmail) => enviarLinkEmail(ctx, u, tipo);

  /** Saldo da conta em uso (na equipe, o da equipe) e o papel da pessoa nela. */
  async function saldoEEquipe(u: Usuario) {
    const conta = await contaEmUso(ctx, u);
    return {
      saldo: await ctx.contas.saldo(conta.contaId),
      equipe: conta.equipe ? { papel: conta.equipe.papel, donoNome: conta.equipe.donoNome } : undefined,
    };
  }

  /** Confirma o e-mail e, na primeira vez, libera a amostra grátis. */
  async function confirmar(usuarioId: string) {
    if (!(await ctx.contas.confirmarEmail(usuarioId))) return;
    // Quem excluiu a conta e voltou com o mesmo e-mail não ganha a amostra de novo.
    const u = await ctx.contas.buscarPorId(usuarioId);
    if (u && (await ctx.contas.emailJaExcluido(hashEmail(u.email)))) return;
    const boasVindas = (await ctx.config.obter()).creditos_boas_vindas;
    for (const [tipo, quantidade] of Object.entries(boasVindas) as [TipoCredito, number][]) {
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
    const { email, senha } = corpo.data;
    if (tentativas.bloqueado(email)) {
      return erro(reply, 429, 'Muitas tentativas com este e-mail. Aguarde 15 minutos ou crie uma nova senha.');
    }
    const u = await ctx.contas.buscarPorEmail(email);
    // Mesma mensagem e o mesmo tempo de resposta para e-mail inexistente e senha errada.
    const certa = await conferirSenha(senha, u?.senhaHash ?? (await hashFalso));
    if (!u || !certa) {
      tentativas.falhou(email);
      return erro(reply, 401, 'E-mail ou senha incorretos.');
    }
    tentativas.acertou(email);
    // Só depois da senha certa, para não revelar quais contas estão bloqueadas.
    if (u.bloqueado) return erro(reply, 403, 'Esta conta está bloqueada. Fale com o suporte do Apto Rural.');
    await abrirSessao(u.id, reply);
    const { senhaHash: _, ...usuario } = u;
    return { usuario, ...(await saldoEEquipe(usuario)), nivelAdmin: nivelAdmin(usuario) };
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
    // No modo "entrar como", a tela mostra quem está olhando e o botão de voltar.
    const quemOlha = u.personificadoPor ? await ctx.contas.buscarPorId(u.personificadoPor) : null;
    return {
      usuario: u,
      ...(await saldoEEquipe(u)),
      nivelAdmin: nivelAdmin(u),
      personificadoPor: quemOlha ? { nome: quemOlha.nome, email: quemOlha.email } : undefined,
    };
  });

  app.post('/v1/conta/confirmar', LIMITE_CONFIRMAR, async (req, reply) => {
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

  // ---- Direitos do titular (LGPD, art. 18) ----

  /** Arquivo com tudo o que guardamos sobre a pessoa (acesso e portabilidade). */
  app.get('/v1/conta/dados', LIMITE_EMAIL, async (req, reply) => {
    const u = await usuarioDaRequisicao(ctx, req);
    if (!u) return erro(reply, 401, 'Entre na sua conta.');
    // É um direito do titular: o suporte, no modo "entrar como", não baixa os dados de ninguém.
    if (u.personificadoPor) return erro(reply, 403, 'Modo visualização: só o próprio titular pode baixar os dados da conta.');
    const dados = await ctx.contas.exportarDados(u.id);
    const hoje = hojeBrasilia();
    return reply
      .header('Content-Disposition', `attachment; filename="apto-rural-meus-dados-${hoje}.json"`)
      .header('Cache-Control', 'no-store')
      .type('application/json; charset=utf-8')
      .send(
        JSON.stringify(
          {
            sobre: 'Dados da sua conta no Apto Rural (LGPD, art. 18). Senhas e chaves de acesso não são incluídas.',
            geradoEm: new Date().toISOString(),
            ...dados,
          },
          null,
          2,
        ),
      );
  });

  const exclusao = z.object({
    senha: senhaDigitada('Informe sua senha para confirmar.'),
    confirmo: z.literal(true, { error: 'Marque que entende o que acontece com a exclusão.' }),
  });

  /** Exclusão da conta pelo titular. Pede a senha de novo: quem pegou o celular desbloqueado não apaga a conta. */
  app.post('/v1/conta/excluir', LIMITE_LOGIN, async (req, reply) => {
    const u = await usuarioDaRequisicao(ctx, req);
    if (!u) return erro(reply, 401, 'Entre na sua conta.');
    const corpo = exclusao.safeParse(req.body);
    if (!corpo.success) {
      const p = corpo.error.issues[0]!;
      return erro(reply, 400, p.message, p.path.join('.'));
    }
    const comSenha = await ctx.contas.buscarPorEmail(u.email);
    if (!comSenha || !(await conferirSenha(corpo.data.senha, comSenha.senhaHash))) {
      return erro(reply, 401, 'Senha incorreta.', 'senha');
    }

    // Primeiro a cobrança: se o Asaas não cancelar, nada é apagado e a pessoa tenta de novo.
    const assinatura = await ctx.contas.assinaturaAtual(u.id);
    if (assinatura) {
      if (assinatura.provedorId && ctx.pagamento?.nome === assinatura.provedor) {
        try {
          await ctx.pagamento.cancelarAssinatura(assinatura.provedorId);
        } catch (e) {
          req.log.error(e, 'falha ao cancelar assinatura na exclusão da conta');
          return erro(reply, 502, 'Não conseguimos cancelar sua assinatura agora, então nada foi apagado. Tente de novo em instantes.');
        }
      }
      await ctx.contas.atualizarAssinatura(assinatura.id, { status: 'cancelada' });
    }

    const { nome, email } = u;
    await ctx.contas.excluirConta(u.id, hashEmail(email));
    reply.clearCookie(COOKIE_SESSAO, opcoesCookie());
    ctx.email
      .enviar(mensagemContaExcluida(nome, email, config.webOrigin))
      .catch((e) => req.log.error(e, 'falha ao enviar o comprovante de exclusão'));
    req.log.info({ usuarioId: u.id }, 'conta excluída pelo titular');
    return { ok: true };
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
    const dono = await ctx.contas.buscarPorId(usuarioId);
    if (dono) tentativas.acertou(dono.email);
    // Senha nova derruba as sessões abertas em outros aparelhos.
    await ctx.contas.apagarSessoesDoUsuario(usuarioId);
    // Quem recebeu o link no e-mail provou que ele é seu.
    await confirmar(usuarioId);
    await abrirSessao(usuarioId, reply);
    const usuario = (await ctx.contas.buscarPorId(usuarioId))!;
    return { usuario, ...(await saldoEEquipe(usuario)) };
  });
}
