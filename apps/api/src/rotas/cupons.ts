import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Usuario } from '../contas/tipos.js';
import { avaliarCupom, encerrarDesconto, NAO_ENCONTRADO, type ItemCompra } from '../cupons/aplicar.js';
import { FORMATO_CODIGO, normalizarCodigo, situacao } from '../cupons/regras.js';
import type { DadosCupom } from '../cupons/tipos.js';
import { erro, hojeBrasilia, nivelAdmin, usuarioDaRequisicao, type Contexto, type NivelAdmin } from '../contexto.js';

const data = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato AAAA-MM-DD.')
  .refine((d) => !Number.isNaN(Date.parse(d)), 'Data inválida.')
  .nullable();

/** O que o administrador preenche. Ver docs/cupons.md. */
const dadosCupom = z
  .object({
    codigo: z
      .string()
      .trim()
      .transform(normalizarCodigo)
      .pipe(z.string().regex(FORMATO_CODIGO, 'O código tem de 3 a 30 letras, números, hífen ou sublinhado, sem espaço nem acento.')),
    descricao: z.string().trim().max(200, 'A anotação interna tem no máximo 200 caracteres.').default(''),
    tipo: z.enum(['percentual', 'fixo']),
    valor: z.number().positive('O desconto precisa ser maior que zero.').max(100_000),
    alvos: z.array(z.string().min(1).max(60)).max(50).default([]),
    meses: z.number().int().min(1, 'Pelo menos 1 mensalidade.').max(120).nullable().default(1),
    limiteUsos: z.number().int().min(1, 'O limite de usos precisa ser pelo menos 1 (ou sem limite).').max(1_000_000).nullable().default(null),
    limitePorConta: z.number().int().min(1).max(1000).default(1),
    apenasNovos: z.boolean().default(false),
    validoDe: data.default(null),
    validoAte: data.default(null),
    ativo: z.boolean().default(true),
  })
  .refine((c) => c.tipo !== 'percentual' || c.valor <= 100, { message: 'O desconto em porcentagem vai até 100%.', path: ['valor'] })
  .refine((c) => !c.validoDe || !c.validoAte || c.validoDe <= c.validoAte, {
    message: 'A data de início precisa ser antes da data de fim.',
    path: ['validoAte'],
  });

const comCodigo = z.object({ codigo: z.string().trim().min(1).max(40) });

