import { ITEMS_PER_PAGE } from '@genfeedai/constants';
import { AssetScope } from '@genfeedai/enums';
import type { Article } from '@models/content/article.model';
import type { Image as ImageModel } from '@models/ingredients/image.model';
import type { Video } from '@models/ingredients/video.model';
import type { Brand } from '@models/organization/brand.model';
import type { Link as LinkModel } from '@models/social/link.model';
import { PublicService } from '@services/external/public.service';
import { cache } from 'react';

export interface PublicProfilePageData {
  articles: Article[];
  brand: Brand | null;
  images: ImageModel[];
  links: LinkModel[];
  videos: Video[];
}

export const getPublicBrandBySlug = cache(
  async (slug: string): Promise<Brand | null> => {
    try {
      return await PublicService.getInstance().findPublicProfileBySlug(slug);
    } catch {
      return null;
    }
  },
);

export const getPublicProfilePageData = cache(
  async (handle: string): Promise<PublicProfilePageData> => {
    const brand = await getPublicBrandBySlug(handle);

    if (!brand) {
      return {
        articles: [],
        brand: null,
        images: [],
        links: [],
        videos: [],
      };
    }

    const query = {
      brand: brand.id,
      limit: ITEMS_PER_PAGE,
      page: 1,
      scope: AssetScope.PUBLIC,
      sort: 'createdAt: -1',
    };

    const publicService = PublicService.getInstance();
    const [videosResult, imagesResult, articlesResult] =
      await Promise.allSettled([
        publicService.findPublicVideos(query),
        publicService.findPublicImages(query),
        publicService.findPublicArticles(query),
      ]);

    return {
      articles:
        articlesResult.status === 'fulfilled' ? articlesResult.value : [],
      brand,
      images: imagesResult.status === 'fulfilled' ? imagesResult.value : [],
      links: brand.links ?? [],
      videos: videosResult.status === 'fulfilled' ? videosResult.value : [],
    };
  },
);
