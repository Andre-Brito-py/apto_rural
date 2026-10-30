import { describe, expect, it } from 'vitest';

process.env.APTO_DEMO = '1';
process.env.ADMIN_EMAILS = 'admin@exemplo.com';
process.env.LOG_LEVEL = 'silent';
delete process.env.DATABASE_URL;

const { criarServidor, criarContexto } = await import('../src/servidor.js');
const { CARS_DEMO } = await import('../src/repositorio/demo.js');
const { EnviadorMemoria } = await import('../src/email/enviador.js');
const { ExecutorIA } = await import('../src/ia/executor.js');
const { lerReciboPorPadroes } = await import('../src/ia/recibo.js');
const { LEITURAS_RECIBO_POR_DIA } = await import('../src/rotas/ia.js');
const { fraseDeModelo, conferirFrase } = await import('../src/ia/carteira.js');
const { mensagemAvisosCarteira } = await import('../src/email/mensagens.js');
const { formatarCar } = await import('@apto/regras');

const CHAVE = 'sk-proj-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcd';
type App = ReturnType<typeof criarServidor>;
interface Pedido {
  entrada: string;
  imagens?: string[];
  esquema: { nome: string };
}

/** IA falsa: responde conforme o esquema pedido; o teste troca a resposta quando quiser. */
function montar() {
  const ctx = criarContexto();
  const email = new EnviadorMemoria();
  ctx.email = email;
  ctx.admin = { auditar: async () => {} } as never;
  const pedidos: Pedido[] = [];
  const respostas: Record<string, (p: Pedido) => unknown> = {};
  ctx.ia.executor = new ExecutorIA({
    config: ctx.config,
    segredos: ctx.ia.segredos,
    uso: ctx.ia.uso,
    provedor: () => ({
      async gerar(p: Pedido) {
        pedidos.push(p);
        const r = respostas[p.esquema.nome];
        if (!r) throw new Error(`sem resposta para ${p.esquema.nome}`);
        return { json: r(p), tokensEntrada: 500, tokensSaida: 100 };
      },
    }),
  });
  return { app: criarServidor(ctx), ctx, email, pedidos, respostas };
}

const cookieDe = (res: { headers: Record<string, unknown> }) => String([res.headers['set-cookie']].flat()[0]).split(';')[0]!;

async function conta(app: App, email: InstanceType<typeof EnviadorMemoria>, endereco: string) {
  const res = await app.inject({ method: 'POST', url: '/v1/conta', payload: { nome: 'Pessoa Teste', email: endereco, senha: 'senha-bem-longa', aceiteTermos: true } });
  const token = decodeURIComponent(/token=([^\s]+)/.exec(email.enviadas.at(-1)!.texto)![1]!);
  await app.inject({ method: 'POST', url: '/v1/conta/confirmar', payload: { token } });
  return cookieDe(res);
}

/** Liga a IA (todas as funções) e cadastra a chave. */
async function ligarIA(ctx: ReturnType<typeof montar>['ctx'], funcoes: Record<string, boolean> = {}) {
  await ctx.config.salvar(
    'ia',
    {
      ativo: true,
      modelo: 'gpt-6-luna',
      limiteDiario: 100,
      funcoes: { explicacao: true, recibo: true, documentos: true, rascunhos: true, carteira: true, normas: true, ...funcoes },
    },
    'admin',
  );
  await ctx.ia.segredos.definir('openai_api_key', CHAVE, 'admin');
}

const DEMONSTRATIVO = `DEMONSTRATIVO DA SITUAÇÃO DAS INFORMAÇÕES DECLARADAS NO CAR
Registro no CAR: MT-5107925-1A2B.3C4D.5E6F.7A8B.9C0D.1E2F.3A4B.5C6D
Proprietário: João da Silva CPF 123.456.789-09
Situação do Cadastro: Ativo
Área do Imóvel: 1.234,56 ha
Município: Sorriso/MT
Data da Inscrição: 10/05/2016`;