export function rotasCupons(app: FastifyInstance, ctx: Contexto) {
  /** Produtos avulsos e planos ativos: o que dá para comprar com cupom. */
  async function itens(): Promise<(ItemCompra & { ativo: boolean })[]> {
    const c = await ctx.config.obter();
    return [
      ...c.planos.map((p) => ({ id: p.id, nome: p.nome, valor: p.valorMensal, plano: true, ativo: p.ativo })),
      ...c.produtos.map((p) => ({ id: p.id, nome: p.nome, valor: p.valor, plano: false, ativo: p.ativo })),
    ];
  }

  /**
   * Página de planos: o cliente digita o cupom e vê o preço de cada plano e produto.
   * Freio apertado: ninguém fica testando códigos ao acaso. Sem login, os limites por
   * conta são conferidos só na compra.
   */
  app.post('/v1/cupons/validar', { config: { rateLimit: { max: 15, timeWindow: '1 minute' } } }, async (req, reply) => {
    const corpo = comCodigo.safeParse(req.body);
    if (!corpo.success) return erro(reply, 400, 'Digite o código do cupom.', 'cupom');
    const u = await usuarioDaRequisicao(ctx, req);
    const resultados = await Promise.all(
      (await itens())
        .filter((i) => i.ativo)
        .map(async (i) => {
          const a = await avaliarCupom(ctx, corpo.data.codigo, i, u);
          return a.ok
            ? { id: i.id, plano: i.plano, valido: true as const, de: i.valor, por: a.final, desconto: a.desconto, meses: a.meses, texto: a.texto }
            : { id: i.id, plano: i.plano, valido: false as const, mensagem: a.mensagem, motivo: a.motivo };
        }),
    );
    if (!resultados.some((r) => r.valido)) {
      // Nada vale: diz o motivo que importa (código vencido, já usado...), não "não vale para o plano X".
      const recusas = resultados.filter((r) => !r.valido);
      const principal = recusas.find((r) => r.motivo !== 'item');
      if (!principal) return erro(reply, 400, 'Este cupom não vale para nenhum plano ou produto disponível agora.', 'cupom');
      return erro(reply, principal.mensagem === NAO_ENCONTRADO ? 404 : 400, principal.mensagem, 'cupom');
    }
    return { codigo: normalizarCodigo(corpo.data.codigo), itens: resultados };
  });

  // ---- painel: ver (suporte e admin), mudar (só admin), sempre auditado ----

  async function exigir(req: FastifyRequest, reply: FastifyReply, minimo: NivelAdmin): Promise<Usuario | null> {
    const u = await usuarioDaRequisicao(ctx, req);
    const nivel = nivelAdmin(u);
    if (!nivel || (minimo === 'admin' && nivel !== 'admin')) {
      await erro(reply, 403, 'Acesso restrito.');
      return null;
    }
    return u;
  }
  const auditar = (adminId: string, acao: string, detalhes: Record<string, unknown>, alvo: string | null = null) =>
    ctx.admin?.auditar(adminId, acao, alvo, detalhes);

  app.get('/v1/admin/cupons', async (req, reply) => {
    if (!(await exigir(req, reply, 'suporte'))) return reply;
    const hoje = hojeBrasilia();
    const cupons = (await ctx.cupons.listar()).map((c) => ({ ...c, situacao: situacao(c, hoje, c.usados + c.reservados) }));
    return { cupons, itens: await itens(), hoje };
  });

  app.get<{ Params: { id: string } }>('/v1/admin/cupons/:id', async (req, reply) => {
    if (!(await exigir(req, reply, 'suporte'))) return reply;
    const cupom = await ctx.cupons.buscar(req.params.id);
    if (!cupom) return erro(reply, 404, 'Cupom não encontrado.');
    return { cupom, usos: await ctx.cupons.usos(cupom.id) };
  });

  app.post('/v1/admin/cupons', async (req, reply) => {
    const admin = await exigir(req, reply, 'admin');
    if (!admin) return reply;
    const corpo = dadosCupom.safeParse(req.body);
    if (!corpo.success) return erro(reply, 400, corpo.error.issues[0]!.message, String(corpo.error.issues[0]!.path[0] ?? ''));
    const criado = await ctx.cupons.criar(corpo.data as DadosCupom, admin.id);
    if (criado === 'codigo_existe') return erro(reply, 409, `Já existe um cupom ${corpo.data.codigo}.`, 'codigo');
    await auditar(admin.id, 'criou_cupom', { cupom: criado.codigo, ...resumir(criado) });
    return reply.status(201).send({ cupom: criado });
  });

  app.put<{ Params: { id: string } }>('/v1/admin/cupons/:id', async (req, reply) => {
    const admin = await exigir(req, reply, 'admin');
    if (!admin) return reply;
    const corpo = dadosCupom.safeParse(req.body);
    if (!corpo.success) return erro(reply, 400, corpo.error.issues[0]!.message, String(corpo.error.issues[0]!.path[0] ?? ''));
    const antes = await ctx.cupons.buscar(req.params.id);
    if (!antes) return erro(reply, 404, 'Cupom não encontrado.');
    // O código é o que o cliente guardou e o que está nos pedidos: depois do primeiro uso, não muda.
    if (antes.codigo !== corpo.data.codigo && (await ctx.cupons.usos(antes.id)).length) {
      return erro(reply, 409, 'Este cupom já foi usado, então o código não pode mudar. Pause este e crie outro com o código novo.', 'codigo');
    }
    const depois = await ctx.cupons.atualizar(antes.id, corpo.data as DadosCupom);
    if (depois === 'codigo_existe') return erro(reply, 409, `Já existe um cupom ${corpo.data.codigo}.`, 'codigo');
    if (!depois) return erro(reply, 404, 'Cupom não encontrado.');
    await auditar(admin.id, 'alterou_cupom', { cupom: depois.codigo, antes: resumir(antes), depois: resumir(depois) });
    return { cupom: depois };
  });

  app.delete<{ Params: { id: string } }>('/v1/admin/cupons/:id', async (req, reply) => {
    const admin = await exigir(req, reply, 'admin');
    if (!admin) return reply;
    const cupom = await ctx.cupons.buscar(req.params.id);
    if (!cupom) return erro(reply, 404, 'Cupom não encontrado.');
    const r = await ctx.cupons.apagar(cupom.id);
    if (r === 'tem_usos') return erro(reply, 409, 'Este cupom já foi usado e fica no histórico. Para ele parar de valer, pause.');
    await auditar(admin.id, 'apagou_cupom', { cupom: cupom.codigo });
    return { ok: true };
  });

  /** Encerra antes do previsto o desconto de uma assinatura: as próximas mensalidades voltam ao valor cheio no Asaas. */
  app.post<{ Params: { id: string } }>('/v1/admin/cupons/usos/:id/encerrar-desconto', async (req, reply) => {
    const admin = await exigir(req, reply, 'admin');
    if (!admin) return reply;
    const uso = await ctx.cupons.buscarUso(req.params.id);
    if (!uso?.assinaturaId) return erro(reply, 404, 'Uso de cupom em assinatura não encontrado.');
    if (uso.descontoEncerradoEm) return erro(reply, 409, 'O desconto desta assinatura já acabou.');
    const a = await ctx.contas.buscarAssinatura(uso.assinaturaId);
    if (!a || a.status === 'cancelada') return erro(reply, 409, 'A assinatura já foi cancelada.');
    const r = await encerrarDesconto(ctx, a, uso.id, uso.valorOriginal);
    if (!r.ok) return erro(reply, 502, r.mensagem);
    await auditar(admin.id, 'encerrou_desconto_cupom', { assinatura: a.id, plano: a.nomePlano }, a.usuarioId);
    return { ok: true, mensagem: r.mensagem };
  });
}

/** O essencial do cupom para a auditoria (sem datas internas). */
function resumir(c: DadosCupom) {
  return {
    tipo: c.tipo,
    valor: c.valor,
    alvos: c.alvos,
    meses: c.meses,
    limiteUsos: c.limiteUsos,
    limitePorConta: c.limitePorConta,
    apenasNovos: c.apenasNovos,
    validoDe: c.validoDe,
    validoAte: c.validoAte,
    ativo: c.ativo,
  };
}
