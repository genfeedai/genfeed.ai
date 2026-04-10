import {
  KnowledgeBaseCategory,
  KnowledgeBaseScope,
  KnowledgeBaseStatus,
} from '@genfeedai/enums';
import { z } from 'zod';
export const knowledgeBrandingSchema = z.object({
  audience: z.string().max(256).optional(),
  hashtags: z.array(z.string()).optional(),
  taglines: z.array(z.string()).optional(),
  tone: z.string().max(256).optional(),
  values: z.array(z.string()).optional(),
  voice: z.string().max(256).optional(),
});
export const knowledgeSourceSchema = z.object({
  category: z.nativeEnum(KnowledgeBaseCategory),
  externalId: z.string().optional(),
  label: z.string().min(1),
  referenceUrl: z.string().url(),
  summary: z.string().optional(),
  tags: z.array(z.string()).optional(),
});
export const knowledgeBaseSchema = z.object({
  brandId: z.string().optional(),
  branding: knowledgeBrandingSchema.optional(),
  defaultImageModel: z.string().nullable().optional(),
  defaultImageToVideoModel: z.string().nullable().optional(),
  defaultMusicModel: z.string().nullable().optional(),
  defaultVideoModel: z.string().nullable().optional(),
  description: z.string().max(512).optional(),
  fontFamily: z.string().optional(),
  label: z.string().min(1).max(120),
  organizationId: z.string().optional(),
  scope: z.nativeEnum(KnowledgeBaseScope).optional(),
  sources: z.array(knowledgeSourceSchema).optional(),
  status: z.nativeEnum(KnowledgeBaseStatus).optional(),
});
//# sourceMappingURL=knowledge-base.schema.js.map
