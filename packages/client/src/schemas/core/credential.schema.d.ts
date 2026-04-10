import { z } from 'zod';
export declare const credentialSchema: z.ZodObject<
  {
    description: z.ZodOptional<z.ZodString>;
    label: z.ZodOptional<z.ZodString>;
  },
  z.core.$strip
>;
export type CredentialSchema = z.infer<typeof credentialSchema>;
//# sourceMappingURL=credential.schema.d.ts.map
