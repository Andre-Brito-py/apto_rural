import { describe, expect, it } from 'vitest';
import { carsNoTexto } from '../src/arquivoImovel';
import { lerPlanilha, montarCsv, textoDaPlanilha } from '../src/planilhaLote';

const CAR_A = 'MT-5104906-FAB083D0E06E4C88BD6B872BC5258FD2';
const CAR_B = 'PA-1500602-672A742624D74E3C88DD96D3451790D7';

describe('planilha da consulta em lote', () => {
  it('lê o CSV do Excel em português (ponto e vírgula, vírgula decimal, nomes livres no cabeçalho)', () => {
    const r = lerPlanilha(
      '﻿Código do CAR;Nome da fazenda;Situação;Módulos fiscais\r\n' +
        `${CAR_A};Fazenda São João;Ativo;19,75\r\n` +
        `pa-1500602-672a.7426.24d7.4e3c.88dd.96d3.4517.90d7;"Sítio ""Boa Vista""";pendente;4.5\r\n`,
    );
    expect(r.problemas).toEqual([]);
    expect(r.linhas).toEqual([
      { linha: 2, car: CAR_A, apelido: 'Fazenda São João', situacaoCar: 'ativo', modulosFiscais: 19.75 },
      { linha: 3, car: CAR_B, apelido: 'Sítio "Boa Vista"', situacaoCar: 'pendente', modulosFiscais: 4.5 },
    ]);
  });

  it('aceita só uma coluna de códigos, sem cabeçalho, separada por vírgula', () => {
    const r = lerPlanilha(`${CAR_A},\n${CAR_B},\n`);
    expect(r.linhas.map((l) => l.car)).toEqual([CAR_A, CAR_B]);
  });

  it('aponta código inválido, repetido e dados que não reconhece, sem parar a leitura', () => {
    const r = lerPlanilha(`car;situacao;mf\n${CAR_A};ativo;8\nMT-123;ativo;8\n${CAR_A};ativo;8\n${CAR_B};talvez;abc\n`);
    expect(r.linhas.map((l) => l.car)).toEqual([CAR_A, CAR_B]);
    expect(r.linhas[1]).toEqual({ linha: 5, car: CAR_B });
    expect(r.problemas.map((p) => p.linha)).toEqual([3, 4, 5, 5]);
  });

  it('lê acentos de CSV salvo em Windows-1252 (o "ANSI" do Excel)', async () => {
    // "São" em Windows-1252: S, 0xE3, o.
    const bytes = new Uint8Array([...new TextEncoder().encode('car;apelido\n' + CAR_A + ';S'), 0xe3, 0x6f, 0x0a]);
    const texto = await textoDaPlanilha(new File([bytes], 'lote.csv'));
    expect(lerPlanilha(texto).linhas[0]!.apelido).toBe('São');
  });

  it('monta o CSV do resultado para o Excel em português (marca de UTF-8, ponto e vírgula, aspas)', async () => {
    const bytes = new Uint8Array(await montarCsv([['CAR', 'Apelido'], [CAR_A, 'Sítio "A"; lote 2']]).arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes)).toBe(`CAR;Apelido\r\n${CAR_A};"Sítio ""A""; lote 2"`);
  });

  it('acha o código do CAR em nome de arquivo e em atributo do shapefile', () => {
    expect(carsNoTexto(`SHAPE_${CAR_A}.zip`)).toEqual([CAR_A]);
    expect(carsNoTexto('PA-1500602-672A.7426.24D7.4E3C.88DD.96D3.4517.90D7 área')).toEqual([CAR_B]);
    expect(carsNoTexto('imovel_sem_codigo.kml')).toEqual([]);
  });
});