describe('recibo do CAR', () => {
  it('padrões acham o código do CAR, a situação, a área e a data sem IA', () => {
    const r = lerReciboPorPadroes(`${DEMONSTRATIVO}\nMódulos Fiscais: 12,35`);
    expect(r).toEqual({ car: 'MT-5107925-1A2B3C4D5E6F7A8B9C0D1E2F3A4B5C6D', situacao: 'ativo', areaHa: 1234.56, modulosFiscais: 12.35, dataInscricao: '10/05/2016' });
  });

  it('sem IA: devolve o que os padrões acharam; exige conta; arquivo sem recibo é recusado', async () => {
    const { app, email } = montar();
    expect((await app.inject({ method: 'POST', url: '/v1/ia/recibo-car', payload: { texto: DEMONSTRATIVO } })).statusCode).toBe(401);
    const cookie = await conta(app, email, 'recibo@exemplo.com');
    const r = await app.inject({ method: 'POST', url: '/v1/ia/recibo-car', headers: { cookie }, payload: { texto: DEMONSTRATIVO } });
    expect(r.json()).toMatchObject({ car: 'MT-5107925-1A2B3C4D5E6F7A8B9C0D1E2F3A4B5C6D', situacao: 'ativo', origem: 'texto', motivoSemIA: 'desligada' });
    const lixo = await app.inject({ method: 'POST', url: '/v1/ia/recibo-car', headers: { cookie }, payload: { texto: 'Cardápio do restaurante: arroz, feijão e salada. '.repeat(3) } });
    expect(lixo.statusCode).toBe(422);
  });

  it('com IA: completa o que falta, e vai sem CPF nem código do CAR; número que não está no recibo é barrado', async () => {
    const { app, ctx, email, pedidos, respostas } = montar();
    await ligarIA(ctx);
    const cookie = await conta(app, email, 'recibo-ia@exemplo.com');
    const texto = `${DEMONSTRATIVO}\nQuantidade de módulos: 12,35`;
    respostas.recibo_car = () => ({ situacao: 'ativo', area_ha: 1234.56, modulos_fiscais: 12.35, municipio: 'Sorriso', uf: 'MT', data_inscricao: '10/05/2016' });
    const r = await app.inject({ method: 'POST', url: '/v1/ia/recibo-car', headers: { cookie }, payload: { texto } });
    expect(r.json()).toMatchObject({ car: 'MT-5107925-1A2B3C4D5E6F7A8B9C0D1E2F3A4B5C6D', modulosFiscais: 12.35, municipio: 'Sorriso', uf: 'MT', origem: 'ia' });
    expect(pedidos[0]!.entrada).not.toMatch(/123\.456\.789|1A2B\.3C4D/);

    respostas.recibo_car = () => ({ situacao: 'ativo', area_ha: 1234.56, modulos_fiscais: 99, municipio: null, uf: null, data_inscricao: null });
    const inventado = await app.inject({ method: 'POST', url: '/v1/ia/recibo-car', headers: { cookie }, payload: { texto } });
    expect(inventado.json()).toMatchObject({ origem: 'texto', motivoSemIA: 'barrada' });
    expect(inventado.json().modulosFiscais).toBeUndefined();
  });

  it('só com o e-mail confirmado, e com limite de leituras por conta por dia', async () => {
    const { app, ctx, email, respostas } = montar();
    await ligarIA(ctx);
    respostas.recibo_car = () => ({ situacao: 'ativo', area_ha: 1234.56, modulos_fiscais: null, municipio: 'Sorriso', uf: 'MT', data_inscricao: '10/05/2016' });
    const ler = (cookie: string, i: number) =>
      // Endereços diferentes: o teste é do limite por conta, não do freio por endereço de internet.
      app.inject({ method: 'POST', url: '/v1/ia/recibo-car', headers: { cookie }, remoteAddress: `10.0.${Math.floor(i / 200)}.${i % 200}`, payload: { texto: DEMONSTRATIVO } });

    const semConfirmar = cookieDe(
      await app.inject({ method: 'POST', url: '/v1/conta', payload: { nome: 'Sem Confirmar', email: 'nova@exemplo.com', senha: 'senha-bem-longa', aceiteTermos: true } }),
    );
    const r = await ler(semConfirmar, 0);
    expect(r.statusCode).toBe(403);
    expect(r.json().erro.mensagem).toMatch(/Confirme seu e-mail/);

    const cookie = await conta(app, email, 'muitos-recibos@exemplo.com');
    for (let i = 0; i < LEITURAS_RECIBO_POR_DIA; i++) expect((await ler(cookie, i + 1)).statusCode).toBe(200);
    const demais = await ler(cookie, 999);
    expect(demais.statusCode).toBe(429);
    expect(demais.json().erro.mensagem).toMatch(/limite por conta/);
    // Outra conta continua lendo.
    expect((await ler(await conta(app, email, 'outra-conta@exemplo.com'), 1000)).statusCode).toBe(200);
  });
});

