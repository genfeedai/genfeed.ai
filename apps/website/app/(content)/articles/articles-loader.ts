import { ITEMS_PER_PAGE } from '@genfeedai/constants';
import type { Article } from '@models/content/article.model';
import { PublicService } from '@services/external/public.service';
import { cache } from 'react';

export const getPublicArticlesPageCached = cache(
  async (page: number): Promise<Article[]> => {
    return await PublicService.getInstance().findPublicArticles({
      limit: ITEMS_PER_PAGE,
      page,
      sortBy: 'publishedAt',
      sortOrder: 'desc',
    });
  },
);
