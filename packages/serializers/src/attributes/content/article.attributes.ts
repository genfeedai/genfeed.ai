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
  'externalUrl',
  'accessLevel',
  'unlockPriceCredits',
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

/**
 * What genfeed.ai shows of a published article, served to anonymous readers.
 * Generation internals (prompt, SEO and virality analysis, evaluation) and the
 * author's and organization's records stay off the public API.
 */
export const publicArticleAttributes = [
  'user',
  'brand',
  'tags',
  'label',
  'slug',
  'summary',
  'content',
  'category',
  'publishedAt',
  'externalUrl',
  'coverImageUrl',
  // Gated articles (#9718) carry only their preview in `content`.
  'accessLevel',
  'unlockPriceCredits',
  'createdAt',
  'updatedAt',
];

/**
 * An article in a list: everything the reading page shows except the body.
 * Lists, the profile and the sitemap never render `content`, and it is most of
 * the bytes (522 KB for 53 articles). `readingTimeMinutes` stands in for it.
 */
export const publicArticleSummaryAttributes = [
  ...publicArticleAttributes.filter((attribute) => attribute !== 'content'),
  'readingTimeMinutes',
];
