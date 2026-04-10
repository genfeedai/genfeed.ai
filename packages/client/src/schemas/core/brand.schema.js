import { AssetScope } from '@genfeedai/enums';
import { z } from 'zod';
export const brandSchema = z.object({
  backgroundColor: z.string().optional(),
  defaultImageModel: z.string().nullable().optional(),
  defaultImageToVideoModel: z.string().nullable().optional(),
  defaultMusicModel: z.string().nullable().optional(),
  defaultVideoModel: z.string().nullable().optional(),
  description: z.string().optional(),
  fontFamily: z.string().optional(),
  instagramHandle: z.string().optional(),
  isActive: z.boolean().optional(),
  isDarkroomEnabled: z.boolean().optional(),
  label: z.string().min(1),
  primaryColor: z.string().optional(),
  scope: z.nativeEnum(AssetScope).optional(),
  secondaryColor: z.string().optional(),
  slug: z.string().min(1),
  text: z.string().optional(),
});
export const brandGenerateSchema = z.object({
  description: z.string().optional(),
  prompt: z.string().min(1, 'Prompt is required'),
});
//# sourceMappingURL=brand.schema.js.map
