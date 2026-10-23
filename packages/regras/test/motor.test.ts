import { describe, expect, it } from 'vitest';
import {
  avaliar,
  compararResultados,
  criterioAreaEmbargo,
  formatarCar,
  inicioExigenciaProdes,
  normalizarCar,
  type Evidencias,
} from '../src/index.js';

const CAR = 'MT-5107925-0123456789ABCDEF0123456789ABCDEF';

function limpo(extra: Partial<Evidencias> = {}, imovel: Partial<Evidencias['imovel']> = {}): Evidencias {
  return {
    imovel: { car: CAR, areaHa: 1000, modulosFiscais: 10, situacaoCar: 'ativo', ...imovel },
    trabalhoEscravo: { consta: false },
    unidadesConservacao: [],
    terrasIndigenas: [],
    quilombolas: [],
    embargos: [],
    florestasTipoB: [],
    listaMma: { consta: false },
    atualizacoes: {},
    ...extra,
  };
}

const item = (ev: Evidencias, id: string, data = '2026-10-23') =>
  avaliar(ev, data).itens.find((i) => i.regraId === id)!;

describe('veredito', () => {
  it('tudo limpo dá sem impedimento', () => {
    expect(avaliar(limpo(), '2026-10-23').veredito).toBe('sem_impedimento');
  });

  it('base não consultada nunca vira verde', () => {
    const r = avaliar(limpo({ embargos: null }), '2026-10-23');
    expect(r.veredito).toBe('incompleto');
    expect(r.itens.find((i) => i.regraId === 'embargo')!.status).toBe('nao_verificado');
  });

  it('um impedimento domina o veredito', () => {
    expect(avaliar(limpo({}, { situacaoCar: 'suspenso' }), '2026-10-23').veredito).toBe('impedimento');
  });
});

describe('MCR 2-9-3 — CAR', () => {
  it('cancelado ou suspenso impede', () => {
    expect(item(limpo({}, { situacaoCar: 'cancelado' }), 'car').status).toBe('impedimento');
  });
  it('pendente não impede, mas avisa sobre o item 12', () => {
    const r = item(limpo({}, { situacaoCar: 'pendente' }), 'car');
    expect(r.status).toBe('sem_impedimento');
    expect(r.detalhes.join(' ')).toContain('item 12');
  });
  it('sem situação informada fica não verificado', () => {
    expect(item(limpo({}, { situacaoCar: undefined }), 'car').status).toBe('nao_verificado');
  });
});

describe('MCR 2-9-7 — terras indígenas', () => {
  it('fase homologada impede', () => {
    const ev = limpo({ terrasIndigenas: [{ nome: 'TI X', fase: 'Homologada', areaHa: 12 }] });
    expect(item(ev, 'terra-indigena').status).toBe('impedimento');
  });
  it('fase em estudo não é impedimento do item 7', () => {
    const ev = limpo({ terrasIndigenas: [{ nome: 'TI Y', fase: 'Em estudo', areaHa: 12 }] });
    expect(item(ev, 'terra-indigena').status).toBe('atencao');
  });
  it('sobreposição de borda vira atenção com dossiê de contestação', () => {
    const ev = limpo({ terrasIndigenas: [{ nome: 'TI X', fase: 'Regularizada', areaHa: 0.03 }] });
    const r = item(ev, 'terra-indigena');
    expect(r.status).toBe('atencao');
    expect(r.dossie).toBe('contestacao');
  });
});

