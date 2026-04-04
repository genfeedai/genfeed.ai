import type { Article } from '@models/content/article.model';
import { PublicService } from '@services/external/public.service';
import { cache } from 'react';

export const getPublicArticleBySlugCached = cache(
  async (slug: string, isPreview: boolean): Promise<Article | null> => {
    return await PublicService.getInstance().getPublicArticleBySlug(
      slug,
      isPreview,
    );
  },
);
