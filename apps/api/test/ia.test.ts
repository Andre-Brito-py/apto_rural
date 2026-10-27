import type { ResultadoConsulta } from '@apto/regras';
import { describe, expect, it } from 'vitest';

process.env.APTO_DEMO = '1';
process.env.ADMIN_EMAILS = 'admin@exemplo.com';
process.env.LOG_LEVEL = 'silent';
delete process.env.DATABASE_URL;

const { criarServidor, criarContexto } = await import('../src/servidor.js');
const { CARS_DEMO } = await import('../src/repositorio/demo.js');
const { EnviadorMemoria } = await import('../src/email/enviador.js');
const { ServicoExplicacao, conferirExplicacao, semDadosPessoais, explicacaoDeModelo } = await import('../src/ia/explicacao.js');
const { ErroIA } = await import('../src/ia/provedor.js');
const { cifrar, decifrar, chaveMestra } = await import('../src/ia/segredos.js');

const CHAVE = 'sk-proj-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcd';

/** IA falsa: devolve o que o teste mandar e conta as chamadas. */
function iaFalsa() {
  const falsa = {
    chamadas: 0,
    chaveRecebida: '',
    resposta: (fatos: { situacao: string }) =>
      ({
        situacao: fatos.situacao,
        texto:
          'Hoje o imóvel tem um ponto que impede o crédito: há um embargo do Ibama dentro da área. A norma prevê saídas, como financiar só a recuperação da área embargada. O técnico pode juntar os documentos com você. A decisão final é sempre do banco.',
      }) as unknown,
    falhar: false,
  };
  const provedor = (chave: string) => ({
    async gerar(p: { entrada: string }) {
      falsa.chamadas++;
      falsa.chaveRecebida = chave;
      if (falsa.falhar) throw new ErroIA('OpenAI respondeu 401: chave recusada', 401);
      return { json: falsa.resposta(JSON.parse(p.entrada)), tokensEntrada: 900, tokensSaida: 150 };
    },
  });
  return { falsa, provedor };
}

function cookieDe(res: { headers: Record<string, unknown> }): string {
  const c = res.headers['set-cookie'];
  return String(Array.isArray(c) ? c[0] : c).split(';')[0]!;
}

async function contaConfirmada(app: ReturnType<typeof criarServidor>, email: InstanceType<typeof EnviadorMemoria>, endereco: string) {
  const res = await app.inject({ method: 'POST', url: '/v1/conta', payload: { nome: 'Pessoa Teste', email: endereco, senha: 'senha-bem-longa', aceiteTermos: true } });
  const token = decodeURIComponent(/token=([^\s]+)/.exec(email.enviadas.at(-1)!.texto)![1]!);
  await app.inject({ method: 'POST', url: '/v1/conta/confirmar', payload: { token } });
  return cookieDe(res);
}

function montar() {
  const ctx = criarContexto();
  const email = new EnviadorMemoria();
  ctx.email = email;
  const auditoria: { acao: string; dados?: unknown }[] = [];
  // Sem banco nos testes: o painel só precisa registrar a auditoria.
  ctx.admin = { auditar: async (_a: string, acao: string, _alvo: string | null, dados?: unknown) => void auditoria.push({ acao, dados }) } as never;
  const { falsa, provedor } = iaFalsa();
  ctx.ia.explicacao = new ServicoExplicacao({ config: ctx.config, segredos: ctx.ia.segredos, uso: ctx.ia.uso, provedor });
  return { app: criarServidor(ctx), ctx, email, auditoria, falsa };
}

