import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { contextoSegredo, conferirSegundaEtapa } from '../contas/doisFatores.js';
import { conferirSenha, hashToken } from '../contas/senha.js';
import { conferirCodigo, enderecoAutenticador, hashRecuperacao, novoSegredo, novosCodigosRecuperacao } from '../contas/totp.js';
import { COOKIE_SESSAO, erro, usuarioDaRequisicao, type Contexto } from '../contexto.js';

// Mesmo freio do login: cada pedido aqui confere uma senha ou um código.
const LIMITE = { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } };

const comSenha = z.object({ senha: z.string().max(200).trim().min(1, 'Informe a senha.') });
const comCodigo = z.object({ codigo: z.string().trim().min(6, 'Digite o código de 6 dígitos.').max(20) });
const paraDesligar = comSenha.extend({ codigo: z.string().trim().min(6, 'Digite o código do aplicativo ou um código de recuperação.').max(20) });

/**
 * Verificação em duas etapas, em Minha conta (docs/seguranca.md): ligar (senha, QR, primeiro
 * código, códigos de recuperação) e desligar (senha e código). Obrigatória em produção para
 * administrador e suporte; opcional para as outras contas.
 */
export function rotasDoisFatores(app: FastifyInstance, ctx: Contexto) {
  async function senhaCerta(email: string, senha: string) {
    const comHash = await ctx.contas.buscarPorEmail(email);
    return comHash != null && (await conferirSenha(senha, comHash.senhaHash));
  }

  app.get('/v1/conta/dois-fatores', async (req, reply) => {
    const u = await usuarioDaRequisicao(ctx, req);
    if (!u) return erro(reply, 401, 'Entre na sua conta.');
    return { ativo: u.doisFatores === true, codigosRestantes: u.doisFatores ? await ctx.contas.codigosRecuperacaoRestantes(u.id) : 0 };
  });

  /** 1º passo: confere a senha e devolve o segredo novo (para o QR). Só fica valendo depois do 1º código certo. */
  app.post('/v1/conta/dois-fatores/iniciar', LIMITE, async (req, reply) => {
    const u = await usuarioDaRequisicao(ctx, req);
    if (!u) return erro(reply, 401, 'Entre na sua conta.');
    if (u.doisFatores) return erro(reply, 409, 'A verificação em duas etapas já está ligada.');
    const corpo = comSenha.safeParse(req.body);
    if (!corpo.success) return erro(reply, 400, corpo.error.issues[0]!.message, 'senha');
    if (!(await senhaCerta(u.email, corpo.data.senha))) return erro(reply, 401, 'Senha incorreta.', 'senha');
    const segredo = novoSegredo();
    await ctx.contas.guardarSegredoPendente(u.id, ctx.ia.segredos.cifrarValor(contextoSegredo(u.id), segredo));
    return { segredo, endereco: enderecoAutenticador(segredo, u.email) };
  });

  /** 2º passo: o primeiro código do aplicativo liga a verificação e gera os códigos de recuperação (mostrados uma vez só). */
  app.post('/v1/conta/dois-fatores/ativar', LIMITE, async (req, reply) => {
    const u = await usuarioDaRequisicao(ctx, req);
    if (!u) return erro(reply, 401, 'Entre na sua conta.');
    if (u.doisFatores) return erro(reply, 409, 'A verificação em duas etapas já está ligada.');
    const corpo = comCodigo.safeParse(req.body);
    if (!corpo.success) return erro(reply, 400, corpo.error.issues[0]!.message, 'codigo');
    const dados = await ctx.contas.dadosDoisFatores(u.id);
    const segredo = dados.segredoCifrado ? ctx.ia.segredos.decifrarValor(contextoSegredo(u.id), dados.segredoCifrado) : null;
    if (!segredo) return erro(reply, 400, 'Comece de novo: toque em "Ligar a verificação em duas etapas".');
    const passo = conferirCodigo(segredo, corpo.data.codigo);
    if (passo == null || !(await ctx.contas.registrarPassoTotp(u.id, passo))) {
      return erro(reply, 400, 'Código incorreto. Confira se o relógio do celular está certo e digite o código mais recente.', 'codigo');
    }
    const codigos = novosCodigosRecuperacao();
    await ctx.contas.ativarDoisFatores(u.id, codigos.map(hashRecuperacao));
    // Quem tinha a sessão aberta em outro aparelho (talvez sem a pessoa saber) precisa entrar de novo, já com o código.
    const token = req.cookies[COOKIE_SESSAO];
    if (token) await ctx.contas.apagarOutrasSessoes(u.id, hashToken(token));
    return { ok: true, codigosRecuperacao: codigos };
  });

  app.post('/v1/conta/dois-fatores/desativar', LIMITE, async (req, reply) => {
    const u = await usuarioDaRequisicao(ctx, req);
    if (!u) return erro(reply, 401, 'Entre na sua conta.');
    if (!u.doisFatores) return erro(reply, 409, 'A verificação em duas etapas já está desligada.');
    const corpo = paraDesligar.safeParse(req.body);
    if (!corpo.success) return erro(reply, 400, corpo.error.issues[0]!.message, String(corpo.error.issues[0]!.path[0] ?? ''));
    if (!(await senhaCerta(u.email, corpo.data.senha))) return erro(reply, 401, 'Senha incorreta.', 'senha');
    if (!(await conferirSegundaEtapa(ctx, u.id, corpo.data.codigo))) return erro(reply, 401, 'Código incorreto ou já usado.', 'codigo');
    await ctx.contas.desativarDoisFatores(u.id);
    return { ok: true };
  });
}