describe('MCR 2-9-7 — fases e modalidade da Funai', () => {
  it('"Encaminhada RI" conta como homologada', () => {
    const ev = limpo({ terrasIndigenas: [{ nome: 'TI', fase: 'Encaminhada RI', areaHa: 5 }] });
    expect(item(ev, 'terra-indigena').status).toBe('impedimento');
  });
  it('modalidade Reserva Indígena impede mesmo com outra fase', () => {
    const ev = limpo({ terrasIndigenas: [{ nome: 'RI', fase: 'Declarada', modalidade: 'Reserva Indígena', areaHa: 5 }] });
    expect(item(ev, 'terra-indigena').status).toBe('impedimento');
  });
  it('fase Declarada sem ser reserva não é impedimento do item 7', () => {
    const ev = limpo({ terrasIndigenas: [{ nome: 'TI', fase: 'Declarada', modalidade: 'Tradicionalmente ocupada', areaHa: 5 }] });
    expect(item(ev, 'terra-indigena').status).toBe('atencao');
  });
});

describe('MCR 2-9-5 — Unidades de Conservação', () => {
  it('Proteção Integral impede', () => {
    const ev = limpo({ unidadesConservacao: [{ nome: 'Parque', categoria: 'Parque Nacional', grupo: 'Proteção Integral', areaHa: 40 }] });
    expect(item(ev, 'unidade-conservacao').status).toBe('impedimento');
  });
  it('Uso Sustentável (APA) pede conformidade com o Plano de Manejo', () => {
    const ev = limpo({ unidadesConservacao: [{ nome: 'APA', categoria: 'Área de Proteção Ambiental', grupo: 'Uso Sustentável', areaHa: 400 }] });
    const r = item(ev, 'unidade-conservacao');
    expect(r.status).toBe('atencao');
    expect(r.caminhos[0]!.norma!.item).toBe('MCR 2-9-5');
  });
});

describe('MCR 2-9-10 a 12 — embargos', () => {
  it('embargo impede e oferece a exceção do item 12 até 30/6/2027', () => {
    const ev = limpo({ embargos: [{ numero: 'ABC123', areaHa: 30 }] });
    const r = item(ev, 'embargo', '2027-06-30');
    expect(r.status).toBe('impedimento');
    expect(r.caminhos.some((c) => c.norma?.item === 'MCR 2-9-12')).toBe(true);
  });
  it('polígono embargado do vizinho encostando na divisa é atenção, não impedimento', () => {
    const ev = limpo({ embargos: [{ numero: '332318/C', areaHa: 0.01 }] });
    const r = item(ev, 'embargo');
    expect(r.status).toBe('atencao');
    expect(r.dossie).toBe('contestacao');
  });
  it('embargo sem área conhecida (ponto do termo) continua impedimento', () => {
    const ev = limpo({ embargos: [{ numero: 'X' }] });
    expect(item(ev, 'embargo').status).toBe('impedimento');
  });
  it('depois de 30/6/2027 a exceção do item 12 some', () => {
    const ev = limpo({ embargos: [{ numero: 'ABC123', areaHa: 30 }] });
    const r = item(ev, 'embargo', '2027-07-01');
    expect(r.caminhos.some((c) => c.norma?.item === 'MCR 2-9-12')).toBe(false);
  });
  it('limite de 5% para embargo antigo', () => {
    const ev = limpo({ embargos: [{ numero: 'A', areaHa: 30, dataEmbargo: '2024-05-10' }] });
    expect(criterioAreaEmbargo(ev).atende).toBe(true); // 30 <= 50
  });
  it('limite de 20 ha para embargo desde 2/1/2025', () => {
    const ev = limpo({ embargos: [{ numero: 'A', areaHa: 30, dataEmbargo: '2025-01-02' }] });
    expect(criterioAreaEmbargo(ev).atende).toBe(false); // min(50, 20) = 20
  });
  it('sem data, aplica o limite mais restritivo', () => {
    const ev = limpo({ embargos: [{ numero: 'A', areaHa: 30 }] });
    expect(criterioAreaEmbargo(ev).atende).toBe(false);
  });
  it('sem área conhecida não afirma nada', () => {
    const ev = limpo({ embargos: [{ numero: 'A' }] });
    expect(criterioAreaEmbargo(ev).atende).toBeNull();
  });
});

