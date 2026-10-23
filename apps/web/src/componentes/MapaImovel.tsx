import { useMemo } from 'react';
import type { GeometriaImovel } from '../api';

/**
 * Desenho do imóvel em SVG puro: zero bytes de biblioteca de mapa e funciona
 * sem internet. O mapa com imagem de satélite fica para o dossiê.
 */
export function MapaImovel({ geometria }: { geometria: GeometriaImovel }) {
  const caminho = useMemo(() => {
    const poligonos = (geometria.type === 'Polygon' ? [geometria.coordinates] : geometria.coordinates) as number[][][][];
    const pontos = poligonos.flat(2);
    const lons = pontos.map((p) => p[0]!);
    const lats = pontos.map((p) => p[1]!);
    const [minX, maxX, minY, maxY] = [Math.min(...lons), Math.max(...lons), Math.min(...lats), Math.max(...lats)];
    // Corrige a distorção leste-oeste pela latitude média.
    const fx = Math.cos((((minY + maxY) / 2) * Math.PI) / 180);
    const largura = (maxX - minX) * fx || 1e-9;
    const altura = maxY - minY || 1e-9;
    const escala = 84 / Math.max(largura, altura);
    const dx = (100 - largura * escala) / 2;
    const dy = (100 - altura * escala) / 2;
    return poligonos
      .flatMap((poligono) =>
        poligono.map(
          (anel) =>
            anel
              .map((p, i) => `${i ? 'L' : 'M'}${(dx + (p[0]! - minX) * fx * escala).toFixed(1)},${(dy + (maxY - p[1]!) * escala).toFixed(1)}`)
              .join('') + 'Z',
        ),
      )
      .join('');
  }, [geometria]);

  return (
    <svg className="mapa" viewBox="0 0 100 100" role="img" aria-label="Contorno do imóvel">
      <path d={caminho} fill="#14532d" fillOpacity="0.18" stroke="#14532d" strokeWidth="1.4" strokeLinejoin="round" fillRule="evenodd" />
    </svg>
  );
}
