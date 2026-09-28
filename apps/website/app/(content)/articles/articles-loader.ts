import { ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import type { IPaginatedResponse } from '@genfeedai/contracts/interfaces';
import type { Article } from '@models/content/article.model';
import { PublicService } from '@services/external/public.service';
import { cache } from 'react';

export const getPublicArticlesPageCached = cache(
  async (page: number): Promise<IPaginatedResponse<Article>> => {
    return await PublicService.getInstance().findPublicArticlesPage({
      limit: ITEMS_PER_PAGE,
      page,
      sortBy: 'publishedAt',
      sortOrder: 'desc',
    });
  },
);