describe('MCR 2-9-17 — cronograma da Resolução CMN 5.303/2026', () => {
  it.each([
    [16, '2027-01-04'],
    [15, '2027-07-01'],
    [4.5, '2027-07-01'],
    [4, '2028-01-03'],
  ])('%s módulos fiscais começam em %s', (mf, data) => {
    expect(inicioExigenciaProdes(limpo({}, { modulosFiscais: mf }))).toBe(data);
  });
  it('perímetro coletivo segue 3/1/2028 (item 17-A)', () => {
    expect(inicioExigenciaProdes(limpo({}, { modulosFiscais: 100, usoColetivo: true }))).toBe('2028-01-03');
  });
  it('na lista antes do prazo é atenção; depois, impedimento', () => {
    const ev = limpo({ listaMma: { consta: true, areaSupressaoHa: 8 } }, { modulosFiscais: 20 });
    expect(item(ev, 'prodes', '2027-01-03').status).toBe('atencao');
    expect(item(ev, 'prodes', '2027-01-04').status).toBe('impedimento');
  });
  it('na lista só pela situação do CAR, abaixo do critério, não aplica o item 17', () => {
    const ev = limpo({ listaMma: { consta: true, acimaDoCriterio: false, areaSupressaoHa: 1 } }, { modulosFiscais: 20 });
    expect(item(ev, 'prodes', '2027-02-01').status).toBe('sem_impedimento');
  });
  it('lista do MMA sempre leva o aviso de não presunção de ilegalidade', () => {
    const ev = limpo({ listaMma: { consta: true } }, { modulosFiscais: 20 });
    expect(item(ev, 'prodes').detalhes.join(' ')).toContain('presunção de ilegalidade');
  });
});

describe('comparação para a carteira', () => {
  it('embargo novo aparece como piora', () => {
    const antes = avaliar(limpo(), '2026-10-23');
    const depois = avaliar(limpo({ embargos: [{ numero: 'N1', areaHa: 30 }] }), '2026-10-24');
    const alt = compararResultados(antes, depois);
    expect(alt).toHaveLength(1);
    expect(alt[0]).toMatchObject({ regraId: 'embargo', de: 'sem_impedimento', para: 'impedimento', piorou: true });
  });
  it('mudança de data do Prodes (atenção → impedimento) é detectada', () => {
    const ev = limpo({ listaMma: { consta: true, acimaDoCriterio: true } }, { modulosFiscais: 20 });
    const alt = compararResultados(avaliar(ev, '2027-01-03'), avaliar(ev, '2027-01-04'));
    expect(alt.map((a) => [a.regraId, a.para])).toEqual([['prodes', 'impedimento']]);
  });
  it('melhora também é informada, depois das pioras', () => {
    const antes = avaliar(limpo({ embargos: [{ numero: 'N1', areaHa: 30 }] }, { situacaoCar: 'ativo' }), '2026-10-23');
    const depois = avaliar(limpo({}, { situacaoCar: 'suspenso' }), '2026-10-24');
    const alt = compararResultados(antes, depois);
    expect(alt.map((a) => [a.regraId, a.piorou])).toEqual([
      ['car', true],
      ['embargo', false],
    ]);
  });
  it('base que deixou de ser consultada não gera aviso', () => {
    const alt = compararResultados(avaliar(limpo(), '2026-10-23'), avaliar(limpo({ embargos: null }), '2026-10-24'));
    expect(alt).toEqual([]);
  });
});

describe('código do CAR', () => {
  it('aceita o formato do recibo com pontos', () => {
    const comPontos = 'mt-5107925-0123.4567.89AB.CDEF.0123.4567.89AB.CDEF';
    expect(normalizarCar(comPontos)).toBe(CAR);
    expect(formatarCar(CAR)).toBe('MT-5107925-0123.4567.89AB.CDEF.0123.4567.89AB.CDEF');
  });
  it('recusa UF inexistente', () => {
    expect(normalizarCar('XX-5107925-0123456789ABCDEF0123456789ABCDEF')).toBeNull();
  });
});
