import { articleHandle } from '@genfeedai/contracts/constants';
import type { Article } from '@models/content/article.model';
import { PublicService } from '@services/external/public.service';
import { cache } from 'react';

export const getPublicArticleBySlugCached = cache(
  async (slug: string, previewToken?: string): Promise<Article | null> => {
    return await PublicService.getInstance().getPublicArticleBySlug(
      slug,
      previewToken,
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
