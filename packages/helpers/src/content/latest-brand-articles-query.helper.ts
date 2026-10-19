import { ArticleStatus } from '@genfeedai/contracts';

export const LATEST_BRAND_ARTICLES_LIMIT = 3;

// Article endpoints sort through `sortBy`/`sortOrder`; the media-style
// `sort: 'createdAt: -1'` string is ignored there. The brand settings preview
// and the public profile share this query so they show the same articles.
export function buildLatestBrandArticlesQuery(brandId: string) {
  return {
    brand: brandId,
    limit: LATEST_BRAND_ARTICLES_LIMIT,
    sortBy: 'createdAt',
    sortOrder: 'desc' as const,
    status: [ArticleStatus.PUBLISHED],
  };
}
