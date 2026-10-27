/**
 * Lê um documento no próprio navegador antes de mandar para a IA (docs/ia.md): de um PDF
 * digital sai só o texto; de um PDF escaneado ou de uma foto saem imagens reduzidas das
 * primeiras páginas. O arquivo em si nunca vai para o servidor.
 */
export interface DocumentoLido {
  nome: string;
  texto?: string;
  imagens?: string[];
  paginas: number;
}

const TAMANHO_MAXIMO = 25 * 1024 * 1024;
const MAXIMO_PAGINAS_TEXTO = 40;
const MAXIMO_PAGINAS_IMAGEM = 4;
/** Lado maior da imagem: legível para a IA e leve para enviar pelo celular. */
const LADO_MAXIMO = 1600;
/** Abaixo disso, o PDF é tratado como escaneado (só imagem, sem texto). */
const TEXTO_MINIMO = 200;

export class ErroLeitura extends Error {}

async function pdfjs() {
  // Carrega só quando precisa: a biblioteca é grande e a maioria das telas não usa.
  const [lib, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
  lib.GlobalWorkerOptions.workerSrc = worker.default;
  return lib;
}

function canvasParaJpeg(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/jpeg', 0.82);
}

async function imagemReduzida(arquivo: File): Promise<string> {
  const bitmap = await createImageBitmap(arquivo).catch(() => {
    throw new ErroLeitura('Não deu para abrir esta imagem. Use JPG ou PNG.');
  });
  const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvasParaJpeg(canvas);
}

/**
 * comImagens: false no recibo do CAR (só PDF digital, que vai sem dado pessoal);
 * true nos documentos do dossiê (escaneado ou foto vira imagem).
 */
export async function lerDocumento(arquivo: File, { comImagens }: { comImagens: boolean }): Promise<DocumentoLido> {
  if (arquivo.size > TAMANHO_MAXIMO) throw new ErroLeitura('Arquivo grande demais (máximo 25 MB).');
  const nome = arquivo.name;
  if (/^image\/(jpeg|png|webp)$/.test(arquivo.type)) {
    if (!comImagens) throw new ErroLeitura('Use o PDF baixado do Sicar (não uma foto).');
    return { nome, imagens: [await imagemReduzida(arquivo)], paginas: 1 };
  }
  if (arquivo.type !== 'application/pdf' && !/\.pdf$/i.test(nome)) throw new ErroLeitura('Use um arquivo PDF, JPG ou PNG.');

  const lib = await pdfjs();
  const pdf = await lib
    .getDocument({
      data: new Uint8Array(await arquivo.arrayBuffer()),
      isEvalSupported: false,
    })
    .promise.catch(() => {
      throw new ErroLeitura('Não deu para abrir este PDF. Ele pode estar protegido por senha ou corrompido.');
    });
  const partes: string[] = [];
  for (let n = 1; n <= Math.min(pdf.numPages, MAXIMO_PAGINAS_TEXTO); n++) {
    const pagina = await pdf.getPage(n);
    const conteudo = await pagina.getTextContent();
    partes.push(conteudo.items.map((i) => ('str' in i ? `${i.str}${i.hasEOL ? '\n' : ' '}` : '')).join(''));
  }
  const texto = partes
    .join('\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
  if (texto.length >= TEXTO_MINIMO || !comImagens) return { nome, texto, paginas: pdf.numPages };

  // PDF escaneado: as primeiras páginas viram imagens.
  const imagens: string[] = [];
  for (let n = 1; n <= Math.min(pdf.numPages, MAXIMO_PAGINAS_IMAGEM); n++) {
    const pagina = await pdf.getPage(n);
    const base = pagina.getViewport({ scale: 1 });
    const viewport = pagina.getViewport({
      scale: Math.min(2, LADO_MAXIMO / Math.max(base.width, base.height)),
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await pagina.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
    imagens.push(canvasParaJpeg(canvas));
  }
  return { nome, imagens, paginas: pdf.numPages };
}
