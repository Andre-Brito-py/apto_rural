import type { Assinatura, Pedido, Usuario } from '../contas/tipos.js';
import { hojeBrasilia, type Contexto } from '../contexto.js';
import type { EventoPagamento } from '../pagamentos/tipos.js';
import { descreverDesconto, FORMATO_CODIGO, MINIMO_COBRANCA, motivoSituacao, normalizarCodigo, precoComCupom, situacao, valeEm } from './regras.js';
import type { Cupom, RepositorioCupons } from './tipos.js';

/** O que está sendo comprado: um produto avulso ou um plano (mensal ou anual). */
export interface ItemCompra {
  id: string;
  nome: string;
  valor: number;
  plano: boolean;
  /** Plano anual: o valor é o da anuidade. */
  anual?: boolean;
}

export type Avaliacao =
  | { ok: true; cupom: Cupom; final: number; desconto: number; meses: number | null; texto: string }
  | { ok: false; mensagem: string; motivo: MotivoRecusa };

/** Por que não vale: o código (não existe, vencido...) ou só esta compra (outro item, já usou, valor mínimo). */
export type MotivoRecusa = 'codigo' | 'item' | 'conta' | 'minimo';

export const NAO_ENCONTRADO = 'Cupom não encontrado. Confira se digitou certo.';

/** Já pagou alguma coisa (compra, mensalidade ou cupom de 100%)? Vale para "só na primeira compra". */
async function jaPagou(ctx: Contexto, usuarioId: string) {
  return (await ctx.contas.pedidosDoUsuario(usuarioId)).some((p) => p.status === 'pago' || p.status === 'estornado');
}

/**
 * Confere se o cupom vale para esta compra e calcula o preço. Sem usuário (visitante na
 * página de planos), não confere os limites por conta: eles são conferidos na compra.
 * A conferência final do limite total é a reserva atômica (RepositorioCupons.reservar).
 */
export async function avaliarCupom(ctx: Contexto, codigoDigitado: string, item: ItemCompra, usuario?: Usuario | null): Promise<Avaliacao> {
  const codigo = normalizarCodigo(codigoDigitado);
  if (!FORMATO_CODIGO.test(codigo)) return { ok: false, mensagem: NAO_ENCONTRADO, motivo: 'codigo' };
  const c = await ctx.cupons.buscarPorCodigo(codigo);
  if (!c) return { ok: false, mensagem: NAO_ENCONTRADO, motivo: 'codigo' };
  const { total, daConta } = await ctx.cupons.contarUsos(c.id, usuario?.id);
  const s = situacao(c, hojeBrasilia(), total);
  if (s !== 'ativo') return { ok: false, mensagem: motivoSituacao(s, c), motivo: 'codigo' };
  if (!valeEm(c, item.id)) return { ok: false, mensagem: `Este cupom não vale para ${item.plano ? `o plano ${item.nome}` : item.nome}.`, motivo: 'item' };
  if (usuario) {
    if (daConta >= c.limitePorConta) {
      return {
        ok: false,
        mensagem: c.limitePorConta === 1 ? 'Você já usou este cupom.' : 'Você já usou este cupom o número máximo de vezes.',
        motivo: 'conta',
      };
    }
    if (c.apenasNovos && (await jaPagou(ctx, usuario.id))) {
      return { ok: false, mensagem: 'Este cupom é só para a primeira compra ou assinatura.', motivo: 'conta' };
    }
  }
  const { final, desconto } = precoComCupom(c, item.valor);
  // O Asaas não cobra menos de R$ 5,00. Avulso que fica de graça é liberado sem cobrança;
  // mensalidade precisa de cobrança todo mês, então não pode ficar abaixo do mínimo.
  if ((item.plano && final < MINIMO_COBRANCA) || (!item.plano && final > 0 && final < MINIMO_COBRANCA)) {
    return {
      ok: false,
      mensagem: `Este cupom não vale para ${item.nome}: o valor ficaria abaixo do mínimo de uma cobrança (R$ 5,00).`,
      motivo: 'minimo',
    };
  }
  // No anual, "N mensalidades" vira a primeira anuidade; "todas" continua todas.
  const meses = !item.plano ? null : item.anual && c.meses != null ? 1 : c.meses;
  return { ok: true, cupom: c, final, desconto, meses, texto: descreverDesconto(c, item.plano, item.anual) };
}

