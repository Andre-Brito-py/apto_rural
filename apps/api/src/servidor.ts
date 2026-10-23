import cors from '@fastify/cors';
import { avaliar, FONTES, normalizarCar, REGRAS } from '@apto/regras';
import Fastify, { type FastifyReply } from 'fastify';
import { config } from './config.js';
import { hashDocumento, normalizarDocumento } from './documento.js';
import { novaConsulta } from './esquemas.js';
import { CARS_DEMO, ehCarDemo, RepositorioDemo } from './repositorio/demo.js';
import { RepositorioPostgis } from './repositorio/postgis.js';
import type { Repositorio } from './repositorio/tipos.js';

function erro(reply: FastifyReply, status: number, mensagem: string, campo?: string) {
  return reply.status(status).send({ erro: { mensagem, campo } });
}

/** Data de hoje no fuso de Brasília, que é o que vale para as datas do MCR. */
function hojeBrasilia(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

export function criarServidor() {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });
  app.register(cors, { origin: config.webOrigin });

  const banco: Repositorio | null = config.databaseUrl ? new RepositorioPostgis(config.databaseUrl) : null;
  const demo: Repositorio | null = config.demo ? new RepositorioDemo() : null;

  app.get('/v1/saude', async () => ({
    ok: true,
    banco: banco != null,
    demo: demo != null ? CARS_DEMO : null,
  }));

  app.get('/v1/regras', async () => ({
    regras: REGRAS.map(({ id, titulo, pergunta, normas, fontes }) => ({ id, titulo, pergunta, normas, fontes })),
    fontes: FONTES,
    atualizacoes: banco ? await banco.atualizacoes() : demo ? await demo.atualizacoes() : {},
  }));

  app.post('/v1/consultas', async (req, reply) => {
    const corpo = novaConsulta.safeParse(req.body);
    if (!corpo.success) {
      const p = corpo.error.issues[0]!;
      return erro(reply, 400, p.message, p.path.join('.'));
    }
    const dados = corpo.data;

    const car = normalizarCar(dados.car);
    if (!car) {
      return erro(reply, 400, 'Código do CAR inválido. Use o formato do recibo: UF-0000000-XXXX.XXXX…', 'car');
    }

    let documentoHash: string | undefined;
    if (dados.documento) {
      const doc = normalizarDocumento(dados.documento);
      if (!doc) return erro(reply, 400, 'CPF ou CNPJ inválido.', 'documento');
      documentoHash = config.databaseUrl ? hashDocumento(doc) : 'demo';
    }

    const repo = demo && ehCarDemo(car) ? demo : banco;
    if (!repo) {
      return erro(reply, 503, 'As bases públicas ainda não estão carregadas neste servidor.');
    }

    const entrada = { ...dados, car, documentoHash };
    const evidencias = await repo.coletarEvidencias(entrada);
    const resultado = avaliar(evidencias, hojeBrasilia());
    const salva = await repo.salvar(entrada, evidencias, resultado);
    return reply.status(201).send(salva);
  });

  app.get<{ Params: { id: string } }>('/v1/consultas/:id', async (req, reply) => {
    const id = req.params.id;
    const salva = (demo && (await demo.buscar(id))) || (banco && (await banco.buscar(id)));
    if (!salva) return erro(reply, 404, 'Consulta não encontrada.');
    return salva;
  });

  return app;
}
