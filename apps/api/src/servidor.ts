import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import pg from 'pg';
import { config } from './config.js';
import { RepositorioContasMemoria } from './contas/memoria.js';
import { RepositorioContasPostgres } from './contas/postgres.js';
import type { Contexto } from './contexto.js';
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
  return {
    banco: pool ? new RepositorioPostgis(pool) : null,
    demo: config.demo ? new RepositorioDemo() : null,
    contas: pool ? new RepositorioContasPostgres(pool) : new RepositorioContasMemoria(),
    pagamento: config.asaas.chave
      ? new ProvedorAsaas(config.asaas.chave, config.asaas.ambiente, config.asaas.tokenWebhook)
      : config.demo
        ? new ProvedorSimulado(config.webOrigin)
        : null,
  };
}

export function criarServidor(ctx: Contexto = criarContexto()) {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info', redact: ['req.headers.cookie', 'req.headers["asaas-access-token"]'] },
    trustProxy: config.producao,
  });
  app.register(cors, { origin: config.webOrigin, credentials: true });
  app.register(cookie);
  app.register(rateLimit, { max: 120, timeWindow: '1 minute' });

  app.after(() => {
    rotasConsultas(app, ctx);
    rotasContas(app, ctx);
    rotasPedidos(app, ctx);
  });

  app.setErrorHandler((e: { statusCode?: number; message?: string }, req, reply) => {
    const status = e.statusCode ?? 500;
    if (status === 429) return reply.status(429).send({ erro: { mensagem: 'Muitas tentativas. Aguarde alguns minutos.' } });
    if (status >= 500) req.log.error(e);
    return reply.status(status).send({
      erro: { mensagem: status < 500 ? e.message : 'Erro interno. Tente de novo em instantes.' },
    });
  });

  return app;
}
