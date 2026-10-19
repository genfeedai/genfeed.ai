import { ArticleStatus } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';
import {
  buildLatestBrandArticlesQuery,
  LATEST_BRAND_ARTICLES_LIMIT,
} from './latest-brand-articles-query.helper';

describe('buildLatestBrandArticlesQuery', () => {
  it('asks for the latest three published articles of the brand', () => {
    expect(LATEST_BRAND_ARTICLES_LIMIT).toBe(3);
    expect(buildLatestBrandArticlesQuery('brand-1')).toEqual({
      brand: 'brand-1',
      limit: 3,
      sortBy: 'createdAt',
      sortOrder: 'desc',
      status: [ArticleStatus.PUBLISHED],
    });
  });
});