describe('dossiê: documentos conferidos e rascunhos', () => {
  const { app, ctx, email, pedidos, respostas } = montar();
  let cookie = '';
  let outro = '';
  let consultaId = '';

  const consultar = async () =>
    (await app.inject({ method: 'POST', url: '/v1/consultas', headers: { cookie }, payload: { car: CARS_DEMO.embargoEProdes, situacaoCar: 'ativo', modulosFiscais: 20 } })).json();

  it('a consulta de exemplo tem itens com dossiê e os rascunhos que cabem em cada um', async () => {
    cookie = await conta(app, email, 'tecnica@exemplo.com');
    outro = await conta(app, email, 'outra@exemplo.com');
    const c = await consultar();
    consultaId = c.id;
    const apoio = (await app.inject({ method: 'GET', url: `/v1/consultas/${consultaId}/apoio`, headers: { cookie } })).json();
    expect(apoio.rascunhosPorItem.embargo.map((t: { tipo: string }) => t.tipo)).toContain('carta_banco');
    expect(apoio.rascunhosPorItem.embargo.map((t: { tipo: string }) => t.tipo)).toContain('requerimento_orgao');
    expect(apoio.ia.documentos).toMatch(/desligada/);
    expect(apoio.documentos).toEqual([]);
  });

  it('sem IA, o rascunho sai do modelo fixo: com o CAR, campos para preencher e sem promessa', async () => {
    const r = await app.inject({ method: 'POST', url: `/v1/consultas/${consultaId}/rascunhos`, headers: { cookie }, payload: { regraId: 'embargo', tipo: 'carta_banco' } });
    expect(r.statusCode).toBe(201);
    const rascunho = r.json();
    expect(rascunho).toMatchObject({ origem: 'modelo', tipo: 'carta_banco', motivoSemIA: 'desligada' });
    expect(rascunho.texto).toContain(formatarCar(CARS_DEMO.embargoEProdes));
    expect(rascunho.texto).toContain('[NOME DO PRODUTOR]');
    expect(rascunho.texto.toLowerCase()).not.toMatch(/aprovad|garantid/);
  });

  it('sem IA, conferir documento avisa que precisa ser à mão; outra conta não usa', async () => {
    const r = await app.inject({
      method: 'POST',
      url: `/v1/consultas/${consultaId}/documentos`,
      headers: { cookie },
      payload: { regraId: 'embargo', nomeArquivo: 'termo.pdf', texto: 'Termo de embargo do Ibama número 123 de 2024. '.repeat(3) },
    });
    expect(r.statusCode).toBe(503);
    expect(r.json().erro.mensagem).toMatch(/à mão/);
    // O exemplo é desta conta: outra conta não vê o apoio dele (nem os documentos enviados).
    const alheio = await app.inject({ method: 'GET', url: `/v1/consultas/${consultaId}/apoio`, headers: { cookie: outro } });
    expect(alheio.statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: `/v1/consultas/${consultaId}/apoio` })).statusCode).toBe(401);
  });

  it('com IA: confere o documento, acha o CAR deste imóvel no texto, guarda só o resultado', async () => {
    await ligarIA(ctx);
    // Consulta real da pessoa (não fictícia) para o CAR "outro" ficar claro.
    respostas.documento_dossie = () => ({
      tipo_documento: 'Termo de Embargo',
      orgao: 'Ibama',
      numero: '123/C',
      data_emissao: '18/09/2024',
      validade: null,
      area_ha: 4.5,
      requisito: null,
      car_citado: null,
      pontos: [
        { texto: 'O termo é do Ibama, como o embargo encontrado na consulta.', situacao: 'confere' },
        { texto: 'Confira se a área do termo é a mesma da sobreposição.', situacao: 'conferir' },
      ],
    });
    const texto = `TERMO DE EMBARGO Nº 123/C, de 18/09/2024. Área embargada: 4,5 ha. Imóvel CAR ${CARS_DEMO.embargoEProdes}. Autuado: Maria Souza, CPF 987.654.321-00.`;
    const r = await app.inject({
      method: 'POST',
      url: `/v1/consultas/${consultaId}/documentos`,
      headers: { cookie },
      payload: { regraId: 'embargo', nomeArquivo: 'termo-embargo.pdf', texto },
    });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ tipoDocumento: 'Termo de Embargo', orgao: 'Ibama', car: 'este', lidoDe: 'texto', nomeArquivo: 'termo-embargo.pdf' });
    expect(pedidos.at(-1)!.entrada).not.toContain('987.654.321-00');
    const apoio = (await app.inject({ method: 'GET', url: `/v1/consultas/${consultaId}/apoio`, headers: { cookie } })).json();
    expect(apoio.documentos).toHaveLength(1);
    expect(JSON.stringify(apoio)).not.toContain('Maria Souza');
  });

  it('número que não está no documento barra a conferência', async () => {
    respostas.documento_dossie = () => ({
      tipo_documento: 'Termo de Embargo',
      orgao: 'Ibama',
      numero: '999',
      data_emissao: null,
      validade: null,
      area_ha: null,
      requisito: null,
      car_citado: null,
      pontos: [{ texto: 'Termo número 999.', situacao: 'conferir' }],
    });
    const r = await app.inject({
      method: 'POST',
      url: `/v1/consultas/${consultaId}/documentos`,
      headers: { cookie },
      payload: { regraId: 'embargo', nomeArquivo: 'outro.pdf', texto: 'Termo de embargo do Ibama número 123 de 2024, área de 4,5 ha.' },
    });
    expect(r.statusCode).toBe(503);
  });

  it('documento escaneado vai como imagem e é marcado para conferir os números no papel', async () => {
    respostas.documento_dossie = (p) => {
      expect(p.imagens).toHaveLength(1);
      return {
        tipo_documento: 'Autorização de Supressão de Vegetação',
        orgao: 'Sema-MT',
        numero: '4567/2018',
        data_emissao: '01/02/2018',
        validade: '01/02/2020',
        area_ha: 30,
        requisito: null,
        car_citado: 'MT-0000000-0000.0000.0000.0000.0000.0000.0000.0009',
        pontos: [{ texto: 'A autorização é anterior à data de corte.', situacao: 'confere' }],
      };
    };
    const imagem = `data:image/jpeg;base64,${Buffer.from('imagem-falsa').toString('base64')}`;
    const r = await app.inject({
      method: 'POST',
      url: `/v1/consultas/${consultaId}/documentos`,
      headers: { cookie },
      payload: { regraId: 'prodes', nomeArquivo: 'asv.jpg', imagens: [imagem] },
    });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ lidoDe: 'imagem', car: 'outro', orgao: 'Sema-MT' });
  });

  it('com IA: o rascunho cita os documentos conferidos e recebe o CAR no lugar da marca', async () => {
    respostas.rascunho = (p) => {
      expect(p.entrada).toContain('Termo de Embargo');
      expect(p.entrada).not.toContain(CARS_DEMO.embargoEProdes);
      return {
        titulo: 'Carta ao banco: embargo',
        texto:
          '[MUNICÍPIO/UF], [DATA].\n\nAo gerente da instituição financeira\n\nAssunto: proposta de crédito rural do imóvel do CAR [CÓDIGO DO CAR].\n\n' +
          'Prezado gerente, a pré-checagem encontrou um embargo do Ibama no imóvel. A norma admite saídas para este caso, e por isso apresentamos a documentação correspondente para a sua análise. '.repeat(
            3,
          ) +
          '\n\nSegue anexo o Termo de Embargo do Ibama.\n\nAtenciosamente,\n[NOME DO RESPONSÁVEL TÉCNICO]',
      };
    };
    const r = await app.inject({ method: 'POST', url: `/v1/consultas/${consultaId}/rascunhos`, headers: { cookie }, payload: { regraId: 'embargo', tipo: 'carta_banco' } });
    expect(r.json()).toMatchObject({ origem: 'ia', modelo: 'gpt-6-luna' });
    expect(r.json().texto).toContain(formatarCar(CARS_DEMO.embargoEProdes));
    expect(r.json().texto).not.toContain('[CÓDIGO DO CAR]');
  });

  it('rascunho com promessa é barrado e sai o modelo fixo; rascunho que não cabe no item é recusado', async () => {
    respostas.rascunho = () => ({ titulo: 'Carta', texto: `O crédito será aprovado. ${'Texto do rascunho. '.repeat(60)}` });
    const r = await app.inject({ method: 'POST', url: `/v1/consultas/${consultaId}/rascunhos`, headers: { cookie }, payload: { regraId: 'embargo', tipo: 'carta_banco' } });
    expect(r.json()).toMatchObject({ origem: 'modelo', motivoSemIA: 'barrada' });
    const naoCabe = await app.inject({ method: 'POST', url: `/v1/consultas/${consultaId}/rascunhos`, headers: { cookie }, payload: { regraId: 'prodes', tipo: 'retificacao_car' } });
    expect(naoCabe.statusCode).toBe(400);
  });

  it('apagar um item do apoio', async () => {
    const apoio = (await app.inject({ method: 'GET', url: `/v1/consultas/${consultaId}/apoio`, headers: { cookie } })).json();
    const id = apoio.rascunhos[0].id;
    expect((await app.inject({ method: 'DELETE', url: `/v1/consultas/${consultaId}/apoio/${id}`, headers: { cookie } })).statusCode).toBe(200);
    const depois = (await app.inject({ method: 'GET', url: `/v1/consultas/${consultaId}/apoio`, headers: { cookie } })).json();
    expect(depois.rascunhos.map((x: { id: string }) => x.id)).not.toContain(id);
  });

  it('cada função pode ser desligada sozinha no painel', async () => {
    await ligarIA(ctx, { documentos: false });
    const apoio = (await app.inject({ method: 'GET', url: `/v1/consultas/${consultaId}/apoio`, headers: { cookie } })).json();
    expect(apoio.ia).toEqual({ documentos: expect.stringMatching(/desligada/), rascunhos: null });
    expect((await ctx.ia.uso.doMes()).porTarefa).toMatchObject({ documento: 3, rascunho: 2 });
  });
});

