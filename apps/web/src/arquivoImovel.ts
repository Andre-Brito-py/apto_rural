import { kml } from '@tmcw/togeojson';
import type { GeometriaImovel } from './api';

const LIMITE_BYTES = 5 * 1024 * 1024;

interface GeoJsonQualquer {
  type: string;
  coordinates?: unknown;
  geometry?: GeoJsonQualquer | null;
  geometries?: GeoJsonQualquer[];
  features?: GeoJsonQualquer[];
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

/** Lê o contorno do imóvel de um arquivo GeoJSON ou KML exportado do CAR. */
export async function lerArquivoImovel(arquivo: File): Promise<GeometriaImovel> {
  if (arquivo.size > LIMITE_BYTES) throw new Error('Arquivo maior que 5 MB.');
  const nome = arquivo.name.toLowerCase();
  const texto = await arquivo.text();

  let dados: GeoJsonQualquer;
  if (nome.endsWith('.kml')) {
    const dom = new DOMParser().parseFromString(texto, 'text/xml');
    if (dom.querySelector('parsererror')) throw new Error('Não foi possível ler o KML.');
    dados = kml(dom) as unknown as GeoJsonQualquer;
  } else if (nome.endsWith('.geojson') || nome.endsWith('.json')) {
    try {
      dados = JSON.parse(texto);
    } catch {
      throw new Error('Não foi possível ler o GeoJSON.');
    }
  } else {
    throw new Error('Use um arquivo .kml, .geojson ou .json.');
  }

  const lista = poligonos(dados);
  if (lista.length === 0) throw new Error('O arquivo não tem nenhum polígono do imóvel.');
  return lista.length === 1 ? { type: 'Polygon', coordinates: lista[0]! } : { type: 'MultiPolygon', coordinates: lista };
}
