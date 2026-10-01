import { z } from 'zod';

const canonicalIso = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  .refine((value) => {
    try {
      return new Date(value).toISOString() === value;
    } catch {
      return false;
    }
  });
export const brandFontAssetReadV1Schema = z.strictObject({
  id: z.string().min(1).max(256),
  brandId: z.string().min(1).max(256),
  category: z.literal('FONT'),
  mimeType: z.literal('font/woff2'),
  contentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  sizeBytes: z.number().int().min(48).max(4194304),
  displayName: z.string().min(1).max(256).nullable(),
  originalFileName: z
    .string()
    .min(1)
    .max(512)
    .refine((value) => Array.from(value).length <= 256)
    .nullable(),
  createdAt: canonicalIso,
  updatedAt: canonicalIso,
  isDeleted: z.literal(false),
});
export const brandFontAssetPageV1Schema = z.strictObject({
  items: z.array(brandFontAssetReadV1Schema),
  nextCursor: z.string().max(2112).nullable(),
});
export const brandFontAssetListQueryV1Schema = z.strictObject({
  limit: z.number().int().min(1).max(50).optional(),
  cursor: z.string().max(2112).optional(),
});
export type BrandFontAssetReadV1 = z.infer<typeof brandFontAssetReadV1Schema>;
export type BrandFontAssetPageV1 = z.infer<typeof brandFontAssetPageV1Schema>;
export type BrandFontAssetListQueryV1 = z.infer<
  typeof brandFontAssetListQueryV1Schema
>;
