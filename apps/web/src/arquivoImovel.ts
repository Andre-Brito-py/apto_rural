import { normalizarCar } from '@apto/regras';
import { kml } from '@tmcw/togeojson';
import type { GeometriaImovel } from './api';

const LIMITE_BYTES = 5 * 1024 * 1024;
// O .zip do Sicar traz várias camadas (APP, reserva legal, vegetação…): pode ser bem maior que o contorno.
const LIMITE_ZIP_BYTES = 25 * 1024 * 1024;

interface GeoJsonQualquer {
  type: string;
  coordinates?: unknown;
  geometry?: GeoJsonQualquer | null;
  geometries?: GeoJsonQualquer[];
  features?: GeoJsonQualquer[];
  properties?: Record<string, unknown> | null;
  fileName?: string;
}

type Formato = 'KML' | 'GeoJSON' | 'Shapefile';

/** O contorno lido e de onde ele veio, para o técnico conferir antes de consultar. */
export interface ImovelLido {
  geometria: GeometriaImovel;
  /** Formato do arquivo: KML, GeoJSON ou shapefile. */
  formato: Formato;
  /** Camada usada, no shapefile com várias camadas (ex.: AREA_IMOVEL). */
  camada?: string;
  poligonos: number;
  /** Área aproximada em hectares (cálculo no navegador; a oficial é a do CAR). */
  areaHa: number;
}

/** Junta todos os polígonos do arquivo num MultiPolygon. */
function poligonos(g: GeoJsonQualquer | null | undefined): number[][][][] {
  if (!g) return [];
  switch (g.type) {
    case 'Polygon':
      return [g.coordinates as number[][][]];
    case 'MultiPolygon':
      return g.coordinates as number[][][][];
    case 'Feature':
      return poligonos(g.geometry);
    case 'FeatureCollection':
      return (g.features ?? []).flatMap(poligonos);
    case 'GeometryCollection':
      return (g.geometries ?? []).flatMap(poligonos);
    default:
      return [];
  }
}

/**
 * Área aproximada de um anel em m², numa esfera do tamanho da Terra (fórmula de
 * Chamberlain e Duquette, a mesma ideia das bibliotecas de mapa). Usa o raio "autálico"
 * do elipsoide GRS 80 (o do SIRGAS 2000): a esfera com a mesma área total da Terra.
 * Erro bem abaixo de 1% para imóveis rurais: serve para conferir se o arquivo é o imóvel certo.
 */
function areaAnel(anel: number[][]): number {
  const R = 6_371_007.2;
  const rad = Math.PI / 180;
  let soma = 0;
  for (let i = 0; i < anel.length - 1; i++) {
    const [x1, y1] = anel[i]!;
    const [x2, y2] = anel[i + 1]!;
    soma += (x2! - x1!) * rad * (2 + Math.sin(y1! * rad) + Math.sin(y2! * rad));
  }
  return Math.abs((soma * R * R) / 2);
}

const areaHa = (lista: number[][][][]) =>
  lista.reduce((t, p) => t + Math.max(0, areaAnel(p[0] ?? []) - p.slice(1).reduce((b, buraco) => b + areaAnel(buraco), 0)), 0) / 10_000;

/** Coordenadas que não são longitude/latitude (ex.: UTM em metros) indicam projeção que não foi convertida. */
function pareceGeografico(lista: number[][][][]): boolean {
  return lista.every((p) => p.every((anel) => anel.every(([x, y]) => Math.abs(x!) <= 180 && Math.abs(y!) <= 90)));
}

const ERRO_UTM =
  'As coordenadas do arquivo não estão em latitude e longitude (parecem estar em UTM). No shapefile, inclua o arquivo .prj no .zip para a conversão ser feita.';

const comoGeometria = (lista: number[][][][]): GeometriaImovel =>
  lista.length === 1 ? { type: 'Polygon', coordinates: lista[0]! } : { type: 'MultiPolygon', coordinates: lista };

/**
 * Escolhe, entre as camadas do shapefile, a do contorno do imóvel. O .zip baixado do Sicar
 * traz o perímetro na camada AREA_IMOVEL, junto com APP, reserva legal, vegetação nativa etc.
 */
function escolherCamada(camadas: GeoJsonQualquer[]): { camada: GeoJsonQualquer; nome?: string } {
  const comPoligono = camadas.filter((c) => poligonos(c).length > 0);
  if (comPoligono.length === 0) throw new Error('O shapefile não tem nenhum polígono.');
  if (comPoligono.length === 1) return { camada: comPoligono[0]!, nome: comPoligono[0]!.fileName };
  const nomeDe = (c: GeoJsonQualquer) => (c.fileName ?? '').split('/').pop() ?? '';
  const imovel =
    comPoligono.find((c) => /area[_ ]?imovel/i.test(nomeDe(c))) ??
    comPoligono.find((c) => /imovel|perimetro/i.test(nomeDe(c)));
  if (imovel) return { camada: imovel, nome: imovel.fileName };
  const nomes = comPoligono.map(nomeDe).filter(Boolean).join(', ');
  throw new Error(
    `O shapefile tem várias camadas (${nomes}) e nenhuma se chama AREA_IMOVEL. Envie um .zip só com a camada do contorno do imóvel.`,
  );
}

async function lerShapefile(arquivo: File): Promise<{ dados: GeoJsonQualquer; camada?: string }> {
  // Carregada só quando alguém escolhe um .zip: o site continua leve no 3G.
  const { default: shp } = await import('shpjs');
  let resultado;
  try {
    resultado = await shp(await arquivo.arrayBuffer());
  } catch {
    throw new Error('Não foi possível ler o shapefile. Confira se o .zip tem os arquivos .shp, .shx, .dbf e .prj do imóvel.');
  }
  const camadas = (Array.isArray(resultado) ? resultado : [resultado]) as GeoJsonQualquer[];
  const { camada, nome } = escolherCamada(camadas);
  return { dados: camada, camada: nome?.split('/').pop() };
}

