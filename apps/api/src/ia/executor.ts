import type { Configuracoes, FuncoesIA } from '../configuracoes.js';
import { ErroIA, type ProvedorIA } from './provedor.js';
import type { Segredos } from './segredos.js';
import type { TarefaIA, UsoIA } from './uso.js';

/** Por que a IA não foi usada: o site segue sem ela (modelo fixo ou preenchimento à mão). */
export type MotivoSemIA = 'desligada' | 'sem_chave' | 'limite_diario' | 'falha' | 'barrada';

export type Conferencia<T> = { ok: true; valor: T } | { ok: false; motivo: string };

export interface PedidoTarefa<T> {
  tarefa: TarefaIA;
  instrucoes: string;
  entrada: string;
  imagens?: string[];
  esquema: { nome: string; schema: Record<string, unknown> };
  maxTokens: number;
  /** A conferência do que voltou. Barrado = não usa, e o motivo vai para o log. */
  conferir: (json: unknown) => Conferencia<T>;
}

export type RespostaTarefa<T> = { ok: true; valor: T; modelo: string } | { ok: false; motivo: MotivoSemIA };

/** Qual chave de FuncoesIA liga e desliga cada tarefa (o teste da chave sempre pode). */
const FUNCAO: Record<TarefaIA, keyof FuncoesIA | null> = {
  explicacao: 'explicacao',
  recibo: 'recibo',
  documento: 'documentos',
  rascunho: 'rascunhos',
  carteira: 'carteira',
  norma: 'normas',
  teste: null,
};

export interface DependenciasExecutor {
  config: Configuracoes;
  segredos: Segredos;
  uso: UsoIA;
  /** Cria o cliente com a chave do painel (nos testes e no ensaio, um falso). */
  provedor: (chave: string) => ProvedorIA;
}

/**
 * Tudo o que toda função de IA faz antes e depois da chamada: confere se a IA e a função
 * estão ligadas, se há chave e se o limite do dia não estourou; chama; confere o que
 * voltou; registra o uso (sem texto nem dado da consulta). Nunca lança: sem IA, quem
 * chamou segue pelo caminho sem IA.
 */
export class ExecutorIA {
  constructor(private d: DependenciasExecutor) {}

  /** null = dá para usar a IA nesta tarefa agora. */
  async indisponivel(tarefa: TarefaIA): Promise<MotivoSemIA | null> {
    const ia = (await this.d.config.obter()).ia;
    const funcao = FUNCAO[tarefa];
    if (tarefa !== 'teste' && (!ia.ativo || (funcao && !ia.funcoes[funcao]))) return 'desligada';
    if (!(await this.d.segredos.obter('openai_api_key'))) return 'sem_chave';
    if (tarefa !== 'teste' && (await this.d.uso.hoje()) >= ia.limiteDiario) return 'limite_diario';
    return null;
  }

  async rodar<T>(p: PedidoTarefa<T>): Promise<RespostaTarefa<T>> {
    const motivo = await this.indisponivel(p.tarefa);
    if (motivo) return { ok: false, motivo };
    const ia = (await this.d.config.obter()).ia;
    const chave = (await this.d.segredos.obter('openai_api_key'))!;
    try {
      const resposta = await this.d.provedor(chave).gerar({
        modelo: ia.modelo,
        instrucoes: p.instrucoes,
        entrada: p.entrada,
        imagens: p.imagens,
        esquema: p.esquema,
        maxTokens: p.maxTokens,
      });
      const conferida = p.conferir(resposta.json);
      await this.d.uso.registrar({
        tarefa: p.tarefa,
        modelo: ia.modelo,
        tokensEntrada: resposta.tokensEntrada,
        tokensSaida: resposta.tokensSaida,
        resultado: conferida.ok ? 'ok' : 'rejeitado',
      });
      if (!conferida.ok) {
        console.warn(`IA (${p.tarefa}) barrada: ${conferida.motivo}`);
        return { ok: false, motivo: 'barrada' };
      }
      return { ok: true, valor: conferida.valor, modelo: ia.modelo };
    } catch (e) {
      await this.d.uso.registrar({ tarefa: p.tarefa, modelo: ia.modelo, tokensEntrada: 0, tokensSaida: 0, resultado: 'erro' });
      console.warn(`IA (${p.tarefa}) falhou: ${e instanceof ErroIA ? e.message : 'erro inesperado'}`);
      return { ok: false, motivo: 'falha' };
    }
  }
}

/** Frase para a tela quando a IA não foi usada. */
export const MOTIVO_SEM_IA: Record<MotivoSemIA, string> = {
  desligada: 'A leitura por IA está desligada no painel.',
  sem_chave: 'A IA ainda não foi configurada.',
  limite_diario: 'O limite de uso da IA de hoje acabou.',
  falha: 'A IA não respondeu agora.',
  barrada: 'A resposta da IA não passou na conferência automática.',
};
