import { z } from 'zod';

export const apiKeySchema = z.object({
  /** Limit the key to these brands; omit for every brand (#9130). */
  allowedBrandIds: z.array(z.string().min(1)).min(1).optional(),
  allowedIps: z.array(z.string().min(1)).optional(),
  category: z.string().optional(),
  defaultBrandId: z.string().min(1).optional(),
  description: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
  label: z.string().min(1, 'Label is required'),
  metadata: z.record(z.string(), z.unknown()).optional(),
  rateLimit: z.number().optional(),
  scopes: z.array(z.string()).optional(),
});

/** The brand limit is fixed when the key is made, so an update cannot set it. */
export const updateApiKeySchema = apiKeySchema
  .omit({ allowedBrandIds: true })
  .partial();

export type ApiKeySchema = z.infer<typeof apiKeySchema>;
export type CreateApiKeySchema = z.infer<typeof apiKeySchema>;
export type UpdateApiKeySchema = z.infer<typeof updateApiKeySchema>;
