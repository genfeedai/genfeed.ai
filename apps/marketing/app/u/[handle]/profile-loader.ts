import { AssetScope } from '@genfeedai/contracts';
import { ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import { buildLatestBrandArticlesQuery } from '@helpers/content/latest-brand-articles-query.helper';
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
  referralCode: string | null;
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

async function getPublicReferralCode(brandId: string): Promise<string | null> {
  try {
    return await PublicService.getInstance().findPublicReferralCode(brandId);
  } catch {
    return null;
  }
}

export const getPublicProfilePageData = cache(
  async (handle: string): Promise<PublicProfilePageData> => {
    const brand = await getPublicBrandBySlug(handle);

    if (!brand) {
      return {
        articles: [],
        brand: null,
        images: [],
        links: [],
        referralCode: null,
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
    const [[videosResult, imagesResult, articlesResult], referralCode] =
      await Promise.all([
        Promise.allSettled([
          publicService.findPublicVideos(query),
          publicService.findPublicImages(query),
          publicService.findPublicArticles(
            buildLatestBrandArticlesQuery(brand.id),
          ),
        ]),
        getPublicReferralCode(brand.id),
      ]);

    return {
      articles:
        articlesResult.status === 'fulfilled' ? articlesResult.value : [],
      brand,
      images: imagesResult.status === 'fulfilled' ? imagesResult.value : [],
      links: brand.links ?? [],
      referralCode,
      videos: videosResult.status === 'fulfilled' ? videosResult.value : [],
    };
  },
);
