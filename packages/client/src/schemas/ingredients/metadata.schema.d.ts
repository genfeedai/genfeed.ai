import { AssetScope } from '@genfeedai/enums';
import { z } from 'zod';
export declare const metadataSchema: z.ZodObject<
  {
    description: z.ZodOptional<z.ZodString>;
    duration: z.ZodOptional<z.ZodNumber>;
    extension: z.ZodOptional<z.ZodString>;
    height: z.ZodOptional<z.ZodNumber>;
    label: z.ZodOptional<z.ZodString>;
    mimeType: z.ZodOptional<z.ZodString>;
    size: z.ZodOptional<z.ZodNumber>;
    tags: z.ZodArray<z.ZodString>;
    width: z.ZodOptional<z.ZodNumber>;
  },
  z.core.$strip
>;
export declare const metadataWithScopeSchema: z.ZodObject<
  {
    description: z.ZodOptional<z.ZodString>;
    duration: z.ZodOptional<z.ZodNumber>;
    extension: z.ZodOptional<z.ZodString>;
    height: z.ZodOptional<z.ZodNumber>;
    label: z.ZodOptional<z.ZodString>;
    mimeType: z.ZodOptional<z.ZodString>;
    size: z.ZodOptional<z.ZodNumber>;
    tags: z.ZodArray<z.ZodString>;
    width: z.ZodOptional<z.ZodNumber>;
    folder: z.ZodOptional<z.ZodString>;
    scope: z.ZodEnum<typeof AssetScope>;
  },
  z.core.$strip
>;
export type MetadataSchema = z.infer<typeof metadataSchema>;
export type MetadataWithScopeSchema = z.infer<typeof metadataWithScopeSchema>;
//# sourceMappingURL=metadata.schema.d.ts.map
