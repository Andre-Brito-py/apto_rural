import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import estatico from '@fastify/static';
import Fastify from 'fastify';
import pg from 'pg';
import { RepositorioAdmin } from './admin/repositorio.js';
import { RepositorioCarteira } from './carteira/repositorio.js';
import { config } from './config.js';
import { Configuracoes } from './configuracoes.js';
import { RegistroErros } from './monitoramento/erros.js';
import { rotasAdmin } from './rotas/admin.js';
import { rotasAssinaturas } from './rotas/assinaturas.js';
import { rotasCarteira } from './rotas/carteira.js';
import { RepositorioContasMemoria } from './contas/memoria.js';
import { RepositorioContasPostgres } from './contas/postgres.js';
import { RepositorioCuponsMemoria } from './cupons/memoria.js';
import { RepositorioCuponsPostgres } from './cupons/postgres.js';
import { rotasCupons } from './rotas/cupons.js';
import { rotasDoisFatores } from './rotas/doisFatores.js';
import { rotasIA } from './rotas/ia.js';
import { COOKIE_SESSAO, usuarioDaRequisicao, type Contexto } from './contexto.js';
import { EnviadorConsole, EnviadorSmtp } from './email/enviador.js';
import { RepositorioEquipe } from './equipe/repositorio.js';
import { RepositorioApoio } from './ia/apoio.js';
import { ExecutorIA } from './ia/executor.js';
import { ServicoExplicacao } from './ia/explicacao.js';
import { ProvedorOpenAI } from './ia/provedor.js';
import { chaveMestra, Segredos } from './ia/segredos.js';
import { UsoIA } from './ia/uso.js';
import { rotasEquipe } from './rotas/equipe.js';
import { ProvedorAsaas } from './pagamentos/asaas.js';
import { ProvedorSimulado } from './pagamentos/simulado.js';
import { RepositorioDemo } from './repositorio/demo.js';
import { RepositorioPostgis } from './repositorio/postgis.js';
import { rotasContas } from './rotas/contas.js';
import { rotasConsultas } from './rotas/consultas.js';
import { rotasPedidos } from './rotas/pedidos.js';

export function criarContexto(): Contexto {
  const pool = config.databaseUrl ? new pg.Pool({ connectionString: config.databaseUrl, max: 10 }) : null;
  if (!pool && !config.demo) throw new Error('Sem DATABASE_URL, só o modo demonstração (APTO_DEMO=1) funciona.');
  const email = config.smtp.host ? new EnviadorSmtp(config.smtp, config.smtp.remetente) : new EnviadorConsole();
  const configuracoes = new Configuracoes(pool);
  const segredos = new Segredos(pool, chaveMestra(config.chaveSegredos, config.segredoDocumento || 'desenvolvimento'));
  const uso = new UsoIA(pool);
  const dependenciasIA = { config: configuracoes, segredos, uso, provedor: (chave: string) => new ProvedorOpenAI(chave, config.iaUrl) };
  const contas = pool ? new RepositorioContasPostgres(pool) : new RepositorioContasMemoria();
  return {
    banco: pool ? new RepositorioPostgis(pool) : null,
    demo: config.demo ? new RepositorioDemo() : null,
    contas,
    cupons: pool ? new RepositorioCuponsPostgres(pool) : new RepositorioCuponsMemoria(contas),
    carteira: pool ? new RepositorioCarteira(pool) : null,
    admin: pool ? new RepositorioAdmin(pool) : null,
    equipe: pool ? new RepositorioEquipe(pool) : null,
    erros: new RegistroErros(pool, email, config.adminEmails, config.webOrigin),
    config: configuracoes,
    email,
    // Consulta mínima com prazo curto: o healthcheck e o vigia não podem ficar pendurados.
    bancoResponde: async () => {
      if (!pool) return null;
      try {
        await Promise.race([pool.query('SELECT 1'), new Promise((_, falha) => setTimeout(() => falha(new Error('prazo')), 3000))]);
        return true;
      } catch {
        return false;
      }
    },
    ia: {
      explicacao: new ServicoExplicacao(dependenciasIA),
      executor: new ExecutorIA(dependenciasIA),
      apoio: new RepositorioApoio(pool),
      segredos,
      uso,
    },
    pagamento: config.asaas.chave
      ? new ProvedorAsaas(config.asaas.chave, config.asaas.ambiente, config.asaas.tokenWebhook, config.asaas.url)
      : config.demo
        ? new ProvedorSimulado(config.webOrigin)
        : null,
  };
}

