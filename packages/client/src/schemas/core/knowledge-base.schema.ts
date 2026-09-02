import {
  KnowledgeBaseCategory,
  KnowledgeBaseScope,
  KnowledgeBaseStatus,
} from '@genfeedai/contracts';
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
  chunkCount: z.number().optional(),
  error: z.string().optional(),
  externalId: z.string().optional(),
  id: z.string().optional(),
  label: z.string().min(1),
  lastIngestedAt: z.string().optional(),
  referenceUrl: z.string().url(),
  status: z.nativeEnum(KnowledgeBaseStatus).optional(),
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

export type KnowledgeBaseSchema = z.infer<typeof knowledgeBaseSchema>;
export type KnowledgeBrandingSchema = z.infer<typeof knowledgeBrandingSchema>;
export type KnowledgeSourceSchema = z.infer<typeof knowledgeSourceSchema>;
