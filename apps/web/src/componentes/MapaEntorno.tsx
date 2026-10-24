import { useId, useMemo, type CSSProperties } from 'react';
import type { CamadaMapa, GeometriaImovel, MapaEntorno as Mapa, TipoCamadaMapa } from '../api';
import { dataBr, numeroBr } from '../textos';

/**
 * Mapa ilustrado do imóvel e do entorno, em SVG próprio (sem biblioteca de mapa, sem
 * imagem de satélite de terceiros e funcionando na impressão). Mostra o recorte das
 * bases públicas guardado no dia da consulta: o que encosta no imóvel ganha número
 * e destaque; o que está perto aparece mais claro, com a distância na legenda.
 */

// Largura de desenho do SVG; na tela ele estica até a largura do cartão.
const LARGURA = 520;
const ALTURA_MIN = 260;
const ALTURA_MAX = 440;

type Padrao = 'liso' | 'listras' | 'pontos' | 'listras-inv' | 'xadrez';

/** Cor e textura de cada base. A textura ajuda quem não distingue bem as cores e na impressão em preto e branco. */
export const ESTILO_CAMADA: Record<TipoCamadaMapa, { cor: string; nome: string; plural: string; padrao: Padrao }> = {
  embargo: { cor: '#c81e1e', nome: 'Embargo do Ibama', plural: 'embargos do Ibama', padrao: 'liso' },
  terra_indigena: { cor: '#b45309', nome: 'Terra indígena', plural: 'terras indígenas', padrao: 'listras' },
  uc: { cor: '#0e7490', nome: 'Unidade de Conservação', plural: 'Unidades de Conservação', padrao: 'pontos' },
  quilombola: { cor: '#7e22ce', nome: 'Território quilombola', plural: 'territórios quilombolas', padrao: 'listras-inv' },
  floresta_publica: { cor: '#4d7c0f', nome: 'Floresta pública', plural: 'florestas públicas', padrao: 'xadrez' },
};

const ORDEM: TipoCamadaMapa[] = ['embargo', 'terra_indigena', 'uc', 'quilombola', 'floresta_publica'];

type Ponto = [number, number];
type Geo = CamadaMapa['geometria'];

/** Projeção simples (equiretangular corrigida pela latitude), boa na escala de uma fazenda. */
function criarProjecao(janela: Mapa['janela']) {
  let [o, s, l, n] = janela;
  const fx = Math.cos((((s + n) / 2) * Math.PI) / 180);
  let w = (l - o) * fx;
  let h = n - s;
  const altura = Math.round(Math.min(ALTURA_MAX, Math.max(ALTURA_MIN, (LARGURA * h) / w)));
  // Ajusta a janela à proporção do desenho, aumentando o lado que sobra (o centro fica igual).
  const alvo = altura / LARGURA;
  if (h / w < alvo) {
    const d = (w * alvo - h) / 2;
    s -= d;
    n += d;
    h = w * alvo;
  } else {
    const d = (h / alvo - w) / 2 / fx;
    o -= d;
    l += d;
    w = h / alvo;
  }
  const k = LARGURA / w;
  return {
    altura,
    // Um grau de latitude tem ~111,32 km.
    metrosPorPx: (w * 111_320) / LARGURA,
    xy: ([x, y]: number[]): Ponto => [(x! - o) * fx * k, (n - y!) * k],
  };
}

function aneis(g: Geo | undefined): number[][][] {
  if (!g) return [];
  if (g.type === 'Polygon') return g.coordinates as number[][][];
  if (g.type === 'MultiPolygon') return (g.coordinates as number[][][][]).flat();
  if (g.type === 'GeometryCollection') return (g.geometries ?? []).flatMap(aneis);
  return [];
}

function pontosSoltos(g: Geo | undefined): number[][] {
  if (!g) return [];
  if (g.type === 'Point') return [g.coordinates as number[]];
  if (g.type === 'MultiPoint') return g.coordinates as number[][];
  if (g.type === 'GeometryCollection') return (g.geometries ?? []).flatMap(pontosSoltos);
  return [];
}

