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
