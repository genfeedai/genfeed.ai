import { ArticleCategory, ArticleStatus, AssetScope } from '@genfeedai/enums';
import { z } from 'zod';
export declare const articleFormSchema: z.ZodObject<
  {
    banner: z.ZodOptional<z.ZodString>;
    content: z.ZodString;
    label: z.ZodString;
    publishedAt: z.ZodOptional<z.ZodString>;
    scope: z.ZodEnum<typeof AssetScope>;
    slug: z.ZodString;
    status: z.ZodEnum<typeof ArticleStatus>;
    summary: z.ZodString;
    type: z.ZodEnum<typeof ArticleCategory>;
  },
  z.core.$strip
>;
export type ArticleFormSchema = z.infer<typeof articleFormSchema>;
export declare const articleModalSchema: z.ZodObject<
  {
    content: z.ZodOptional<z.ZodString>;
    count: z.ZodOptional<z.ZodString>;
    label: z.ZodOptional<z.ZodString>;
    prompt: z.ZodOptional<z.ZodString>;
  },
  z.core.$strip
>;
export type ArticleModalSchema = z.infer<typeof articleModalSchema>;
//# sourceMappingURL=article.schema.d.ts.map
