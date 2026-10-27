import { expect, test } from '@playwright/test';
import { criarContaConfirmada, emailNovo, vigiarErros } from './apoio';

/** PDF de uma página com as linhas de texto dadas (o bastante para o pdf.js ler o texto). */
function pdfComTexto(linhas: string[]): Buffer {
  const escapar = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const conteudo = `BT /F1 11 Tf 50 780 Td 14 TL ${linhas.map((l) => `(${escapar(l)}) '`).join(' ')} ET`;
  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    `<< /Length ${Buffer.byteLength(conteudo, 'latin1')} >>\nstream\n${conteudo}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const posicoes: number[] = [];
  objetos.forEach((o, i) => {
    posicoes.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n${posicoes.map((p) => `${String(p).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

test('sem IA: o recibo do CAR preenche a consulta e o dossiê dá o rascunho de modelo', async ({ page }) => {
  const erros = vigiarErros(page);
  await criarContaConfirmada(page, emailNovo('apoio'));
  const saude = await (await page.request.get('/v1/saude')).json();
  const car: string = saude.demo.embargoEProdes;

  await page.goto('/consultar');
  const recibo = pdfComTexto([
    'Recibo de Inscricao do Imovel Rural no CAR',
    `Registro no CAR: ${car}`,
    'Situacao do cadastro: Ativo',
    'Modulos fiscais: 4,2',
    'Data de inscricao: 12/03/2019',
  ]);
  await page.locator('.recibo-car input[type=file]').setInputFiles({ name: 'recibo.pdf', mimeType: 'application/pdf', buffer: recibo });
  await expect(page.getByText(/preenchemos: código do CAR, situação, módulos fiscais/)).toBeVisible();
  await expect(page.locator('.entrada-car')).toHaveValue(car);
  await expect(page.getByRole('radio', { name: 'Ativo' })).toBeChecked();
  await expect(page.getByLabel('Módulos fiscais do imóvel')).toHaveValue('4,2');

  await page.getByRole('button', { name: 'Consultar imóvel' }).click();
  await expect(page).toHaveURL(/\/consulta\/[0-9a-f-]{36}$/);
  await page.getByRole('link', { name: /dossiê do imóvel/i }).click();

  // Sem chave da OpenAI: conferência de documentos indisponível, rascunho pelo modelo fixo.
  const apoio = page.locator('.apoio').first();
  await expect(apoio.getByText(/Indisponível agora/)).toBeVisible();
  await apoio.getByRole('button', { name: /carta ao banco/i }).click();
  const rascunho = apoio.locator('.apoio-cartao').first();
  await expect(rascunho.getByText('modelo fixo')).toBeVisible();
  await expect(rascunho.locator('textarea')).toHaveValue(/\[/);
  await rascunho.getByRole('button', { name: 'Apagar' }).click();
  await expect(apoio.locator('.apoio-cartao')).toHaveCount(0);
  expect(erros).toEqual([]);
});