describe('e-mail da carteira', () => {
  const mudanca = (para: 'impedimento' | 'atencao' | 'sem_impedimento', piorou: boolean) =>
    [{ titulo: 'Embargos ambientais', de: 'sem_impedimento' as const, para, resumo: 'Um embargo encontrado.', piorou }];

  it('frase fixa pela mudança que mais pesa', () => {
    expect(fraseDeModelo(mudanca('impedimento', true))).toMatch(/passou a ter impedimento/);
    expect(fraseDeModelo(mudanca('atencao', true))).toMatch(/ponto de atenção/);
    expect(fraseDeModelo([{ ...mudanca('sem_impedimento', false)[0]!, de: 'impedimento' }])).toMatch(/melhorou/);
  });

  it('a conferência barra promessa e "tudo certo" quando piorou', () => {
    expect(conferirFrase({ frase: 'O crédito está garantido, pode seguir com a proposta deste imóvel sem medo.' }, mudanca('atencao', true)).ok).toBe(false);
    expect(conferirFrase({ frase: 'Está tudo certo com este imóvel, pode seguir com a proposta normalmente.' }, mudanca('atencao', true)).ok).toBe(false);
    expect(conferirFrase({ frase: 'Apareceu um embargo neste imóvel: abra o resultado e veja as saídas antes de seguir com o crédito.' }, mudanca('impedimento', true)).ok).toBe(true);
  });

  it('o e-mail leva a frase de cada imóvel', () => {
    const m = mensagemAvisosCarteira('Ana Lima', 'ana@exemplo.com', [{ codCar: 'MT-1', alteracoes: mudanca('impedimento', true), frase: 'Frase de teste do imóvel.' }], 'https://x/carteira');
    expect(m.texto).toContain('Frase de teste do imóvel.');
  });
});

