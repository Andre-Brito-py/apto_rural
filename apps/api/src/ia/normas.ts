import { REGRAS } from '@apto/regras';
import { expressaoProibida, numeroInventado, numerosPermitidos, PROIBIDAS_SEMPRE } from './comum.js';
import type { ExecutorIA, MotivoSemIA } from './executor.js';

/**
 * Análise de norma nova para o administrador (docs/ia.md): ele cola o texto de uma
 * resolução do CMN ou de uma mudança no MCR, e a IA resume o que mudou e quais regras do
 * Apto Rural podem ser afetadas. Ninguém muda regra por aqui: a análise é para a pessoa
 * ler a norma com um roteiro, e as regras só mudam no código, com a norma citada e os
 * testes (regra de ouro 5 do README).
 */
export interface MudancaNorma {
  oQueMudou: string;
  regras: string[];
  oQueConferir: string;
}

export interface AnaliseNorma {
  id?: string;
  titulo: string;
  resumo: string;
  vigencia: string | null;
  semRelacao: boolean;
  mudancas: MudancaNorma[];
  modelo: string;
  geradaEm: string;
}

export const TAMANHO_MAXIMO_NORMA = 80_000;

const IDS = REGRAS.map((r) => r.id);

const INSTRUCOES = `Você ajuda o responsável pelo Apto Rural, um sistema que confere os impedimentos socioambientais do crédito rural (Manual de Crédito Rural, capítulo 2, seção 9), a entender uma norma nova. Você recebe as regras que o sistema aplica hoje (id, título e normas citadas) e o texto da norma nova.
Regras obrigatórias:
1. Use só o texto da norma e as regras recebidas. Não invente artigo, data, prazo nem número.
2. resumo: 2 a 5 frases dizendo do que a norma trata.
3. vigencia: quando passa a valer, como está escrito na norma, ou null.
4. mudancas: cada mudança que pode afetar o crédito rural socioambiental, com o que mudou, os ids das regras do sistema que ela pode afetar (só ids da lista) e o que a pessoa deve conferir na norma antes de mudar o sistema.
5. sem_relacao: true se a norma não tem nada a ver com essas regras (então mudancas fica vazia).
6. Sem Markdown.`;

const ESQUEMA = {
  nome: 'analise_norma',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['resumo', 'vigencia', 'sem_relacao', 'mudancas'],
    properties: {
      resumo: { type: 'string' },
      vigencia: { type: ['string', 'null'] },
      sem_relacao: { type: 'boolean' },
      mudancas: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['o_que_mudou', 'regras', 'o_que_conferir'],
          properties: {
            o_que_mudou: { type: 'string' },
            regras: { type: 'array', items: { type: 'string', enum: IDS } },
            o_que_conferir: { type: 'string' },
          },
        },
      },
    },
  },
};

export const regrasDeHoje = () => REGRAS.map((r) => ({ id: r.id, titulo: r.titulo, normas: r.normas.map((n) => `${n.item} (${n.ato})`) }));

interface SaidaNorma {
  resumo: string;
  vigencia: string | null;
  sem_relacao: boolean;
  mudancas: { o_que_mudou: string; regras: string[]; o_que_conferir: string }[];
}

export function conferirAnalise(saida: unknown, texto: string): { ok: true; valor: SaidaNorma } | { ok: false; motivo: string } {
  const o = saida as SaidaNorma;
  if (!o || typeof o.resumo !== 'string' || !Array.isArray(o.mudancas)) return { ok: false, motivo: 'sem resposta' };
  if (o.resumo.length < 40 || o.resumo.length > 1500) return { ok: false, motivo: 'resumo fora do tamanho' };
  if (o.mudancas.length > 15) return { ok: false, motivo: 'mudanças demais' };
  if (o.mudancas.some((m) => m.regras.some((id) => !IDS.includes(id)))) return { ok: false, motivo: 'regra que não existe' };
  const tudo = [o.resumo, o.vigencia ?? '', ...o.mudancas.flatMap((m) => [m.o_que_mudou, m.o_que_conferir])].join(' ');
  const proibida = expressaoProibida(tudo, PROIBIDAS_SEMPRE);
  if (proibida) return { ok: false, motivo: `expressão proibida ("${proibida}")` };
  const inventado = numeroInventado(tudo, numerosPermitidos(`${texto} ${JSON.stringify(regrasDeHoje())}`), 15);
  if (inventado) return { ok: false, motivo: `número que não está na norma (${inventado})` };
  return { ok: true, valor: o };
}

export async function analisarNorma(
  executor: ExecutorIA,
  titulo: string,
  textoBruto: string,
): Promise<{ ok: true; analise: AnaliseNorma } | { ok: false; motivo: MotivoSemIA }> {
  const texto = textoBruto.slice(0, TAMANHO_MAXIMO_NORMA);
  const r = await executor.rodar({
    tarefa: 'norma',
    instrucoes: INSTRUCOES,
    entrada: JSON.stringify({ regras_do_sistema_hoje: regrasDeHoje(), norma_nova: texto }),
    esquema: ESQUEMA,
    maxTokens: 6000,
    conferir: (json) => conferirAnalise(json, texto),
  });
  if (!r.ok) return r;
  const v = r.valor;
  return {
    ok: true,
    analise: {
      titulo,
      resumo: v.resumo.trim(),
      vigencia: v.vigencia,
      semRelacao: v.sem_relacao,
      mudancas: v.mudancas.map((m) => ({ oQueMudou: m.o_que_mudou.trim(), regras: m.regras, oQueConferir: m.o_que_conferir.trim() })),
      modelo: r.modelo,
      geradaEm: new Date().toISOString(),
    },
  };
}
