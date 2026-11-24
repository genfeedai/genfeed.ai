'use client';

import { ArticleStatus } from '@genfeedai/contracts';
import type { IQueryParams } from '@genfeedai/contracts/interfaces';
import { usePagedAuthedQuery } from '@hooks/auth/use-paged-authed-query/use-paged-authed-query';
import { useCollectionScope } from '@hooks/navigation/use-collection-scope/use-collection-scope';
import type { Article } from '@models/content/article.model';
import { ArticlesService } from '@services/content/articles.service';
import { logger } from '@services/core/logger.service';

const BRAND_PROFILE_ARTICLES_PAGE_SIZE = 12;

const BRAND_PROFILE_ARTICLES_KEY = ['brand-profile', 'articles'] as const;
const EMPTY_ARTICLES: Article[] = [];

export interface BrandProfileArticles {
  articles: Article[];
  isError: boolean;
  isPending: boolean;
  total: number;
  totalPages: number;
}

/**
 * The brand's published articles, newest first: the same list the public
 * profile shows, read through the signed-in API so the page needs no second
 * source of truth. Drafts are left out on purpose; they live in the editor.
 */
export function useBrandProfileArticles(
  brandId: string,
  page = 1,
): BrandProfileArticles {
  const { organizationId } = useCollectionScope();

  const query = usePagedAuthedQuery({
    enabled: Boolean(organizationId && brandId),
    keepPreviousDataWithin: [...BRAND_PROFILE_ARTICLES_KEY, brandId],
    queryFn: async (service, signal) => {
      const params: IQueryParams = {
        brandId,
        limit: BRAND_PROFILE_ARTICLES_PAGE_SIZE,
        organizationId,
        page,
        sortBy: 'publishedAt',
        sortOrder: 'desc',
        status: ArticleStatus.PUBLISHED,
      };
      try {
        return await service.findAllPage(params, signal);
      } catch (error) {
        if (!signal.aborted) {
          logger.error('GET /articles (brand profile) failed', error);
        }
        throw error;
      }
    },
    queryKey: [...BRAND_PROFILE_ARTICLES_KEY, brandId, { page }],
    service: (token: string) => ArticlesService.getInstance(token),
  });

  return {
    articles: query.data?.items ?? EMPTY_ARTICLES,
    isError: query.isError,
    isPending: query.isPending,
    total: query.data?.totals.totalDocs ?? 0,
    totalPages: query.data?.totals.totalPages ?? 1,
  };
}
