import { z } from 'zod';
export const apiKeySchema = z.object({
  description: z.string().optional(),
  expiresAt: z.string().optional(),
  name: z.string().min(1, 'Name is required'),
  rateLimit: z.number().optional(),
  scopes: z.array(z.string()).optional(),
});
export const updateApiKeySchema = apiKeySchema.partial();
//# sourceMappingURL=api-key.schema.js.map
