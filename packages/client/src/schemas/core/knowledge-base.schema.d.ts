import { KnowledgeBaseCategory, KnowledgeBaseStatus } from '@genfeedai/enums';
import { z } from 'zod';
export declare const knowledgeBrandingSchema: z.ZodObject<
  {
    audience: z.ZodOptional<z.ZodString>;
    hashtags: z.ZodOptional<z.ZodArray<z.ZodString>>;
    taglines: z.ZodOptional<z.ZodArray<z.ZodString>>;
    tone: z.ZodOptional<z.ZodString>;
    values: z.ZodOptional<z.ZodArray<z.ZodString>>;
    voice: z.ZodOptional<z.ZodString>;
  },
  z.core.$strip
>;
export declare const knowledgeSourceSchema: z.ZodObject<
  {
    category: z.ZodEnum<typeof KnowledgeBaseCategory>;
    externalId: z.ZodOptional<z.ZodString>;
    label: z.ZodString;
    referenceUrl: z.ZodString;
    summary: z.ZodOptional<z.ZodString>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
  },
  z.core.$strip
>;
export declare const knowledgeBaseSchema: z.ZodObject<
  {
    brandId: z.ZodOptional<z.ZodString>;
    branding: z.ZodOptional<
      z.ZodObject<
        {
          audience: z.ZodOptional<z.ZodString>;
          hashtags: z.ZodOptional<z.ZodArray<z.ZodString>>;
          taglines: z.ZodOptional<z.ZodArray<z.ZodString>>;
          tone: z.ZodOptional<z.ZodString>;
          values: z.ZodOptional<z.ZodArray<z.ZodString>>;
          voice: z.ZodOptional<z.ZodString>;
        },
        z.core.$strip
      >
    >;
    defaultImageModel: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    defaultImageToVideoModel: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    defaultMusicModel: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    defaultVideoModel: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    description: z.ZodOptional<z.ZodString>;
    fontFamily: z.ZodOptional<z.ZodString>;
    label: z.ZodString;
    organizationId: z.ZodOptional<z.ZodString>;
    scope: z.ZodOptional<
      z.ZodEnum<{
        readonly BRAND: import('@genfeedai/enums').ArticleScope.BRAND;
        readonly ORGANIZATION: import('@genfeedai/enums').ArticleScope.ORGANIZATION;
      }>
    >;
    sources: z.ZodOptional<
      z.ZodArray<
        z.ZodObject<
          {
            category: z.ZodEnum<typeof KnowledgeBaseCategory>;
            externalId: z.ZodOptional<z.ZodString>;
            label: z.ZodString;
            referenceUrl: z.ZodString;
            summary: z.ZodOptional<z.ZodString>;
            tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
          },
          z.core.$strip
        >
      >
    >;
    status: z.ZodOptional<z.ZodEnum<typeof KnowledgeBaseStatus>>;
  },
  z.core.$strip
>;
export type KnowledgeBaseSchema = z.infer<typeof knowledgeBaseSchema>;
export type KnowledgeBrandingSchema = z.infer<typeof knowledgeBrandingSchema>;
export type KnowledgeSourceSchema = z.infer<typeof knowledgeSourceSchema>;
//# sourceMappingURL=knowledge-base.schema.d.ts.map
