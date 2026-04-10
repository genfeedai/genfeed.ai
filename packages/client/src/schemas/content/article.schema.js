import { ArticleCategory, ArticleStatus, AssetScope } from '@genfeedai/enums';
import { z } from 'zod';
export const articleFormSchema = z.object({
  banner: z.string().optional(),
  content: z.string().min(1, 'Content is required'),
  label: z.string().min(1, 'Title is required').max(200, 'Title is too long'),
  publishedAt: z.string().optional(),
  scope: z.nativeEnum(AssetScope),
  slug: z
    .string()
    .min(1, 'Slug is required')
    .max(200, 'Slug is too long')
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      'Slug must be lowercase with hyphens only',
    ),
  status: z.nativeEnum(ArticleStatus),
  summary: z
    .string()
    .min(1, 'Summary is required')
    .max(500, 'Summary is too long'),
  type: z.nativeEnum(ArticleCategory),
});
export const articleModalSchema = z.object({
  content: z.string().optional(),
  count: z.string().optional(),
  label: z.string().optional(),
  prompt: z.string().optional(),
});
//# sourceMappingURL=article.schema.js.map