describe('análise de norma nova (painel)', () => {
  const { app, ctx, email, respostas } = montar();
  const NORMA = `RESOLUÇÃO CMN Nº 5.400, DE 10 DE MARÇO DE 2027. Altera o Manual de Crédito Rural, capítulo 2, seção 9. ${'Art. 1º O item 2-9-17 passa a vigorar com a seguinte redação: a verificação de supressão de vegetação nativa após 31 de julho de 2019 aplica-se também aos imóveis de até 4 módulos fiscais a partir de 3 de janeiro de 2028. '.repeat(2)}`;

  it('só o administrador; sem IA, explica que precisa dela', async () => {
    const cliente = await conta(app, email, 'cliente-norma@exemplo.com');
    expect((await app.inject({ method: 'POST', url: '/v1/admin/ia/normas', headers: { cookie: cliente }, payload: { titulo: 'Res', texto: NORMA } })).statusCode).toBe(403);
    const admin = await conta(app, email, 'admin@exemplo.com');
    const r = await app.inject({ method: 'POST', url: '/v1/admin/ia/normas', headers: { cookie: admin }, payload: { titulo: 'Resolução CMN 5.400/2027', texto: NORMA } });
    expect(r.statusCode).toBe(503);
  });

  it('com IA: resume, aponta as regras afetadas (só ids que existem) e guarda', async () => {
    await ligarIA(ctx);
    const admin = String(
      [(await app.inject({ method: 'POST', url: '/v1/sessao', payload: { email: 'admin@exemplo.com', senha: 'senha-bem-longa' } })).headers['set-cookie']].flat()[0],
    ).split(';')[0]!;
    respostas.analise_norma = () => ({
      resumo: 'A resolução altera o item 2-9-17 do Manual de Crédito Rural sobre a supressão de vegetação nativa depois de 31 de julho de 2019.',
      vigencia: '3 de janeiro de 2028',
      sem_relacao: false,
      mudancas: [{ o_que_mudou: 'A verificação passa a valer para imóveis de até 4 módulos fiscais.', regras: ['prodes'], o_que_conferir: 'A data de início para os imóveis pequenos.' }],
    });
    const r = await app.inject({ method: 'POST', url: '/v1/admin/ia/normas', headers: { cookie: admin }, payload: { titulo: 'Resolução CMN 5.400/2027', texto: NORMA } });
    expect(r.statusCode).toBe(201);
    expect(r.json().analise).toMatchObject({ titulo: 'Resolução CMN 5.400/2027', semRelacao: false, mudancas: [{ regras: ['prodes'] }] });
    const lista = (await app.inject({ method: 'GET', url: '/v1/admin/ia/normas', headers: { cookie: admin } })).json();
    expect(lista.analises).toHaveLength(1);

    respostas.analise_norma = () => ({ resumo: 'Resumo da resolução com um prazo de 90 dias que não está no texto da norma.', vigencia: null, sem_relacao: false, mudancas: [] });
    const inventada = await app.inject({ method: 'POST', url: '/v1/admin/ia/normas', headers: { cookie: admin }, payload: { titulo: 'Outra', texto: NORMA } });
    expect(inventada.statusCode).toBe(503);
  });
});
