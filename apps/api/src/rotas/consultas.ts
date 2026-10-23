import { randomUUID } from 'node:crypto';
import { avaliar, FONTES, normalizarCar, REGRAS } from '@apto/regras';
import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { erro, hojeBrasilia, usuarioDaRequisicao, type Contexto } from '../contexto.js';
import { hashDocumento, hashesParaCadastro, normalizarDocumento } from '../documento.js';
import { novaConsulta } from '../esquemas.js';
import { CARS_DEMO, ehCarDemo } from '../repositorio/demo.js';
import type { ConsultaSalva } from '../repositorio/tipos.js';

/** O que a tela recebe: sem o id do dono, com o que este visitante pode fazer. */
function paraCliente(c: ConsultaSalva, usuarioId?: string) {
  const { usuarioId: dono, ...resto } = c;
  return { ...resto, minha: dono != null && dono === usuarioId };
}

export function rotasConsultas(app: FastifyInstance, ctx: Contexto) {
  app.get('/v1/saude', async () => {
    const aviso = (await ctx.config.obter()).aviso_site;
    return {
      ok: true,
      banco: ctx.banco != null,
      demo: ctx.demo != null ? CARS_DEMO : null,
      // Aviso no topo do site, definido pelo painel (ex.: manutenção, novidade).
      aviso: aviso.ativo && aviso.texto ? { texto: aviso.texto, tipo: aviso.tipo } : null,
    };
  });

  app.get('/v1/regras', async () => ({
    regras: REGRAS.map(({ id, titulo, pergunta, normas, fontes }) => ({ id, titulo, pergunta, normas, fontes })),
    fontes: FONTES,
    atualizacoes: ctx.banco ? await ctx.banco.atualizacoes() : ctx.demo ? await ctx.demo.atualizacoes() : {},
  }));

  // Contornos de fazendas grandes passam de 1 MB (o padrão do Fastify).
  app.post('/v1/consultas', { bodyLimit: 8 * 1024 * 1024 }, async (req, reply) => {
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
    let hashesCadastro: string[] | undefined;
    if (dados.documento) {
      const doc = normalizarDocumento(dados.documento);
      if (!doc) return erro(reply, 400, 'CPF ou CNPJ inválido.', 'documento');
      documentoHash = config.databaseUrl ? hashDocumento(doc) : 'demo';
      hashesCadastro = config.databaseUrl ? hashesParaCadastro(doc) : undefined;
    }

    const exemplo = ctx.demo != null && ehCarDemo(car);
    const repo = exemplo ? ctx.demo : ctx.banco;
    if (!repo) return erro(reply, 503, 'As bases públicas ainda não estão carregadas neste servidor.');

    const usuario = await usuarioDaRequisicao(ctx, req);
    const id = randomUUID();
    // Exemplos fictícios são grátis; consulta real gasta 1 crédito.
    if (!exemplo) {
      if (!usuario) return erro(reply, 401, 'Entre na sua conta para consultar um imóvel.');
      const ok = await ctx.contas.debitar(usuario.id, 'consulta', `Consulta ${car}`, `consulta:${id}`);
      if (!ok) return erro(reply, 402, 'Seus créditos de consulta acabaram. Compre um pacote para continuar.');
    }

    try {
      const entrada = { ...dados, car, documentoHash, hashesCadastro };
      const evidencias = await repo.coletarEvidencias(entrada);
      const resultado = avaliar(evidencias, hojeBrasilia());
      const salva = await repo.salvar(entrada, evidencias, resultado, { id, usuarioId: usuario?.id });
      return reply.status(201).send(paraCliente(salva, usuario?.id));
    } catch (e) {
      if (!exemplo && usuario) {
        await ctx.contas.lancar({ usuarioId: usuario.id, tipo: 'consulta', quantidade: 1, motivo: 'Devolução: consulta falhou', referencia: `devolucao:${id}` });
      }
      throw e;
    }
  });

  async function buscar(id: string) {
    return (ctx.demo && (await ctx.demo.buscar(id))) || (ctx.banco && (await ctx.banco.buscar(id))) || null;
  }

  // Leitura pública pelo id (UUID): é o que o QR do relatório abre.
  app.get<{ Params: { id: string } }>('/v1/consultas/:id', async (req, reply) => {
    const salva = await buscar(req.params.id);
    if (!salva) return erro(reply, 404, 'Consulta não encontrada.');
    const usuario = await usuarioDaRequisicao(ctx, req);
    return paraCliente(salva, usuario?.id);
  });

  app.post<{ Params: { id: string } }>('/v1/consultas/:id/dossie', async (req, reply) => {
    const salva = await buscar(req.params.id);
    if (!salva) return erro(reply, 404, 'Consulta não encontrada.');
    if (salva.dossieLiberado) return { ok: true };
    const usuario = await usuarioDaRequisicao(ctx, req);
    if (!usuario || salva.usuarioId !== usuario.id) return erro(reply, 403, 'Só quem fez a consulta pode liberar o dossiê.');
    const ok = await ctx.contas.debitar(usuario.id, 'dossie', `Dossiê ${salva.resultado.car}`, `dossie:${salva.id}`);
    if (!ok) return erro(reply, 402, 'Você não tem créditos de dossiê. Compre um dossiê avulso ou um pacote.');
    await ctx.banco!.liberarDossie(salva.id);
    return { ok: true, saldo: await ctx.contas.saldo(usuario.id) };
  });
}
