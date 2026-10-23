import { z } from 'zod';

const posicao = z.tuple([z.number(), z.number()]).rest(z.number());
const anel = z.array(posicao).min(4);

export const geometriaImovel = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Polygon'), coordinates: z.array(anel).min(1) }),
  z.object({ type: z.literal('MultiPolygon'), coordinates: z.array(z.array(anel).min(1)).min(1) }),
]);

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