function caminho(lista: number[][][], xy: (p: number[]) => Ponto): string {
  return lista
    .map(
      (anel) =>
        anel
          .map((p, i) => {
            const [x, y] = xy(p);
            return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join('') + 'Z',
    )
    .join('');
}

export function distanciaBr(m: number): string {
  if (m < 1) return 'menos de 1 m';
  if (m < 1000) return `${Math.round(m)} m`;
  return `${numeroBr(m / 1000, m < 10_000 ? 1 : 0)} km`;
}

function textoDentro(c: CamadaMapa): string {
  if (c.areaHa == null) return 'Dentro do imóvel';
  if (c.areaHa < 0.1) return 'Encosta na divisa: menos de 0,1 ha dentro do imóvel';
  return `${numeroBr(c.areaHa, c.areaHa < 10 ? 2 : 1)} ha dentro do imóvel`;
}

/** Escala gráfica com um valor "redondo" perto de 1/4 da largura. */
function escala(metrosPorPx: number) {
  const opcoes = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10_000, 20_000, 50_000];
  const alvo = metrosPorPx * (LARGURA / 4);
  const m = [...opcoes].reverse().find((v) => v <= alvo) ?? opcoes[0]!;
  return { px: m / metrosPorPx, texto: m >= 1000 ? `${m / 1000} km` : `${m} m` };
}

/** Posiciona os números sem um cobrir o outro (empurra para baixo ou para cima). */
function posicionarNumeros(pontos: Ponto[], altura: number, ocupados: Ponto[]): Ponto[] {
  const usados: Ponto[] = [...ocupados];
  const raio = 13;
  for (const [x0, y0] of pontos) {
    const x = Math.min(LARGURA - raio - 4, Math.max(raio + 4, x0));
    let y = Math.min(altura - raio - 4, Math.max(raio + 4, y0));
    for (let tentativa = 1; tentativa < 8 && usados.some(([ux, uy]) => Math.hypot(ux - x, uy - y) < raio * 2 + 2); tentativa++) {
      const passo = Math.ceil(tentativa / 2) * (raio * 2 + 4) * (tentativa % 2 ? 1 : -1);
      y = Math.min(altura - raio - 4, Math.max(raio + 4, y0 + passo));
    }
    usados.push([x, y]);
  }
  return usados.slice(ocupados.length);
}

function Texturas({ uid }: { uid: string }) {
  const linhas = (id: string, cor: string, angulo: number) => (
    <pattern key={id} id={id} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform={`rotate(${angulo})`}>
      <line x1="0" y1="0" x2="0" y2="7" stroke={cor} strokeWidth="1.6" strokeOpacity="0.55" />
    </pattern>
  );
  return (
    <defs>
      <pattern id={`${uid}-papel`} width="14" height="14" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="2" r="0.9" fill="#cbd5c4" />
      </pattern>
      {ORDEM.map((tipo) => {
        const { cor, padrao } = ESTILO_CAMADA[tipo];
        const id = `${uid}-${tipo}`;
        if (padrao === 'listras') return linhas(id, cor, 45);
        if (padrao === 'listras-inv') return linhas(id, cor, -45);
        if (padrao === 'pontos')
          return (
            <pattern key={id} id={id} width="8" height="8" patternUnits="userSpaceOnUse">
              <circle cx="4" cy="4" r="1.2" fill={cor} fillOpacity="0.45" />
            </pattern>
          );
        if (padrao === 'xadrez')
          return (
            <pattern key={id} id={id} width="8" height="8" patternUnits="userSpaceOnUse">
              <path d="M0 4h8M4 0v8" stroke={cor} strokeWidth="1" strokeOpacity="0.5" />
            </pattern>
          );
        return (
          <pattern key={id} id={id} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke={cor} strokeWidth="1" strokeOpacity="0.35" />
          </pattern>
        );
      })}
    </defs>
  );
}

export function MapaEntorno({ mapa, geometria, data }: { mapa: Mapa; geometria: GeometriaImovel; data: string }) {
  const uid = useId().replace(/:/g, '');

  const desenho = useMemo(() => {
    const p = criarProjecao(mapa.janela);
    const imovelAneis = aneis(geometria as Geo);
    const imovel = caminho(imovelAneis, p.xy);
    const ys = imovelAneis.flat().map((q) => p.xy(q));
    const topo = Math.min(...ys.map((q) => q[1]));
    const base = Math.max(...ys.map((q) => q[1]));
    const centroX = (Math.min(...ys.map((q) => q[0])) + Math.max(...ys.map((q) => q[0]))) / 2;
    const ordenadas = [...mapa.camadas].sort((a, b) => ORDEM.indexOf(a.tipo) - ORDEM.indexOf(b.tipo));
    const tocam = ordenadas.filter((c) => c.toca);
    const perto = ordenadas.filter((c) => !c.toca);
    const etiqueta = { x: Math.min(LARGURA - 40, Math.max(40, centroX)), y: topo > 30 ? topo - 12 : Math.min(p.altura - 14, base + 20) };
    const numeros = posicionarNumeros(
      tocam.map((c) => (c.rotulo ? p.xy(c.rotulo) : [centroX, topo])),
      p.altura,
      // A etiqueta "IMÓVEL" ocupa ~70 px: os números desviam dela.
      [-24, 0, 24].map((dx): Ponto => [etiqueta.x + dx, etiqueta.y]),
    );
    const formas = (c: CamadaMapa) => ({ d: caminho(aneis(c.geometria), p.xy), pontos: pontosSoltos(c.geometria).map(p.xy) });
    return {
      ...p,
      imovel,
      etiqueta,
      tocam: tocam.map((c, i) => ({ c, ...formas(c), numero: numeros[i]! })),
      perto: perto.map((c) => ({ c, ...formas(c) })),
      escala: escala(p.metrosPorPx),
    };
  }, [mapa, geometria]);

  const { altura, tocam, perto } = desenho;
  const titulo = (c: CamadaMapa) =>
    `${ESTILO_CAMADA[c.tipo].nome}: ${c.nome}${c.toca ? ` (${textoDentro(c).toLowerCase()})` : c.distanciaM != null ? ` (a ${distanciaBr(c.distanciaM)})` : ''}`;

  // Legenda: cada área que encosta tem número; as de perto se agrupam por base.
  const grupos = ORDEM.map((tipo) => {
    const lista = perto.filter((x) => x.c.tipo === tipo).map((x) => x.c);
    const minimo = Math.min(...lista.map((c) => c.distanciaM ?? Infinity));
    return { tipo, lista, minimo };
  }).filter((g) => g.lista.length > 0);

  const descricao =
    tocam.length > 0
      ? `Mapa do imóvel. ${tocam.length} área(s) das bases encostam nele: ${tocam.map((t) => titulo(t.c)).join('; ')}.`
      : 'Mapa do imóvel. Nenhuma área das bases encosta nele.';

  return (
    <div className="mapa-entorno">
      <div className="mapa-entorno-topo">
        <h2 className="mapa-entorno-titulo">Mapa do imóvel e do entorno</h2>
        <span className="mapa-selo" style={{ '--cor': tocam.length ? 'var(--impedimento)' : 'var(--ok)' } as CSSProperties}>
          {tocam.length === 0
            ? 'Nenhuma área encosta no imóvel'
            : `${tocam.length} ${tocam.length === 1 ? 'área encosta' : 'áreas encostam'} no imóvel`}
        </span>
      </div>

      <svg className="mapa-desenho" viewBox={`0 0 ${LARGURA} ${altura}`} role="img" aria-label={descricao}>
        <Texturas uid={uid} />
        <defs>
          <clipPath id={`${uid}-quadro`}>
            <rect width={LARGURA} height={altura} />
          </clipPath>
          <clipPath id={`${uid}-imovel`}>
            <path d={desenho.imovel} clipRule="evenodd" />
          </clipPath>
        </defs>

        <g clipPath={`url(#${uid}-quadro)`}>
          <rect width={LARGURA} height={altura} fill="#eef2ea" />
          <rect width={LARGURA} height={altura} fill={`url(#${uid}-papel)`} />

          {/* O que está perto: claro e tracejado. Áreas grandes embaixo, embargos por cima. */}
          {[...perto].reverse().map(({ c, d, pontos }, i) => {
            const { cor } = ESTILO_CAMADA[c.tipo];
            return (
              <g key={`p${i}`}>
                <title>{titulo(c)}</title>
                {d && <path d={d} fill={cor} fillOpacity="0.1" stroke={cor} strokeOpacity="0.55" strokeWidth="1" strokeDasharray="4 3" fillRule="evenodd" />}
                {d && <path d={d} fill={`url(#${uid}-${c.tipo})`} fillOpacity="0.6" fillRule="evenodd" />}
                {pontos.map(([x, y], j) => (
                  <circle key={j} cx={x} cy={y} r="4" fill="#fff" stroke={cor} strokeWidth="1.6" strokeOpacity="0.8" />
                ))}
              </g>
            );
          })}

          {/* O que encosta: cor forte, textura e contorno cheio. */}
          {[...tocam].reverse().map(({ c, d }, i) => {
            const { cor } = ESTILO_CAMADA[c.tipo];
            return (
              d && (
                <g key={`t${i}`}>
                  <title>{titulo(c)}</title>
                  <path d={d} fill={cor} fillOpacity="0.14" fillRule="evenodd" />
                  <path d={d} fill={`url(#${uid}-${c.tipo})`} fillOpacity="0.75" fillRule="evenodd" />
                  <path d={d} fill="none" stroke={cor} strokeWidth="1.6" strokeLinejoin="round" />
                </g>
              )
            );
          })}

          {/* Imóvel: halo branco, preenchimento claro e contorno verde da marca. */}
          <path d={desenho.imovel} fill="#ffffff" fillOpacity="0.45" fillRule="evenodd" stroke="#ffffff" strokeWidth="6" strokeOpacity="0.9" strokeLinejoin="round" />

          {/* Onde a área encosta, dentro do imóvel: realce sólido. */}
          <g clipPath={`url(#${uid}-imovel)`}>
            {[...tocam].reverse().map(
              ({ c, d }, i) =>
                d && <path key={i} d={d} fill={ESTILO_CAMADA[c.tipo].cor} fillOpacity={c.tipo === 'embargo' ? 0.6 : 0.32} fillRule="evenodd" />,
            )}
          </g>
          <path d={desenho.imovel} fill="none" stroke="#14532d" strokeWidth="2.4" strokeLinejoin="round" />

          {/* Embargos em ponto (o termo sem polígono). */}
          {tocam.flatMap(({ c, pontos }, i) =>
            pontos.map(([x, y], j) => (
              <g key={`pt${i}-${j}`}>
                <circle cx={x} cy={y} r="6.5" fill={ESTILO_CAMADA[c.tipo].cor} stroke="#fff" strokeWidth="2" />
                <path d={`M${x - 2.5},${y - 2.5}L${x + 2.5},${y + 2.5}M${x + 2.5},${y - 2.5}L${x - 2.5},${y + 2.5}`} stroke="#fff" strokeWidth="1.6" />
              </g>
            )),
          )}

          {/* Etiqueta do imóvel. */}
          <g transform={`translate(${desenho.etiqueta.x}, ${desenho.etiqueta.y})`}>
            <rect x="-34" y="-10" width="68" height="20" rx="10" fill="#14532d" />
            <text textAnchor="middle" y="4" fontSize="10.5" fontWeight="700" fill="#fff" letterSpacing="0.8">
              IMÓVEL
            </text>
          </g>

          {/* Números das áreas que encostam (os mesmos da legenda). */}
          {tocam.map(({ c, numero: [x, y] }, i) => (
            <g key={`n${i}`} transform={`translate(${x}, ${y})`}>
              <circle r="12" fill={ESTILO_CAMADA[c.tipo].cor} stroke="#fff" strokeWidth="2.5" />
              <text textAnchor="middle" y="4.5" fontSize="12.5" fontWeight="700" fill="#fff">
                {i + 1}
              </text>
            </g>
          ))}

          {/* Norte. */}
          <g transform={`translate(${LARGURA - 26}, 28)`} aria-hidden="true">
            <circle r="16" fill="#ffffff" fillOpacity="0.92" stroke="#cdd4ca" />
            <path d="M0,-11 L5,3 L0,0 L-5,3 Z" fill="#111a14" />
            <text textAnchor="middle" y="12" fontSize="8.5" fontWeight="700" fill="#111a14">
              N
            </text>
          </g>

          {/* Escala gráfica. */}
          <g transform={`translate(12, ${altura - 30})`} aria-hidden="true">
            <rect x="-4" y="-6" width={desenho.escala.px + 52} height="24" rx="6" fill="#ffffff" fillOpacity="0.92" />
            <rect y="4" width={desenho.escala.px / 2} height="5" fill="#111a14" />
            <rect x={desenho.escala.px / 2} y="4" width={desenho.escala.px / 2} height="5" fill="#ffffff" stroke="#111a14" strokeWidth="1" />
            <text x={desenho.escala.px + 6} y="10.5" fontSize="10" fontWeight="600" fill="#111a14">
              {desenho.escala.texto}
            </text>
          </g>
        </g>
      </svg>

      <ul className="mapa-legenda">
        <li>
          <span className="mapa-chave mapa-chave-imovel" aria-hidden="true" />
          <span>
            <strong>Imóvel consultado</strong>
            <span className="mapa-legenda-sub">Contorno enviado na consulta</span>
          </span>
        </li>
        {tocam.map(({ c }, i) => (
          <li key={`t${i}`}>
            <span className="mapa-num" style={{ background: ESTILO_CAMADA[c.tipo].cor }} aria-hidden="true">
              {i + 1}
            </span>
            <span>
              <strong>{c.nome}</strong>
              <span className="mapa-legenda-sub">
                {ESTILO_CAMADA[c.tipo].nome}
                {c.detalhe ? ` · ${c.detalhe}` : ''}
              </span>
              <span className="mapa-dentro">{textoDentro(c)}</span>
            </span>
          </li>
        ))}
        {grupos.map(({ tipo, lista, minimo }) => (
          <li key={tipo}>
            <span className="mapa-chave" style={{ '--cor': ESTILO_CAMADA[tipo].cor } as CSSProperties} aria-hidden="true" />
            {lista.length === 1 ? (
              <span>
                <strong>{lista[0]!.nome}</strong>
                <span className="mapa-legenda-sub">
                  {ESTILO_CAMADA[tipo].nome} por perto{Number.isFinite(minimo) ? `, a ${distanciaBr(minimo)} do imóvel` : ''}
                </span>
              </span>
            ) : (
              <span>
                <strong>
                  {lista.length} {ESTILO_CAMADA[tipo].plural} por perto
                </strong>
                <span className="mapa-legenda-sub">
                  {Number.isFinite(minimo) ? `O mais próximo a ${distanciaBr(minimo)} do imóvel` : 'Fora do imóvel'}
                </span>
              </span>
            )}
          </li>
        ))}
        {mapa.camadas.length === 0 && (
          <li>
            <span className="mapa-chave" style={{ '--cor': 'var(--ok)' } as CSSProperties} aria-hidden="true" />
            <span>
              <strong>Nenhuma área das bases na região do mapa</strong>
              <span className="mapa-legenda-sub">Sem embargo, terra indígena, UC, quilombo ou floresta pública por perto.</span>
            </span>
          </li>
        )}
      </ul>

      <p className="mapa-nota">
        Recorte das bases públicas no dia da consulta ({dataBr(data)}): Ibama, Funai, MMA (CNUC), Incra e Serviço Florestal
        Brasileiro. Desenho simplificado para leitura; os limites oficiais são os de cada órgão.
      </p>
    </div>
  );
}
