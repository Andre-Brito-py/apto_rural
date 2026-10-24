/**
 * Gera as imagens da marca a partir dos SVG (docs/marca.md):
 *   public/og.png                       imagem de compartilhamento (WhatsApp, LinkedIn, redes), 1200×630
 *   public/favicon.ico                  ícone da aba para navegadores antigos (16, 32 e 48 px)
 *   public/icones/*.png                 ícones de app (192, 512, maskable) e apple-touch-icon (180)
 *   public/marca/logo-curvas.svg        assinatura com o texto em curvas (para gráfica: não depende da fonte)
 *   public/marca/logo-fundo-escuro-curvas.svg
 *
 * O texto é convertido em curvas com a fonte Inter (opentype.js), e o SVG vira PNG com o resvg.
 * Rode de novo sempre que mudar o logotipo ou as cores:  npm run imagens -w @apto/web
 */
import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';

const aqui = dirname(fileURLToPath(import.meta.url));
const publico = resolve(aqui, '../public');
const exigir = createRequire(import.meta.url);

// Cores da marca (iguais às de estilo.css e docs/marca.md).
const MATA = '#14532d';
const MATA_FORTE = '#0f3f22';
const BROTO = '#4ade80';

const fonte = (peso) => {
  const arquivo = exigir.resolve(`@fontsource/inter/files/inter-latin-${peso}-normal.woff`);
  const b = readFileSync(arquivo);
  return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};
const INTER = { 500: fonte(500), 600: fonte(600), 700: fonte(700) };

/** Texto em curvas, com espaçamento entre letras em "em" (negativo aperta). Devolve o path e a largura. */
function texto(conteudo, { peso = 700, tamanho, x = 0, y = 0, espaco = 0, cor = '#fff' }) {
  const f = INTER[peso];
  const escala = tamanho / f.unitsPerEm;
  let cursor = x;
  const partes = [];
  // Letra por letra (sem as regras de combinação da fonte, que o opentype.js não suporta na Inter).
  // As letras acentuadas do português existem prontas na fonte.
  const glifos = [...conteudo].map((c) => f.charToGlyph(c));
  glifos.forEach((g, i) => {
    partes.push(g.getPath(cursor, y, tamanho).toPathData(2));
    const proximo = glifos[i + 1];
    const kerning = proximo ? f.getKerningValue(g, proximo) : 0;
    cursor += (g.advanceWidth + kerning) * escala + espaco * tamanho;
  });
  return { d: `<path fill="${cor}" d="${partes.join('')}"/>`, largura: cursor - x };
}

/** Quebra o texto em linhas que cabem na largura. */
function quebrar(conteudo, { peso, tamanho, espaco, largura }) {
  const palavras = conteudo.split(' ');
  const linhas = [];
  let atual = '';
  for (const p of palavras) {
    const tentativa = atual ? `${atual} ${p}` : p;
    if (atual && texto(tentativa, { peso, tamanho, espaco }).largura > largura) {
      linhas.push(atual);
      atual = p;
    } else atual = tentativa;
  }
  if (atual) linhas.push(atual);
  return linhas;
}

/** O símbolo (A + check) em um quadrado de lado `lado`, na posição x, y. */
function simbolo(x, y, lado, { fundo = MATA, opacidadeFundo = 1 } = {}) {
  const s = lado / 64;
  return `<g transform="translate(${x} ${y}) scale(${s})">
    <rect width="64" height="64" rx="15" fill="${fundo}" fill-opacity="${opacidadeFundo}"/>
    <path d="M14 48 32 14.5 50 48" fill="none" stroke="#fff" stroke-width="6.2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="m22.5 36.5 6.5 6.5 13.5-13.5" fill="none" stroke="${BROTO}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`;
}

/** Nome "Apto Rural" em curvas: "Apto" forte, "Rural" regular. */
function nome(x, yBase, tamanho, cor) {
  const apto = texto('Apto', { peso: 700, tamanho, x, y: yBase, espaco: -0.02, cor });
  const rural = texto('Rural', { peso: 500, tamanho, x: x + apto.largura + tamanho * 0.26, y: yBase, espaco: -0.02, cor });
  return { svg: apto.d + rural.d, largura: apto.largura + tamanho * 0.26 + rural.largura };
}

function png(svg, largura, destino) {
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: largura }, background: 'rgba(0,0,0,0)' });
  const dados = r.render().asPng();
  writeFileSync(destino, dados);
  return dados;
}

// ---------- Assinaturas em curvas (para gráfica) ----------
for (const [arquivo, cor, fundo, opacidade] of [
  ['logo-curvas.svg', MATA_FORTE, MATA, 1],
  ['logo-fundo-escuro-curvas.svg', '#ffffff', '#ffffff', 0.1],
]) {
  const n = nome(82, 44, 34, cor);
  const largura = Math.ceil(82 + n.largura + 2);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${largura} 64" role="img" aria-label="Apto Rural">${simbolo(0, 0, 64, { fundo, opacidadeFundo: opacidade })}${n.svg}</svg>\n`;
  writeFileSync(resolve(publico, 'marca', arquivo), svg);
}

