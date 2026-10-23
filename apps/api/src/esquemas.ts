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