export function criarServidor(ctx: Contexto = criarContexto()) {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info', redact: ['req.headers.cookie', 'req.headers["asaas-access-token"]'] },
    // Só confia no Caddy, que fala com a API pela rede interna do Docker (endereços privados).
    // Um X-Forwarded-For forjado pelo visitante não engana o limite de tentativas.
    trustProxy: config.producao ? 'loopback,uniquelocal' : false,
  });
  app.register(cors, { origin: config.webOrigin, credentials: true });
  app.register(cookie);
  // Freio geral só para a API (/v1). Os arquivos do site (JS, CSS, fontes, logo) ficam de
  // fora: cada página carrega de 10 a 15 deles, e um escritório com vários técnicos atrás do
  // mesmo endereço de internet estourava o limite e perdia o logo e os botões (achado nos
  // testes de navegador). Login, cadastro e e-mails têm freios próprios, bem mais apertados.
  app.register(rateLimit, { max: 300, timeWindow: '1 minute', allowList: (req) => !req.url.startsWith('/v1/') });

  // Respostas da API têm dados da conta: nem o navegador nem um proxy guardam cópia
  // (num computador compartilhado, o "voltar" não mostra a tela de outra pessoa).
  app.addHook('onSend', async (req, reply) => {
    if (req.url.startsWith('/v1/') && !reply.hasHeader('Cache-Control')) reply.header('Cache-Control', 'no-store');
  });

  // "Entrar como" é só leitura: fora sair e voltar, nada que altere dados ou gaste crédito.
  const LIBERADAS_NA_PERSONIFICACAO = new Set(['DELETE /v1/sessao', 'POST /v1/admin/voltar', 'POST /v1/erros']);
  app.addHook('preHandler', async (req, reply) => {
    if (req.method === 'GET' || req.method === 'HEAD' || !req.cookies[COOKIE_SESSAO]) return;
    if (LIBERADAS_NA_PERSONIFICACAO.has(`${req.method} ${req.routeOptions.url}`)) return;
    const u = await usuarioDaRequisicao(ctx, req);
    if (u?.personificadoPor) {
      return reply.status(403).send({
        erro: { mensagem: 'Modo visualização: você está vendo a conta de outra pessoa e não pode alterar nada. Volte ao painel para sair.' },
      });
    }
  });

  app.after(() => {
    rotasConsultas(app, ctx);
    rotasContas(app, ctx);
    rotasPedidos(app, ctx);
    rotasCarteira(app, ctx);
    rotasAdmin(app, ctx);
    rotasAssinaturas(app, ctx);
    rotasEquipe(app, ctx);
    rotasCupons(app, ctx);
    rotasDoisFatores(app, ctx);
    rotasIA(app, ctx);
  });

  // Site no mesmo endereço da API: sem CORS e com o cookie de sessão no mesmo domínio.
  if (config.webDist) {
    // A página principal leva o endereço do site nas metatags de compartilhamento (WhatsApp, redes):
    // o marcador do build é trocado pelo WEB_ORIGIN uma vez, na subida.
    const paginaPrincipal = readFileSync(join(config.webDist, 'index.html'), 'utf8').replaceAll('__ENDERECO_DO_SITE__', config.webOrigin);
    app.register(estatico, {
      root: config.webDist,
      wildcard: false,
      index: false,
      // index.html só sai pela rota abaixo (com o endereço já preenchido).
      allowedPath: (caminho) => !caminho.endsWith('index.html'),
      cacheControl: false, // o cabeçalho é definido abaixo
      // Arquivos em assets/ têm hash no nome: podem ficar em cache por muito tempo.
      setHeaders: (res, caminho) => {
        res.header('Cache-Control', /[\\/]assets[\\/]/.test(caminho) ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/v1/') || req.method !== 'GET') {
        return reply.status(404).send({ erro: { mensagem: 'Não encontrado.' } });
      }
      // Rotas do site (ex.: /consulta/:id) caem no index.html, que resolve no navegador.
      return reply.header('Cache-Control', 'no-cache').type('text/html; charset=utf-8').send(paginaPrincipal);
    });
  }

  app.setErrorHandler((e: { statusCode?: number; message?: string; stack?: string }, req, reply) => {
    const status = e.statusCode ?? 500;
    if (status === 429) return reply.status(429).send({ erro: { mensagem: 'Muitas tentativas. Aguarde alguns minutos.' } });
    if (status >= 500) {
      req.log.error(e);
      // Rota sem o id (ex.: /v1/consultas/:id), para agrupar; nunca o corpo da requisição.
      void ctx.erros.registrar({
        origem: 'api',
        mensagem: e.message ?? 'Erro sem mensagem',
        detalhe: e.stack,
        rota: `${req.method} ${req.routeOptions.url ?? req.url}`,
      });
    }
    return reply.status(status).send({
      erro: { mensagem: status < 500 ? e.message : 'Erro interno. Tente de novo em instantes.' },
    });
  });

  return app;
}
