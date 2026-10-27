import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Usuario } from '../contas/tipos.js';
import { erro, nivelAdmin, usuarioDaRequisicao, type Contexto } from '../contexto.js';
import { contaEmUso, pessoasDaConta } from '../equipe/conta.js';
import type { DocumentoConferido } from '../ia/documentos.js';
import { conferirDocumento, MAXIMO_IMAGENS, TAMANHO_MAXIMO_DOCUMENTO } from '../ia/documentos.js';
import { MOTIVO_SEM_IA } from '../ia/executor.js';
import { analisarNorma, TAMANHO_MAXIMO_NORMA } from '../ia/normas.js';
import { gerarRascunho, NOME_RASCUNHO, tiposPara, type TipoRascunho } from '../ia/rascunhos.js';
import { lerRecibo, TAMANHO_MAXIMO_RECIBO } from '../ia/recibo.js';
import type { ConsultaSalva } from '../repositorio/tipos.js';

// Página escaneada ou foto, já reduzida no navegador (até ~2 MB cada).
const imagem = z.string().max(3_000_000).regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, 'Imagem em formato inválido.');

const comRecibo = z.object({ texto: z.string().trim().min(30, 'Não achamos texto no arquivo.').max(TAMANHO_MAXIMO_RECIBO * 2) });
const comDocumento = z
  .object({
    regraId: z.string().min(1).max(60),
    nomeArquivo: z.string().trim().min(1).max(200),
    texto: z.string().max(TAMANHO_MAXIMO_DOCUMENTO * 2).optional(),
    imagens: z.array(imagem).max(MAXIMO_IMAGENS).optional(),
  })
  .refine((d) => (d.texto?.trim().length ?? 0) >= 30 || (d.imagens?.length ?? 0) > 0, 'Não achamos texto nem imagem no arquivo.');
const comRascunho = z.object({ regraId: z.string().min(1).max(60), tipo: z.enum(['carta_banco', 'retificacao_car', 'requerimento_orgao']) });
const comNorma = z.object({
  titulo: z.string().trim().min(3, 'Dê um nome à norma (ex.: Resolução CMN 5.400/2027).').max(160),
  texto: z.string().trim().min(200, 'Cole o texto da norma (pelo menos alguns parágrafos).').max(TAMANHO_MAXIMO_NORMA * 2),
});

/** Até quantos itens de apoio uma consulta guarda (custo e bom senso). */
const MAXIMO_POR_CONSULTA = 40;

/**
 * Funções de apoio por IA (docs/ia.md). A IA nunca muda o resultado: lê documentos e
 * escreve rascunhos para o técnico conferir. Documentos e rascunhos ficam no dossiê, que
 * já foi pago: só quem fez a consulta (ou a equipe dela) usa e vê.
 */