// ---------- Imagem de compartilhamento (1200×630) ----------
{
  const L = 1200;
  const A = 630;
  const margem = 80;
  const marca = nome(margem + 72 + 18, 117, 40, '#ffffff');
  const tamanhoTitulo = 66;
  const linhasTitulo = quebrar('Saiba se a fazenda passa no crédito rural antes do banco.', {
    peso: 700,
    tamanho: tamanhoTitulo,
    espaco: -0.03,
    largura: 760,
  });
  const titulo = linhasTitulo
    .map((l, i) => texto(l, { peso: 700, tamanho: tamanhoTitulo, x: margem, y: 250 + i * tamanhoTitulo * 1.1, espaco: -0.03 }).d)
    .join('');
  const yApoio = 250 + (linhasTitulo.length - 1) * tamanhoTitulo * 1.1 + 64;
  const apoio = quebrar('Impedimentos do MCR 2-9 conferidos nas bases oficiais, com o caminho de saída quando dá vermelho.', {
    peso: 500,
    tamanho: 27,
    espaco: -0.01,
    largura: 700,
  })
    .map((l, i) => texto(l, { peso: 500, tamanho: 27, x: margem, y: yApoio + i * 38, espaco: -0.01, cor: '#cfe3d4' }).d)
    .join('');

  // Selo "Do vermelho ao verde" com as três cores de situação, no rodapé da imagem.
  const ySelo = A - 84;
  const rotulo = texto('Do vermelho ao verde', { peso: 600, tamanho: 24, x: margem + 104, y: ySelo + 33, espaco: -0.01 });
  const selo = `<rect x="${margem}" y="${ySelo}" width="${rotulo.largura + 136}" height="50" rx="25" fill="#ffffff" fill-opacity="0.08" stroke="#ffffff" stroke-opacity="0.18"/>
    <circle cx="${margem + 30}" cy="${ySelo + 25}" r="8" fill="#ef4444"/><circle cx="${margem + 54}" cy="${ySelo + 25}" r="8" fill="#f59e0b"/><circle cx="${margem + 78}" cy="${ySelo + 25}" r="8" fill="${BROTO}"/>
    ${rotulo.d}`;
  // Sem endereço do site na imagem até o domínio estar registrado (docs/marca.md).
  const complemento = 'Para técnicos e projetistas de crédito rural';
  const largComplemento = texto(complemento, { peso: 500, tamanho: 22, espaco: -0.01 }).largura;
  const enderecoSvg = texto(complemento, { peso: 500, tamanho: 22, x: L - margem - largComplemento, y: ySelo + 32, espaco: -0.01, cor: '#9ec7aa' }).d;

  // Símbolo grande e apagado à direita, como marca d'água.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${A}" viewBox="0 0 ${L} ${A}">
  <defs>
    <linearGradient id="fundo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${MATA}"/><stop offset="1" stop-color="#0b2e19"/></linearGradient>
    <radialGradient id="brilho" cx="0.82" cy="0.3" r="0.55"><stop offset="0" stop-color="${BROTO}" stop-opacity="0.28"/><stop offset="1" stop-color="${BROTO}" stop-opacity="0"/></radialGradient>
    <pattern id="pontos" width="26" height="26" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.4" fill="#ffffff" fill-opacity="0.07"/></pattern>
  </defs>
  <rect width="${L}" height="${A}" fill="url(#fundo)"/>
  <rect width="${L}" height="${A}" fill="url(#pontos)"/>
  <rect width="${L}" height="${A}" fill="url(#brilho)"/>
  <g opacity="0.16" transform="translate(900 150) scale(5.2)">
    <path d="M14 48 32 14.5 50 48" fill="none" stroke="#fff" stroke-width="6.2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="m22.5 36.5 6.5 6.5 13.5-13.5" fill="none" stroke="${BROTO}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  ${simbolo(margem, 66, 72, { fundo: '#ffffff', opacidadeFundo: 0.1 })}
  ${marca.svg}
  ${titulo}
  ${apoio}
  ${selo}
  ${enderecoSvg}
</svg>`;
  png(svg, L, resolve(publico, 'og.png'));
}

// ---------- Ícones PNG ----------
mkdirSync(resolve(publico, 'icones'), { recursive: true });
const icone = readFileSync(resolve(publico, 'icone.svg'), 'utf8');
const iconeApp = readFileSync(resolve(publico, 'marca/icone-app.svg'), 'utf8');
png(icone, 192, resolve(publico, 'icones/icone-192.png'));
png(icone, 512, resolve(publico, 'icones/icone-512.png'));
png(iconeApp, 192, resolve(publico, 'icones/icone-maskable-192.png'));
png(iconeApp, 512, resolve(publico, 'icones/icone-maskable-512.png'));
// iPhone/iPad: fundo até a borda (o sistema arredonda os cantos sozinho).
png(iconeApp, 180, resolve(publico, 'icones/apple-touch-icon.png'));

// favicon.ico com PNGs de 16, 32 e 48 px dentro (formato aceito por todos os navegadores atuais).
{
  const tamanhos = [16, 32, 48];
  const imagens = tamanhos.map((t) => new Resvg(icone, { fitTo: { mode: 'width', value: t } }).render().asPng());
  const cabecalho = Buffer.alloc(6 + 16 * imagens.length);
  cabecalho.writeUInt16LE(0, 0); // reservado
  cabecalho.writeUInt16LE(1, 2); // tipo: ícone
  cabecalho.writeUInt16LE(imagens.length, 4);
  let deslocamento = cabecalho.length;
  imagens.forEach((img, i) => {
    const p = 6 + i * 16;
    cabecalho.writeUInt8(tamanhos[i], p);
    cabecalho.writeUInt8(tamanhos[i], p + 1);
    cabecalho.writeUInt8(0, p + 2); // paleta
    cabecalho.writeUInt8(0, p + 3); // reservado
    cabecalho.writeUInt16LE(1, p + 4); // planos
    cabecalho.writeUInt16LE(32, p + 6); // bits por pixel
    cabecalho.writeUInt32LE(img.length, p + 8);
    cabecalho.writeUInt32LE(deslocamento, p + 12);
    deslocamento += img.length;
  });
  writeFileSync(resolve(publico, 'favicon.ico'), Buffer.concat([cabecalho, ...imagens]));
}

console.log('Imagens geradas em apps/web/public: og.png, favicon.ico, icones/*.png e marca/*-curvas.svg');
