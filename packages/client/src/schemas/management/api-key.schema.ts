import { z } from 'zod';

export const apiKeySchema = z.object({
  description: z.string().optional(),
  expiresAt: z.string().optional(),
  name: z.string().min(1, 'Name is required'),
  rateLimit: z.number().optional(),
  scopes: z.array(z.string()).optional(),
});

export const updateApiKeySchema = apiKeySchema.partial();

export type ApiKeySchema = z.infer<typeof apiKeySchema>;
export type CreateApiKeySchema = z.infer<typeof apiKeySchema>;
export type UpdateApiKeySchema = z.infer<typeof updateApiKeySchema>;