/** Resposta da reserva atômica, em palavras para o cliente. */
export const MENSAGEM_RESERVA = {
  esgotado: 'Este cupom acabou de esgotar.',
  limite_conta: 'Você já usou este cupom.',
} as const;

/** O pedido avulso mudou de situação: o uso do cupom acompanha (pago conta; cancelado e estornado liberam). */
export async function cupomDoPedido(cupons: RepositorioCupons, pedido: Pedido, tipo: EventoPagamento['tipo']): Promise<void> {
  const uso = await cupons.porPedido(pedido.id);
  if (!uso) return;
  if (tipo === 'pago' && uso.status !== 'usado') await cupons.atualizarUso(uso.id, { status: 'usado' });
  if ((tipo === 'cancelado' || tipo === 'estornado') && uso.status !== 'liberado') await cupons.atualizarUso(uso.id, { status: 'liberado' });
}

/** Assinatura cancelada antes do primeiro pagamento: o cupom volta a ficar disponível. */
export async function cupomAoCancelarAssinatura(cupons: RepositorioCupons, assinaturaId: string): Promise<void> {
  const uso = await cupons.porAssinatura(assinaturaId);
  if (uso?.status === 'reservado') await cupons.atualizarUso(uso.id, { status: 'liberado' });
}

/**
 * Uma mensalidade com desconto foi paga. Quando chega ao número de meses do cupom, a
 * assinatura volta ao valor cheio no Asaas. Se o Asaas falhar, o erro vai para o painel
 * e a próxima mensalidade paga tenta de novo (ou o admin encerra pelo painel).
 */
export async function cupomAposMensalidade(ctx: Contexto, a: Assinatura): Promise<void> {
  const uso = await ctx.cupons.porAssinatura(a.id);
  if (!uso || uso.status === 'liberado') return;
  if (uso.descontoEncerradoEm) {
    if (uso.status !== 'usado') await ctx.cupons.atualizarUso(uso.id, { status: 'usado' });
    return;
  }
  const pagas = uso.mensalidadesPagas + 1;
  await ctx.cupons.atualizarUso(uso.id, { status: 'usado', mensalidadesPagas: pagas });
  if (uso.meses != null && pagas >= uso.meses) await encerrarDesconto(ctx, a, uso.id, uso.valorOriginal);
}

/** Volta a assinatura ao valor cheio (no Asaas e aqui). Também usado pelo painel para encerrar antes. */
export async function encerrarDesconto(ctx: Contexto, a: Assinatura, usoId: string, valorOriginal: number): Promise<{ ok: boolean; mensagem: string }> {
  const cheio = a.valorCheio ?? valorOriginal;
  if (a.status !== 'cancelada' && a.provedorId && ctx.pagamento?.nome === a.provedor) {
    try {
      await ctx.pagamento.atualizarValorAssinatura(a.provedorId, cheio);
    } catch (e) {
      const mensagem = `Não foi possível voltar a assinatura ${a.id} (${a.nomePlano}) ao valor cheio no Asaas: ${(e as Error).message}`;
      await ctx.erros.registrar({ origem: 'api', mensagem, usuarioId: a.usuarioId });
      return { ok: false, mensagem };
    }
  }
  await ctx.contas.atualizarAssinatura(a.id, { valorMensal: cheio });
  await ctx.cupons.atualizarUso(usoId, { encerrarDesconto: true });
  return { ok: true, mensagem: `A assinatura voltou ao valor cheio (${cheio.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}).` };
}