export function rotasIA(app: FastifyInstance, ctx: Contexto) {
  async function buscar(id: string) {
    return (ctx.demo && (await ctx.demo.buscar(id))) || (ctx.banco && (await ctx.banco.buscar(id))) || null;
  }

  /** A consulta, se ela é da conta de quem pede (ou um exemplo fictício, para quem tem conta). */
  async function consultaDaConta(req: FastifyRequest, reply: FastifyReply): Promise<{ u: Usuario; consulta: ConsultaSalva } | null> {
    const u = await usuarioDaRequisicao(ctx, req);
    if (!u) {
      await erro(reply, 401, 'Entre na sua conta.');
      return null;
    }
    const consulta = await buscar((req.params as { id: string }).id);
    if (!consulta) {
      await erro(reply, 404, 'Consulta não encontrada.');
      return null;
    }
    const daConta = consulta.usuarioId != null && (await pessoasDaConta(ctx, await contaEmUso(ctx, u))).includes(consulta.usuarioId);
    // Exemplo fictício: quem o criou (ou qualquer conta, se foi criado sem conta).
    if (!daConta && !(consulta.demo && consulta.usuarioId == null)) {
      await erro(reply, 403, 'Só quem fez a consulta (ou a equipe dessa pessoa) usa o apoio do dossiê.');
      return null;
    }
    return { u, consulta };
  }

  const itemDoDossie = (consulta: ConsultaSalva, regraId: string) =>
    consulta.resultado.itens.find((i) => i.regraId === regraId && i.dossie && (i.status === 'impedimento' || i.status === 'atencao'));

  // ---- 1. Recibo do CAR: preenche a consulta (o técnico confere) ----

  app.post('/v1/ia/recibo-car', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const u = await usuarioDaRequisicao(ctx, req);
    if (!u) return erro(reply, 401, 'Entre na sua conta para ler o recibo.');
    const corpo = comRecibo.safeParse(req.body);
    if (!corpo.success) {
      return erro(reply, 400, 'Não achamos texto neste arquivo. Use o PDF baixado do Sicar (não a foto ou o escaneado) ou preencha à mão.');
    }
    const leitura = await lerRecibo(ctx.ia.executor, corpo.data.texto);
    const achou = leitura.car || leitura.situacao || leitura.modulosFiscais || leitura.areaHa;
    if (!achou) return erro(reply, 422, 'Não reconhecemos um recibo ou demonstrativo do CAR neste arquivo. Preencha os dados à mão.');
    return { ...leitura, avisoSemIA: leitura.motivoSemIA && leitura.motivoSemIA !== 'desligada' ? MOTIVO_SEM_IA[leitura.motivoSemIA] : undefined };
  });

  // ---- 2 e 3. Documentos conferidos e rascunhos do dossiê ----

  app.get<{ Params: { id: string } }>('/v1/consultas/:id/apoio', async (req, reply) => {
    const r = await consultaDaConta(req, reply);
    if (!r) return reply;
    const itens = await ctx.ia.apoio.para(r.consulta).listar(r.consulta.id);
    const [documentos, rascunhos] = await Promise.all([ctx.ia.executor.indisponivel('documento'), ctx.ia.executor.indisponivel('rascunho')]);
    return {
      documentos: itens.filter((i) => i.tipo === 'documento').map((i) => ({ ...i.dados, id: i.id })),
      rascunhos: itens.filter((i) => i.tipo === 'rascunho').map((i) => ({ ...i.dados, id: i.id, regraId: i.regraId })),
      rascunhosPorItem: Object.fromEntries(
        r.consulta.resultado.itens.map((i) => [i.regraId, tiposPara(i).map((tipo) => ({ tipo, nome: NOME_RASCUNHO[tipo] }))]),
      ),
      // Sem IA: a conferência de documentos fica indisponível; os rascunhos saem do modelo fixo.
      ia: { documentos: documentos ? MOTIVO_SEM_IA[documentos] : null, rascunhos: rascunhos ? MOTIVO_SEM_IA[rascunhos] : null },
    };
  });

  app.post<{ Params: { id: string } }>(
    '/v1/consultas/:id/documentos',
    { bodyLimit: 16 * 1024 * 1024, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const r = await consultaDaConta(req, reply);
      if (!r) return reply;
      if (!r.consulta.dossieLiberado && !r.consulta.demo) return erro(reply, 402, 'Gere o dossiê antes de conferir documentos.');
      const corpo = comDocumento.safeParse(req.body);
      if (!corpo.success) return erro(reply, 400, corpo.error.issues[0]!.message);
      const item = itemDoDossie(r.consulta, corpo.data.regraId);
      if (!item) return erro(reply, 400, 'Este item não tem dossiê nesta consulta.');
      if ((await ctx.ia.apoio.para(r.consulta).listar(r.consulta.id)).length >= MAXIMO_POR_CONSULTA) {
        return erro(reply, 409, 'Esta consulta já tem documentos e rascunhos demais. Apague os que não servem mais.');
      }
      const texto = corpo.data.texto?.trim();
      const conferido = await conferirDocumento(ctx.ia.executor, r.consulta.resultado, item, {
        nomeArquivo: corpo.data.nomeArquivo,
        texto: texto && texto.length >= 30 ? texto : undefined,
        imagens: corpo.data.imagens,
      });
      if (!conferido.ok) return erro(reply, 503, `${MOTIVO_SEM_IA[conferido.motivo]} Confira o documento à mão pela lista do dossiê.`);
      const salvo = await ctx.ia.apoio.para(r.consulta).salvar(r.consulta.id, 'documento', item.regraId, conferido.documento, r.u.id);
      return reply.status(201).send({ ...conferido.documento, id: salvo.id });
    },
  );

  app.post<{ Params: { id: string } }>('/v1/consultas/:id/rascunhos', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const r = await consultaDaConta(req, reply);
    if (!r) return reply;
    if (!r.consulta.dossieLiberado && !r.consulta.demo) return erro(reply, 402, 'Gere o dossiê antes de pedir um rascunho.');
    const corpo = comRascunho.safeParse(req.body);
    if (!corpo.success) return erro(reply, 400, 'Rascunho inválido.');
    const item = itemDoDossie(r.consulta, corpo.data.regraId);
    if (!item || !tiposPara(item).includes(corpo.data.tipo as TipoRascunho)) return erro(reply, 400, 'Este rascunho não se aplica a este item.');
    const itens = await ctx.ia.apoio.para(r.consulta).listar(r.consulta.id);
    if (itens.length >= MAXIMO_POR_CONSULTA) return erro(reply, 409, 'Esta consulta já tem documentos e rascunhos demais. Apague os que não servem mais.');
    const documentos = itens.filter((i) => i.tipo === 'documento' && i.regraId === item.regraId).map((i) => i.dados as DocumentoConferido);
    const rascunho = await gerarRascunho(ctx.ia.executor, r.consulta.resultado, item, corpo.data.tipo, documentos);
    const salvo = await ctx.ia.apoio.para(r.consulta).salvar(r.consulta.id, 'rascunho', item.regraId, rascunho, r.u.id);
    return reply.status(201).send({ ...rascunho, id: salvo.id, regraId: item.regraId });
  });

  app.delete<{ Params: { id: string; item: string } }>('/v1/consultas/:id/apoio/:item', async (req, reply) => {
    const r = await consultaDaConta(req, reply);
    if (!r) return reply;
    if (!(await ctx.ia.apoio.para(r.consulta).apagar(r.consulta.id, req.params.item))) return erro(reply, 404, 'Não encontrado.');
    return { ok: true };
  });

  // ---- 5. Análise de norma nova (só administrador) ----

  async function exigirAdmin(req: FastifyRequest, reply: FastifyReply): Promise<Usuario | null> {
    const u = await usuarioDaRequisicao(ctx, req);
    if (nivelAdmin(u) !== 'admin') {
      await erro(reply, 403, 'Acesso restrito.');
      return null;
    }
    return u;
  }

  app.get('/v1/admin/ia/normas', async (req, reply) => {
    if (!(await exigirAdmin(req, reply))) return reply;
    return { analises: await ctx.ia.apoio.analisesRecentes() };
  });

  app.post('/v1/admin/ia/normas', { bodyLimit: 2 * 1024 * 1024, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req, reply) => {
    const admin = await exigirAdmin(req, reply);
    if (!admin) return reply;
    const corpo = comNorma.safeParse(req.body);
    if (!corpo.success) return erro(reply, 400, corpo.error.issues[0]!.message, String(corpo.error.issues[0]!.path[0] ?? ''));
    const r = await analisarNorma(ctx.ia.executor, corpo.data.titulo, corpo.data.texto);
    if (!r.ok) return erro(reply, 503, MOTIVO_SEM_IA[r.motivo]);
    const salva = await ctx.ia.apoio.salvarAnalise(r.analise, admin.id);
    await ctx.admin?.auditar(admin.id, 'analisou_norma', null, { titulo: corpo.data.titulo });
    return reply.status(201).send({ analise: salva });
  });
}
