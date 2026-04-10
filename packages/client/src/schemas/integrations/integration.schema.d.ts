import { z } from 'zod';
export declare const integrationSchema: z.ZodObject<
  {
    elevenlabs: z.ZodOptional<z.ZodString>;
    klingai: z.ZodOptional<z.ZodString>;
    leonardo: z.ZodOptional<z.ZodString>;
  },
  z.core.$strip
>;
export type IntegrationSchema = z.infer<typeof integrationSchema>;
//# sourceMappingURL=integration.schema.d.ts.map
