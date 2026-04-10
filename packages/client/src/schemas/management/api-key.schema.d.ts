import { z } from 'zod';
export declare const apiKeySchema: z.ZodObject<
  {
    description: z.ZodOptional<z.ZodString>;
    expiresAt: z.ZodOptional<z.ZodString>;
    name: z.ZodString;
    rateLimit: z.ZodOptional<z.ZodNumber>;
    scopes: z.ZodOptional<z.ZodArray<z.ZodString>>;
  },
  z.core.$strip
>;
export declare const updateApiKeySchema: z.ZodObject<
  {
    description: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    expiresAt: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    name: z.ZodOptional<z.ZodString>;
    rateLimit: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
    scopes: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodString>>>;
  },
  z.core.$strip
>;
export type ApiKeySchema = z.infer<typeof apiKeySchema>;
export type CreateApiKeySchema = z.infer<typeof apiKeySchema>;
export type UpdateApiKeySchema = z.infer<typeof updateApiKeySchema>;
//# sourceMappingURL=api-key.schema.d.ts.map
