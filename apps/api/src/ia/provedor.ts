/**
 * Cliente da OpenAI pela Responses API (POST /v1/responses), com saída estruturada
 * (JSON Schema estrito). Conferido em developers.openai.com em 26/10/2026.
 * Sem biblioteca: um fetch só. A chave vai no cabeçalho e nunca aparece em log ou erro.
 */
export interface PedidoIA {
  modelo: string;
  instrucoes: string;
  entrada: string;
  /**
   * Páginas de documento escaneado ou fotos, como data URL (image/jpeg ou image/png). Só nas
   * funções que leem documento; a explicação do resultado manda só texto.
   */
  imagens?: string[];
  esquema: { nome: string; schema: Record<string, unknown> };
  maxTokens: number;
}

export interface RespostaIA {
  json: unknown;
  tokensEntrada: number;
  tokensSaida: number;
}

export interface ProvedorIA {
  gerar(p: PedidoIA): Promise<RespostaIA>;
}

export class ErroIA extends Error {
  constructor(
    mensagem: string,
    /** Status HTTP da OpenAI, quando houver (401 = chave errada, 429 = limite ou saldo). */
    public status?: number,
  ) {
    super(mensagem);
  }
}

const TEMPO_MAXIMO_MS = 25_000;

/**
 * Modelos que "pensam" antes de responder (linhas gpt-5 e gpt-6 e a série o): o raciocínio
 * sai do mesmo limite de tokens da resposta. No esforço padrão (médio), a resposta podia
 * ser cortada no meio (status "incomplete") e o site caía sempre na explicação de modelo.
 * Reescrever um resultado pronto é tarefa simples: esforço baixo basta e custa menos.
 * Conferido em developers.openai.com/api/docs/models/gpt-6-luna em 27/10/2026.
 */
export const pensaAntes = (modelo: string) => /^(gpt-5|gpt-6|o\d)/.test(modelo);

interface CorpoResposta {
  status?: string;
  error?: { message?: string } | null;
  output_text?: string;
  output?: { type?: string; content?: { type?: string; text?: string }[] }[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

export class ProvedorOpenAI implements ProvedorIA {
  constructor(
    private chave: string,
    private base = 'https://api.openai.com/v1',
  ) {}

  async gerar(p: PedidoIA): Promise<RespostaIA> {
    let r: Response;
    try {
      r = await fetch(`${this.base}/responses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.chave}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(TEMPO_MAXIMO_MS),
        body: JSON.stringify({
          model: p.modelo,
          instructions: p.instrucoes,
          input: p.imagens?.length
            ? [
                {
                  role: 'user',
                  content: [{ type: 'input_text', text: p.entrada }, ...p.imagens.map((u) => ({ type: 'input_image', image_url: u, detail: 'high' }))],
                },
              ]
            : p.entrada,
          max_output_tokens: p.maxTokens,
          ...(pensaAntes(p.modelo) ? { reasoning: { effort: 'low' } } : {}),
          // Nada do que mandamos fica guardado na OpenAI para consulta posterior.
          store: false,
          text: { format: { type: 'json_schema', name: p.esquema.nome, schema: p.esquema.schema, strict: true } },
        }),
      });
    } catch (e) {
      throw new ErroIA(`Sem resposta da OpenAI (${(e as Error).name === 'TimeoutError' ? 'demorou demais' : 'falha de conexão'}).`);
    }
    const corpo = (await r.json().catch(() => ({}))) as CorpoResposta;
    if (!r.ok) {
      const motivo = r.status === 401 ? 'chave recusada' : r.status === 429 ? 'limite ou saldo da conta OpenAI' : (corpo.error?.message ?? 'erro');
      throw new ErroIA(`OpenAI respondeu ${r.status}: ${motivo.slice(0, 200)}`, r.status);
    }
    if (corpo.status && corpo.status !== 'completed') throw new ErroIA(`Resposta da OpenAI incompleta (${corpo.status}).`);
    const texto =
      corpo.output_text ??
      (corpo.output ?? [])
        .flatMap((o) => o.content ?? [])
        .filter((c) => c.type === 'output_text')
        .map((c) => c.text ?? '')
        .join('');
    let json: unknown;
    try {
      json = JSON.parse(texto);
    } catch {
      throw new ErroIA('A OpenAI não devolveu o formato pedido.');
    }
    return { json, tokensEntrada: corpo.usage?.input_tokens ?? 0, tokensSaida: corpo.usage?.output_tokens ?? 0 };
  }
}
