import { GENFEED_BRAND_HANDLE } from '@genfeedai/contracts/constants';
import type { Article } from '@genfeedai/models/content/article.model';
import { PublicService } from '@services/external/public.service';
import { cache } from 'react';

/**
 * Every article Genfeed has published under its own handle, newest first. The
 * public list holds every creator's articles, so the blog keeps Genfeed's.
 * A listing that fails reads as empty, like the other public listings.
 */
export const getGenfeedArticlesCached = cache(async (): Promise<Article[]> => {
  try {
    const articles = await PublicService.getInstance().findAllPublicArticles({
      sortBy: 'publishedAt',
      sortOrder: 'desc',
    });
    return articles.filter(
      (article) =>
        Boolean(article.slug) && article.brand?.slug === GENFEED_BRAND_HANDLE,
    );
  } catch {
    return [];
  }
});
