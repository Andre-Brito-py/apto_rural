import { z } from 'zod';

/** Teto de vértices por imóvel: sobra para qualquer CAR e barra geometrias feitas para travar o banco. */
export const MAX_PONTOS_GEOMETRIA = 100_000;

const posicao = z
  .tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])
  .rest(z.number());
const anel = z.array(posicao).min(4);

const contarPontos = (poligonos: unknown[][][]) => poligonos.reduce((t, p) => t + p.reduce((s, a) => s + a.length, 0), 0);

export const geometriaImovel = z
  .discriminatedUnion('type', [
    z.object({ type: z.literal('Polygon'), coordinates: z.array(anel).min(1).max(1000) }),
    z.object({ type: z.literal('MultiPolygon'), coordinates: z.array(z.array(anel).min(1).max(1000)).min(1).max(1000) }),
  ])
  .refine(
    (g) => contarPontos(g.type === 'Polygon' ? [g.coordinates] : g.coordinates) <= MAX_PONTOS_GEOMETRIA,
    `O contorno do imóvel tem pontos demais (máximo ${MAX_PONTOS_GEOMETRIA.toLocaleString('pt-BR')}).`,
  );

/**
 * Conferência rápida do contorno ANTES da zod: para no primeiro ponto inválido e
 * barra listas gigantes. A zod junta um erro por item inválido, e uma lista
 * enorme de lixo esgota a memória ou a pilha (GHSA-mrhx-c7xc-m3w5).
 * Retorna a mensagem de erro, ou null se o formato é plausível.
 */
export function conferirGeometriaRapido(g: unknown): string | null {
  if (g === undefined) return null;
  const invalido = 'O contorno do imóvel está em um formato inválido. Envie o arquivo KML ou GeoJSON exportado do CAR.';
  if (typeof g !== 'object' || g === null) return invalido;
  const { type, coordinates } = g as { type?: unknown; coordinates?: unknown };
  const poligonos = type === 'Polygon' ? [coordinates] : type === 'MultiPolygon' ? coordinates : null;
  if (!Array.isArray(poligonos) || poligonos.length > 1000) return invalido;
  let pontos = 0;
  for (const p of poligonos) {
    if (!Array.isArray(p) || p.length > 1000) return invalido;
    for (const anel of p) {
      if (!Array.isArray(anel)) return invalido;
      pontos += anel.length;
      if (pontos > MAX_PONTOS_GEOMETRIA) return `O contorno do imóvel tem pontos demais (máximo ${MAX_PONTOS_GEOMETRIA.toLocaleString('pt-BR')}).`;
      for (const pt of anel) {
        if (!Array.isArray(pt) || pt.length < 2 || pt.length > 4 || !pt.every((n) => typeof n === 'number' && Number.isFinite(n))) return invalido;
      }
    }
  }
  return null;
}

export const novaConsulta = z
  .object({
    car: z.string().min(10).max(80),
    situacaoCar: z.enum(['ativo', 'pendente', 'suspenso', 'cancelado']).optional(),
    modulosFiscais: z.number().positive().max(100000).optional(),
    usoColetivo: z.boolean().optional(),
    geometria: geometriaImovel.optional(),
    documento: z.string().max(20).optional(),
    consentimentoDocumento: z.boolean().optional(),
  })
  .refine((v) => !v.documento || v.consentimentoDocumento === true, {
    message: 'O CPF/CNPJ só pode ser consultado com a autorização do produtor.',
    path: ['consentimentoDocumento'],
  });

export type NovaConsulta = z.infer<typeof novaConsulta>;
export type GeometriaImovel = z.infer<typeof geometriaImovel>;
