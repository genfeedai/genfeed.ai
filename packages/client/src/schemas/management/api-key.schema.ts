import { z } from 'zod';

export const apiKeySchema = z.object({
  allowedIps: z.array(z.string().min(1)).optional(),
  category: z.string().optional(),
  description: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
  label: z.string().min(1, 'Label is required'),
  metadata: z.record(z.string(), z.unknown()).optional(),
  rateLimit: z.number().optional(),
  scopes: z.array(z.string()).optional(),
});

export const updateApiKeySchema = apiKeySchema.partial();

export type ApiKeySchema = z.infer<typeof apiKeySchema>;
export type CreateApiKeySchema = z.infer<typeof apiKeySchema>;
export type UpdateApiKeySchema = z.infer<typeof updateApiKeySchema>;
