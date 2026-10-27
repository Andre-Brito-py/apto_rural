import type { Status } from '@apto/regras';
import { expressaoProibida, numeroInventado, numerosPermitidos, PROIBIDAS_SEMPRE, semDadosPessoais, temDadoPessoal, temFormatacao } from './comum.js';
import type { ExecutorIA } from './executor.js';

/**
 * Frase "o que isso significa e o que fazer" de cada imóvel no e-mail diário da carteira
 * (docs/ia.md). Sem IA, sai uma frase fixa pela pior mudança: o e-mail nunca depende dela.
 */
export interface MudancaCarteira {
  titulo: string;
  de: Status;
  para: Status;
  resumo: string;
  piorou: boolean;
}

const ROTULO: Record<Status, string> = { impedimento: 'impedimento', atencao: 'atenção', nao_verificado: 'não verificado', sem_impedimento: 'ok' };

/** Frase fixa, pela mudança que mais pesa. */
export function fraseDeModelo(mudancas: MudancaCarteira[]): string {
  if (mudancas.some((m) => m.para === 'impedimento' && m.de !== 'impedimento')) {
    return 'Este imóvel passou a ter impedimento: antes de seguir com o crédito, abra o resultado e veja as saídas que a norma admite.';
  }
  if (mudancas.some((m) => m.para === 'atencao' && m.piorou)) {
    return 'Apareceu um ponto de atenção: vale conferir o resultado antes da próxima proposta deste imóvel.';
  }
  if (mudancas.some((m) => m.para === 'nao_verificado')) {
    return 'Algum item ficou sem conferência hoje (a base pode ter falhado): confira o resultado de novo nos próximos dias.';
  }
  return 'A situação deste imóvel melhorou: confira o resultado atualizado e o que já pode seguir para a proposta.';
}

const INSTRUCOES = `Você escreve UMA frase curta, em português do Brasil simples, para um técnico agrícola, dizendo o que as mudanças de hoje num imóvel da carteira significam e o que ele deve fazer agora.
Regras: use só os fatos recebidos; não invente número, data, nome nem lei; não prometa aprovação ("aprovado", "garantido", "com certeza"); a decisão final é do banco; não escreva código do CAR, CPF ou nome de pessoa; sem listas nem negrito; de 15 a 45 palavras.`;

const ESQUEMA = {
  nome: 'frase_carteira',
  schema: { type: 'object', additionalProperties: false, required: ['frase'], properties: { frase: { type: 'string' } } },
};

export function fatosDaMudanca(mudancas: MudancaCarteira[]) {
  return mudancas.slice(0, 8).map((m) => ({ item: m.titulo, antes: ROTULO[m.de], agora: ROTULO[m.para], o_que_mudou: semDadosPessoais(m.resumo, 300) }));
}

export function conferirFrase(saida: unknown, mudancas: MudancaCarteira[]): { ok: true; valor: string } | { ok: false; motivo: string } {
  const frase = typeof (saida as { frase?: unknown })?.frase === 'string' ? (saida as { frase: string }).frase.trim().replace(/\s+/g, ' ') : '';
  if (frase.length < 40 || frase.length > 400) return { ok: false, motivo: `tamanho fora do esperado (${frase.length})` };
  if (temFormatacao(frase)) return { ok: false, motivo: 'formatação' };
  // Com piora, "tudo certo" e "sem problemas" seriam mentira.
  const piorou = mudancas.some((m) => m.piorou);
  const proibida = expressaoProibida(frase, [...PROIBIDAS_SEMPRE, ...(piorou ? ['tudo certo', 'sem problemas', 'pode seguir'] : [])]);
  if (proibida) return { ok: false, motivo: `expressão proibida ("${proibida}")` };
  if (temDadoPessoal(frase)) return { ok: false, motivo: 'dado pessoal' };
  const inventado = numeroInventado(frase, numerosPermitidos(JSON.stringify(fatosDaMudanca(mudancas))), mudancas.length);
  if (inventado) return { ok: false, motivo: `número que não está nos fatos (${inventado})` };
  return { ok: true, valor: frase };
}

/** A frase do imóvel: pela IA, se ligada e aprovada na conferência; senão, a fixa. */
export async function fraseDoImovel(executor: ExecutorIA, mudancas: MudancaCarteira[]): Promise<{ frase: string; origem: 'ia' | 'modelo' }> {
  const r = await executor.rodar({
    tarefa: 'carteira',
    instrucoes: INSTRUCOES,
    entrada: JSON.stringify(fatosDaMudanca(mudancas)),
    esquema: ESQUEMA,
    maxTokens: 1200,
    conferir: (json) => conferirFrase(json, mudancas),
  });
  return r.ok ? { frase: r.valor, origem: 'ia' } : { frase: fraseDeModelo(mudancas), origem: 'modelo' };
}
