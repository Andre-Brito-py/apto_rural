// Tipos mínimos do shpjs (a biblioteca não traz os seus). Lê um .zip de shapefile e devolve
// uma FeatureCollection por camada, já em longitude/latitude (usa o .prj para converter).
declare module 'shpjs' {
  interface ColecaoShp {
    type: 'FeatureCollection';
    features: { type: 'Feature'; geometry: { type: string; coordinates?: unknown } | null; properties: Record<string, unknown> }[];
    fileName?: string;
  }
  export default function shp(entrada: ArrayBuffer | Uint8Array): Promise<ColecaoShp | ColecaoShp[]>;
}
