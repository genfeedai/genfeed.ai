import { z } from 'zod';
const id = z.string().trim().min(1).max(200);
export const brandRemixGenerationQuoteSchema = z.object({
  id,
  revision: z.number().int().positive(),
  outputKind: z.enum(['copy', 'image']),
  model: id,
  inputHash: id,
  pricingHash: id,
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  unitCredits: z.number().finite().nonnegative(),
  total: z.number().finite().nonnegative(),
  count: z.number().int().positive().max(8),
  billingMode: z.enum(['credits', 'byok']),
  provider: id.optional(),
  acceptedAt: z.string().datetime().optional(),
}).strict();
export const quoteBrandRemixGenerationSchema = z.object({ expectedRevision: z.number().int().positive(), model: id.optional() }).strict();
export const executeBrandRemixGenerationSchema = z.object({ expectedRevision: z.number().int().positive(), quoteId: id }).strict();
export type BrandRemixGenerationQuote = z.infer<typeof brandRemixGenerationQuoteSchema>;
export type QuoteBrandRemixGeneration = z.infer<typeof quoteBrandRemixGenerationSchema>;
export type ExecuteBrandRemixGeneration = z.infer<typeof executeBrandRemixGenerationSchema>;
