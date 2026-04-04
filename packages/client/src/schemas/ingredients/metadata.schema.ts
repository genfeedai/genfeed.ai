import { AssetScope } from '@genfeedai/enums';
import { z } from 'zod';

export const metadataSchema = z.object({
  description: z.string().optional(),
  duration: z.number().optional(),
  extension: z.string().optional(),
  height: z.number().optional(),
  label: z.string().optional(),
  mimeType: z.string().optional(),
  size: z.number().optional(),
  tags: z.array(z.string()),
  width: z.number().optional(),
});

export const metadataWithScopeSchema = metadataSchema.extend({
  folder: z.string().optional(),
  scope: z.nativeEnum(AssetScope),
});

export type MetadataSchema = z.infer<typeof metadataSchema>;

export type MetadataWithScopeSchema = z.infer<typeof metadataWithScopeSchema>;
