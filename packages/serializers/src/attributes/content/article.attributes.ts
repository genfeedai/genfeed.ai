import { createEntityAttributes } from '@genfeedai/helpers';

export const articleAttributes = createEntityAttributes([
  'user',
  'organization',
  'brand',
  'tags',
  'label',
  'slug',
  'summary',
  'content',
  'category',
  'status',
  'scope',
  'publishedAt',
  // Persist the public artwork contract directly. Serializer attributes must
  // be backed by real Prisma columns or explicit computed projections.
  'coverImageUrl',
  'aiGeneration',
  'viralityAnalysis',
  'performanceMetrics',
  'evaluation',
  'seoScore',
  'seoBreakdown',
  'generationPrompt',
  'xArticleMetadata',
]);