describe('chave da OpenAI no painel', () => {
  const { app, email, auditoria } = montar();
  let admin = '';
  let comum = '';

  it('só o admin vê e muda a IA', async () => {
    admin = await contaConfirmada(app, email, 'admin@exemplo.com');
    comum = await contaConfirmada(app, email, 'comum@exemplo.com');
    expect((await app.inject({ method: 'GET', url: '/v1/admin/ia', headers: { cookie: comum } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'PUT', url: '/v1/admin/ia/chave', headers: { cookie: comum }, payload: { chave: CHAVE } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/v1/admin/ia', headers: { cookie: admin } })).json().chave).toEqual({ definida: false });
  });

  it('recusa o que não parece chave da OpenAI', async () => {
    const r = await app.inject({ method: 'PUT', url: '/v1/admin/ia/chave', headers: { cookie: admin }, payload: { chave: 'minha-senha' } });
    expect(r.statusCode).toBe(400);
  });

  it('salva a chave e nunca devolve o valor: nem na resposta, nem na tela, nem na auditoria', async () => {
    const r = await app.inject({ method: 'PUT', url: '/v1/admin/ia/chave', headers: { cookie: admin }, payload: { chave: `  ${CHAVE}  ` } });
    expect(r.statusCode).toBe(200);
    expect(r.json().chave).toMatchObject({ definida: true, final: 'abcd' });
    const tela = await app.inject({ method: 'GET', url: '/v1/admin/ia', headers: { cookie: admin } });
    const configs = await app.inject({ method: 'GET', url: '/v1/admin/configuracoes', headers: { cookie: admin } });
    for (const corpo of [r.body, tela.body, configs.body, JSON.stringify(auditoria)]) expect(corpo).not.toContain(CHAVE.slice(3, 30));
    expect(auditoria.at(-1)).toEqual({ acao: 'definiu_chave_ia', dados: { final: 'abcd' } });
  });

  it('apagar a chave fica registrado', async () => {
    const r = await app.inject({ method: 'DELETE', url: '/v1/admin/ia/chave', headers: { cookie: admin } });
    expect(r.json().chave).toEqual({ definida: false });
    expect(auditoria.at(-1)!.acao).toBe('apagou_chave_ia');
  });
});

describe('cifra dos segredos (AES-256-GCM)', () => {
  const chave = chaveMestra('a'.repeat(64), '');

  it('o valor guardado não contém a chave e volta igual', () => {
    const guardado = cifrar(chave, 'openai_api_key', CHAVE);
    expect(guardado).not.toContain(CHAVE.slice(3, 20));
    expect(Buffer.from(guardado, 'base64').toString('latin1')).not.toContain(CHAVE.slice(3, 20));
    expect(decifrar(chave, 'openai_api_key', guardado)).toBe(CHAVE);
  });

  it('com outra chave mestra (ou outro nome de segredo) não abre', () => {
    const guardado = cifrar(chave, 'openai_api_key', CHAVE);
    expect(() => decifrar(chaveMestra('b'.repeat(64), ''), 'openai_api_key', guardado)).toThrow();
    expect(() => decifrar(chave, 'outro' as never, guardado)).toThrow();
  });
});

describe('explicação para o produtor', () => {
  const { app, ctx, email, falsa } = montar();
  let admin = '';
  let tecnico = '';
  let consultaId = '';

  async function explicar(cookie?: string) {
    return app.inject({ method: 'POST', url: `/v1/consultas/${consultaId}/explicacao`, headers: cookie ? { cookie } : {} });
  }
  async function novaConsulta() {
    const r = await app.inject({ method: 'POST', url: '/v1/consultas', headers: { cookie: tecnico }, payload: { car: CARS_DEMO.embargoEProdes } });
    consultaId = r.json().id;
  }

  it('sem IA ligada, sai a explicação de modelo (sem chamar a IA e sem guardar)', async () => {
    admin = await contaConfirmada(app, email, 'admin@exemplo.com');
    tecnico = await contaConfirmada(app, email, 'tecnico@exemplo.com');
    await novaConsulta();
    const r = await explicar(tecnico);
    expect(r.json().motivo).toBe('desligada');
    expect(r.json().explicacao.origem).toBe('modelo');
    expect(r.json().explicacao.texto).toContain('impedimento');
    expect(falsa.chamadas).toBe(0);
  });

  it('ligada mas sem chave: modelo', async () => {
    await app.inject({ method: 'PUT', url: '/v1/admin/configuracoes/ia', headers: { cookie: admin }, payload: { valor: { ativo: true, modelo: 'gpt-6-luna', limiteDiario: 50 } } });
    expect((await explicar(tecnico)).json().motivo).toBe('sem_chave');
  });

  it('visitante sem conta não gera (custa uma chamada)', async () => {
    expect((await explicar()).statusCode).toBe(401);
  });

  it('com a chave: gera pela IA uma vez só e guarda; quem abre a consulta depois vê a mesma', async () => {
    await app.inject({ method: 'PUT', url: '/v1/admin/ia/chave', headers: { cookie: admin }, payload: { chave: CHAVE } });
    const r = await explicar(tecnico);
    expect(r.json().explicacao).toMatchObject({ origem: 'ia', modelo: 'gpt-6-luna' });
    expect(falsa.chaveRecebida).toBe(CHAVE);
    expect((await explicar(tecnico)).json().explicacao.texto).toBe(r.json().explicacao.texto);
    expect(falsa.chamadas).toBe(1);
    const publica = await app.inject({ method: 'GET', url: `/v1/consultas/${consultaId}` });
    expect(publica.json().explicacao.origem).toBe('ia');
    expect((await explicar()).statusCode).toBe(200); // já guardada: qualquer um vê, sem nova chamada
  });

  it('texto que muda a situação é barrado: vale o modelo, e nada é guardado', async () => {
    await novaConsulta();
    falsa.resposta = () => ({ situacao: 'sem_impedimento', texto: 'Está tudo certo com o imóvel. '.repeat(8) });
    const r = await explicar(tecnico);
    expect(r.json()).toMatchObject({ motivo: 'barrada', explicacao: { origem: 'modelo' } });
    expect((await app.inject({ method: 'GET', url: `/v1/consultas/${consultaId}` })).json().explicacao).toBeUndefined();
  });

  it('OpenAI fora do ar ou chave recusada: modelo, sem quebrar a tela', async () => {
    falsa.falhar = true;
    const r = await explicar(tecnico);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ motivo: 'falha', explicacao: { origem: 'modelo' } });
    falsa.falhar = false;
  });

  it('limite diário atingido: modelo, sem chamar a IA', async () => {
    await app.inject({ method: 'PUT', url: '/v1/admin/configuracoes/ia', headers: { cookie: admin }, payload: { valor: { ativo: true, modelo: 'gpt-6-luna', limiteDiario: 1 } } });
    const antes = falsa.chamadas;
    expect((await explicar(tecnico)).json().motivo).toBe('limite_diario');
    expect(falsa.chamadas).toBe(antes);
  });

  it('o painel mostra o uso do mês (todas as chamadas, com tokens e custo estimado)', async () => {
    const r = await app.inject({ method: 'GET', url: '/v1/admin/ia', headers: { cookie: admin } });
    expect(r.json().uso.mes).toMatchObject({ chamadas: 3, ok: 1, rejeitadas: 1, erros: 1, tokensEntrada: 1800, tokensSaida: 300 });
    expect(r.json().uso.mes.custoEstimadoUsd).toBeCloseTo((1800 * 0.1 + 300 * 0.5) / 1e6, 6);
  });

  it('o que vai para a IA não tem código do CAR nem CPF', async () => {
    const enviado: string[] = [];
    ctx.ia.explicacao = new ServicoExplicacao({
      config: ctx.config,
      segredos: ctx.ia.segredos,
      uso: ctx.ia.uso,
      provedor: () => ({ gerar: async (p) => (enviado.push(p.entrada), { json: {}, tokensEntrada: 0, tokensSaida: 0 }) }),
    });
    await app.inject({ method: 'PUT', url: '/v1/admin/configuracoes/ia', headers: { cookie: admin }, payload: { valor: { ativo: true, modelo: 'gpt-6-luna', limiteDiario: 50 } } });
    await novaConsulta();
    await explicar(tecnico);
    expect(enviado).toHaveLength(1);
    expect(enviado[0]).not.toContain(CARS_DEMO.embargoEProdes);
    expect(enviado[0]).not.toContain('MT-0000000');
  });
});

describe('conferência do texto da IA', () => {
  const resultado = (veredito: ResultadoConsulta['veredito']): ResultadoConsulta => ({
    car: 'MT-5104906-FAB083D0E06E4C88BD6B872BC5258FD2',
    dataReferencia: '2026-10-26',
    veredito,
    atualizacoes: {},
    avisos: [],
    itens: [
      {
        regraId: 'embargo',
        titulo: 'Embargos ambientais',
        status: veredito === 'sem_impedimento' ? 'sem_impedimento' : 'impedimento',
        resumo: 'Um embargo encontrado na lista do Ibama.',
        detalhes: ['Termo 123/C: 4,43 ha, de 18/09/2024.'],
        caminhos: [{ titulo: 'Financiar só a recuperação da área', descricao: '' }],
        normas: [],
        fontes: [],
        dossie: 'plano_de_saida',
      },
    ],
  });
  const texto = (t: string) => `${t} O técnico pode ajudar a juntar os documentos de cada saída prevista na norma. A decisão final é sempre do banco, depois da análise.`;

  it('aceita texto fiel aos fatos', () => {
    expect(conferirExplicacao({ situacao: 'impedimento', texto: texto('Há um embargo de 4,43 ha, de 18/09/2024, que impede o crédito hoje.') }, resultado('impedimento')).ok).toBe(true);
  });
  it('aceita data escrita por extenso (partes dos números dos fatos)', () => {
    const r = conferirExplicacao(
      { situacao: 'impedimento', texto: texto('Há um embargo de 18 de setembro de 2024, com 4,43 hectares, que impede o crédito hoje.') },
      resultado('impedimento'),
    );
    expect(r.ok).toBe(true);
  });
  it('"nenhum impedimento" vale na situação atenção, mas não quando há impedimento', () => {
    const atencao = { ...resultado('atencao'), itens: resultado('atencao').itens.map((i) => ({ ...i, status: 'atencao' as const })) };
    expect(conferirExplicacao({ situacao: 'atencao', texto: texto('Hoje não há nenhum impedimento, mas há um ponto de atenção: um embargo encosta na divisa.') }, atencao).ok).toBe(true);
    expect(conferirExplicacao({ situacao: 'impedimento', texto: texto('Não há nenhum impedimento, só um embargo.') }, resultado('impedimento')).ok).toBe(false);
  });
  it('barra número que não está no resultado', () => {
    const r = conferirExplicacao({ situacao: 'impedimento', texto: texto('Há um embargo de 12 ha que impede o crédito hoje.') }, resultado('impedimento'));
    expect(r).toMatchObject({ ok: false, motivo: expect.stringContaining('número') });
  });
  it('barra promessa de aprovação e "tudo certo" quando há problema', () => {
    expect(conferirExplicacao({ situacao: 'impedimento', texto: texto('Seu crédito será aprovado, mas há um embargo.') }, resultado('impedimento')).ok).toBe(false);
    expect(conferirExplicacao({ situacao: 'impedimento', texto: texto('No geral está tudo certo, há só um embargo.') }, resultado('impedimento')).ok).toBe(false);
  });
  it('barra situação trocada, lista e dado pessoal', () => {
    expect(conferirExplicacao({ situacao: 'sem_impedimento', texto: texto('Há um embargo.') }, resultado('impedimento')).ok).toBe(false);
    expect(conferirExplicacao({ situacao: 'impedimento', texto: texto('- Há um embargo.\n- Outro ponto.') }, resultado('impedimento')).ok).toBe(false);
    expect(conferirExplicacao({ situacao: 'impedimento', texto: texto('O CPF 123.456.789-09 tem um embargo.') }, resultado('impedimento')).ok).toBe(false);
  });
  it('tira CPF, CNPJ, código do CAR e e-mail do que vai para a IA', () => {
    const t = semDadosPessoais('CPF 123.456.789-09, CNPJ 12.345.678/0001-90, CAR MT-5104906-FAB083D0E06E4C88BD6B872BC5258FD2, a@b.com');
    expect(t).not.toMatch(/\d{3}\.\d{3}|FAB083|a@b\.com/);
  });
  it('a explicação de modelo sai das regras e nunca promete aprovação', () => {
    for (const v of ['impedimento', 'atencao', 'sem_impedimento', 'incompleto'] as const) {
      const t = explicacaoDeModelo(resultado(v));
      expect(t).toContain('a decisão final é sempre do banco');
      expect(t.toLowerCase()).not.toMatch(/aprovad|garantid/);
    }
  });
});

describe('chamada à OpenAI', () => {
  it('modelos que pensam antes (gpt-5, gpt-6) vão com raciocínio baixo; os outros, sem o parâmetro', async () => {
    const { ProvedorOpenAI } = await import('../src/ia/provedor.js');
    const corpos: Record<string, unknown>[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      corpos.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ status: 'completed', output_text: '{"situacao":"atencao","texto":"x"}', usage: {} }), { status: 200 });
    }) as typeof fetch;
    try {
      const pedido = { instrucoes: 'i', entrada: '{}', esquema: { nome: 'e', schema: {} }, maxTokens: 3000 };
      await new ProvedorOpenAI('sk-teste').gerar({ ...pedido, modelo: 'gpt-6-luna' });
      await new ProvedorOpenAI('sk-teste').gerar({ ...pedido, modelo: 'gpt-4o-mini' });
    } finally {
      globalThis.fetch = original;
    }
    expect(corpos[0]).toMatchObject({ model: 'gpt-6-luna', reasoning: { effort: 'low' }, max_output_tokens: 3000, store: false });
    expect(corpos[1]).not.toHaveProperty('reasoning');
  });

  it('resposta cortada (incomplete) vira erro tratado, e o site usa a explicação de modelo', async () => {
    const { ProvedorOpenAI } = await import('../src/ia/provedor.js');
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({ status: 'incomplete' }), { status: 200 })) as typeof fetch;
    try {
      await expect(
        new ProvedorOpenAI('sk-teste').gerar({ modelo: 'gpt-6-luna', instrucoes: 'i', entrada: '{}', esquema: { nome: 'e', schema: {} }, maxTokens: 10 }),
      ).rejects.toThrow(/incompleta/);
    } finally {
      globalThis.fetch = original;
    }
  });
});
