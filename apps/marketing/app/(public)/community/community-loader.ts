import type { Article } from '@genfeedai/models/content/article.model';
import type { Image as ImageModel } from '@genfeedai/models/ingredients/image.model';
import type { Video } from '@genfeedai/models/ingredients/video.model';
import type { Brand } from '@genfeedai/models/organization/brand.model';
import { PublicService } from '@services/external/public.service';
import { cache } from 'react';

export const COMMUNITY_CREATOR_LIMIT = 12;
const MEDIA_PER_CREATOR = 4;
const MEDIA_CREATOR_LIMIT = 8;
const LATEST_MEDIA_LIMIT = 12;
const LATEST_ARTICLE_LIMIT = 6;

export interface CommunityPageData {
  articles: Article[];
  creators: Brand[];
  images: ImageModel[];
  videos: Video[];
}

function newestFirst<T extends { createdAt?: string }>(items: T[]): T[] {
  return [...items].sort((left, right) =>
    (right.createdAt ?? '').localeCompare(left.createdAt ?? ''),
  );
}

/**
 * The community gallery: highlighted public creators, their newest
 * generations, and the newest articles on the platform. Media is read per
 * creator so only work from public profiles appears, each linking back to
 * its creator. Every listing degrades to empty on its own.
 */
export const getCommunityPageData = cache(
  async (): Promise<CommunityPageData> => {
    const publicService = PublicService.getInstance();

    const [creatorsResult, articlesResult] = await Promise.allSettled([
      publicService.findPublicBrands({
        isHighlighted: 'true',
        limit: COMMUNITY_CREATOR_LIMIT,
      }),
      publicService.findPublicArticlesPage({
        limit: LATEST_ARTICLE_LIMIT,
        page: 1,
        sortBy: 'publishedAt',
        sortOrder: 'desc',
      }),
    ]);

    const creators = (
      creatorsResult.status === 'fulfilled' ? creatorsResult.value : []
    ).filter((brand) => Boolean(brand.slug));
    const mediaCreators = creators.slice(0, MEDIA_CREATOR_LIMIT);
    const mediaQuery = (brandId: string) => ({
      brand: brandId,
      limit: MEDIA_PER_CREATOR,
      page: 1,
      sort: 'createdAt: -1',
    });

    const [videoPages, imagePages] = await Promise.all([
      Promise.allSettled(
        mediaCreators.map((brand) =>
          publicService.findPublicVideosPage(mediaQuery(brand.id)),
        ),
      ),
      Promise.allSettled(
        mediaCreators.map((brand) =>
          publicService.findPublicImagesPage(mediaQuery(brand.id)),
        ),
      ),
    ]);

    const videos = videoPages.flatMap((result) =>
      result.status === 'fulfilled' ? result.value.items : [],
    );
    const images = imagePages.flatMap((result) =>
      result.status === 'fulfilled' ? result.value.items : [],
    );

    return {
      articles:
        articlesResult.status === 'fulfilled' ? articlesResult.value.items : [],
      creators,
      images: newestFirst(images).slice(0, LATEST_MEDIA_LIMIT),
      videos: newestFirst(videos).slice(0, LATEST_MEDIA_LIMIT),
    };
  },
);