/** Abre o arquivo e devolve o GeoJSON, ainda sem juntar os polígonos. */
async function lerDados(arquivo: File): Promise<{ dados: GeoJsonQualquer; formato: Formato; camada?: string }> {
  const nome = arquivo.name.toLowerCase();
  const ehZip = nome.endsWith('.zip');
  if (arquivo.size > (ehZip ? LIMITE_ZIP_BYTES : LIMITE_BYTES)) throw new Error(`Arquivo maior que ${ehZip ? 25 : 5} MB.`);

  if (ehZip) return { ...(await lerShapefile(arquivo)), formato: 'Shapefile' };
  if (nome.endsWith('.shp')) throw new Error('Envie o shapefile compactado em .zip, com os arquivos .shp, .shx, .dbf e .prj juntos.');
  if (nome.endsWith('.kml')) {
    const dom = new DOMParser().parseFromString(await arquivo.text(), 'text/xml');
    if (dom.querySelector('parsererror')) throw new Error('Não foi possível ler o KML.');
    return { dados: kml(dom) as unknown as GeoJsonQualquer, formato: 'KML' };
  }
  if (nome.endsWith('.geojson') || nome.endsWith('.json')) {
    try {
      // Programas do Windows costumam pôr a marca de UTF-8 (BOM) no começo do arquivo.
      return { dados: JSON.parse((await arquivo.text()).replace(/^﻿/, '')), formato: 'GeoJSON' };
    } catch {
      throw new Error('Não foi possível ler o GeoJSON.');
    }
  }
  throw new Error('Use um arquivo .zip (shapefile), .kml ou .geojson.');
}

/** Lê o contorno do imóvel de um arquivo KML, GeoJSON ou shapefile (.zip) exportado do CAR. */
export async function lerArquivoImovel(arquivo: File): Promise<ImovelLido> {
  const { dados, formato, camada } = await lerDados(arquivo);
  const lista = poligonos(dados);
  if (lista.length === 0) throw new Error('O arquivo não tem nenhum polígono do imóvel.');
  if (!pareceGeografico(lista)) throw new Error(ERRO_UTM);
  return { geometria: comoGeometria(lista), formato, camada, poligonos: lista.length, areaHa: areaHa(lista) };
}

// Código do CAR dentro de um texto qualquer (nome de arquivo, atributo): UF, município e 32 letras/números,
// com ou sem hífens e pontos.
const PADRAO_CAR = /([A-Z]{2})[-_ ]?(\d{7})[-_ ]?((?:[0-9A-F]{4}\.?){7}[0-9A-F]{4})/g;

/** Todos os códigos de CAR válidos que aparecem num texto. */
export function carsNoTexto(texto: string): string[] {
  const achados = new Set<string>();
  for (const m of texto.toUpperCase().matchAll(PADRAO_CAR)) {
    const car = normalizarCar(`${m[1]}-${m[2]}-${m[3]}`);
    if (car) achados.add(car);
  }
  return [...achados];
}

/** Contornos de um arquivo da consulta em lote, cada um com o CAR a que pertence. */
export interface ContornosDoArquivo {
  nome: string;
  /** CAR → contorno. Um arquivo pode trazer um imóvel (Sicar) ou vários (camada do escritório). */
  porCar: Map<string, GeometriaImovel>;
  /** Mensagem quando o arquivo não pôde ser usado. */
  erro?: string;
}

/**
 * Para a consulta em lote: lê o arquivo e descobre de qual CAR é cada contorno.
 * Cada feição com o código do CAR na tabela de atributos (como o COD_IMOVEL do Sicar)
 * vira o contorno daquele CAR. Se as feições não trazem o código, vale o CAR do nome do arquivo.
 */
export async function contornosDoArquivo(arquivo: File): Promise<ContornosDoArquivo> {
  const porCar = new Map<string, GeometriaImovel>();
  try {
    const { dados } = await lerDados(arquivo);
    const feicoes = dados.type === 'FeatureCollection' ? (dados.features ?? []) : [dados];
    const juntar = new Map<string, number[][][][]>();
    const semCodigo: number[][][][] = [];
    for (const f of feicoes) {
      const lista = poligonos(f);
      if (lista.length === 0) continue;
      const valores = Object.values(f.properties ?? {}).filter((v) => typeof v === 'string').join(' ');
      const [car] = carsNoTexto(valores);
      if (car) juntar.set(car, [...(juntar.get(car) ?? []), ...lista]);
      else semCodigo.push(...lista);
    }
    if (semCodigo.length > 0) {
      const doNome = carsNoTexto(arquivo.name);
      if (doNome.length === 1) juntar.set(doNome[0]!, [...(juntar.get(doNome[0]!) ?? []), ...semCodigo]);
      else if (juntar.size === 0) {
        return { nome: arquivo.name, porCar, erro: 'Não achamos o código do CAR no nome do arquivo nem na tabela de atributos.' };
      }
    }
    if (juntar.size === 0) return { nome: arquivo.name, porCar, erro: 'O arquivo não tem nenhum polígono.' };
    for (const [car, lista] of juntar) {
      if (!pareceGeografico(lista)) return { nome: arquivo.name, porCar: new Map(), erro: ERRO_UTM };
      porCar.set(car, comoGeometria(lista));
    }
    return { nome: arquivo.name, porCar };
  } catch (e) {
    return { nome: arquivo.name, porCar, erro: (e as Error).message };
  }
}
