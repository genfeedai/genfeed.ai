import { articleHandle } from '@genfeedai/contracts/constants';
import type { Article } from '@models/content/article.model';
import { retryTransientRead } from '@services/core/retry-transient-read';
import { PublicService } from '@services/external/public.service';
import { cache } from 'react';

export const getPublicArticleBySlugCached = cache(
  async (slug: string, previewToken?: string): Promise<Article | null> => {
    return await retryTransientRead('article', () =>
      PublicService.getInstance().getPublicArticleBySlug(slug, previewToken),
    );
  },
);

/**
 * The article at `/@handle/articles/slug`, or `null` when there is none or it
 * belongs to another creator. Slugs are one global namespace, so a slug under
 * the wrong handle is a 404, never a second copy of the page.
 */
export const getCreatorArticleCached = cache(
  async (
    handle: string,
    slug: string,
    previewToken?: string,
  ): Promise<Article | null> => {
    const article = await getPublicArticleBySlugCached(slug, previewToken);

    if (!article || article.id === 'undefined') {
      return null;
    }

    return articleHandle(article.brand?.slug) === handle.toLowerCase()
      ? article
      : null;
  },
);

/**
 * Every public article a creator has published, newest first. A listing that
 * fails reads as empty: the article page renders without its related links.
 */
export const getCreatorArticleListCached = cache(
  async (brandId: string): Promise<Article[]> => {
    try {
      const articles = await PublicService.getInstance().findAllPublicArticles({
        brand: brandId,
        sortBy: 'publishedAt',
        sortOrder: 'desc',
      });
      return articles.filter((article) => Boolean(article.slug));
    } catch {
      return [];
    }
  },
);
