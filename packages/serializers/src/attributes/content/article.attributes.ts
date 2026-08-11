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
  // The real Prisma column. `bannerUrl` is derived from it on the model, so it
  // is not listed here — a serializer attribute with no backing column always
  // emits `undefined`, which is how the article cover stayed invisible.
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
