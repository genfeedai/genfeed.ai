import {
  mediaBrandId,
  mediaCreatorHandle,
  type PublicMediaFacts,
} from '@data/public-media';
import {
  DEFAULT_PUBLIC_MEDIA_SORT,
  type PublicMediaSort,
} from '@genfeedai/contracts/constants';
import type { IPaginatedResponse } from '@genfeedai/contracts/interfaces';
import type { Article } from '@genfeedai/models/content/article.model';
import type { Image as ImageModel } from '@genfeedai/models/ingredients/image.model';
import type { Video } from '@genfeedai/models/ingredients/video.model';
import type { Brand } from '@genfeedai/models/organization/brand.model';
import type { CommunityFeaturedMedia } from '@props/content/creator.props';
import { PublicService } from '@services/external/public.service';
import { cache } from 'react';

export const COMMUNITY_CREATOR_LIMIT = 12;
/** Creators on one page of the Creators page. */
export const COMMUNITY_DIRECTORY_PAGE_SIZE = 24;
const LATEST_MEDIA_LIMIT = 12;
const GALLERY_MEDIA_LIMIT = 48;
const LATEST_ARTICLE_LIMIT = 6;

export interface CommunityMedia {
  /** Creator handles by brand id, so each card names who made it. */
  creatorHandles: Record<string, string>;
  images: ImageModel[];
  videos: Video[];
}

export interface CommunityPageData extends CommunityMedia {
  articles: Article[];
  creators: Brand[];
  featured: CommunityFeaturedMedia | null;
}

function withSlug(brands: Brand[]): Brand[] {
  return brands.filter((brand) => Boolean(brand.slug));
}

/** The handle of each item's creator, by brand id. */
function handlesOf(items: PublicMediaFacts[]): Record<string, string> {
  return Object.fromEntries(
    items.flatMap((item) => {
      const brandId = mediaBrandId(item);
      const handle = mediaCreatorHandle(item);
      return brandId && handle ? [[brandId, handle]] : [];
    }),
  );
}

/** Only the items the listing names a creator handle for. */
function withCreator<T extends PublicMediaFacts>(items: T[]): T[] {
  return items.filter((item) => Boolean(mediaCreatorHandle(item)));
}

/**
 * The top images and videos across every public creator, ranked by the API
 * before the limit is applied, so a creator added late competes with the
 * first. A listing that fails reads as empty.
 */
async function loadPublicMedia(
  limit: number,
  sort: PublicMediaSort = DEFAULT_PUBLIC_MEDIA_SORT,
): Promise<CommunityMedia> {
  const publicService = PublicService.getInstance();
  const query = { hasPublicCreator: 'true', limit, page: 1, sortBy: sort };
  const [videoPage, imagePage] = await Promise.allSettled([
    publicService.findPublicVideosPage(query),
    publicService.findPublicImagesPage(query),
  ]);
  const videos = withCreator(
    videoPage.status === 'fulfilled' ? videoPage.value.items : [],
  );
  const images = withCreator(
    imagePage.status === 'fulfilled' ? imagePage.value.items : [],
  );

  return {
    creatorHandles: handlesOf([...videos, ...images]),
    images,
    videos,
  };
}

/**
 * The newest image or video an operator featured, a video first. The API
 * lists only featured work whose creator's profile is public, so when the
 * newest featured item's creator goes private the next one takes its place.
 */
async function loadFeaturedMedia(): Promise<CommunityFeaturedMedia | null> {
  const publicService = PublicService.getInstance();
  const featuredQuery = {
    hasPublicCreator: 'true',
    isHighlighted: 'true',
    limit: 1,
    page: 1,
    sortBy: 'newest',
  };
  const [videoPage, imagePage] = await Promise.allSettled([
    publicService.findPublicVideosPage(featuredQuery),
    publicService.findPublicImagesPage(featuredQuery),
  ]);
  const video = withCreator(
    videoPage.status === 'fulfilled' ? videoPage.value.items : [],
  )[0];
  const image = withCreator(
    imagePage.status === 'fulfilled' ? imagePage.value.items : [],
  )[0];
  const media = video ?? image;
  const handle = media ? mediaCreatorHandle(media) : undefined;
  if (!media || !handle) {
    return null;
  }
  return { handle, kind: video ? 'video' : 'image', media };
}

/**
 * One page of the Creators page: every public creator, highlighted ones
 * first, so paging through reaches everyone exactly once. A failed listing
 * reads as an empty first page.
 */
export const getCommunityCreatorsPage = cache(
  async (page: number): Promise<IPaginatedResponse<Brand>> => {
    const result = await PublicService.getInstance().findPublicBrandsPage({
      limit: COMMUNITY_DIRECTORY_PAGE_SIZE,
      page,
      sortBy: 'highlighted',
    });
    return { ...result, items: withSlug(result.items) };
  },
);

/** The gallery behind the Videos and Images pages, in the chosen order. */
export const getCommunityMedia = cache(
  async (sort: PublicMediaSort): Promise<CommunityMedia> =>
    loadPublicMedia(GALLERY_MEDIA_LIMIT, sort),
);

/**
 * The community gallery: highlighted public creators, the newest generations
 * from every public profile, and the newest articles on the platform. Each
 * item links back to its creator. Every listing degrades to empty on its own.
 */
export const getCommunityPageData = cache(
  async (): Promise<CommunityPageData> => {
    const publicService = PublicService.getInstance();

    const [[creatorsResult, articlesResult], media, featured] =
      await Promise.all([
        Promise.allSettled([
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
        ]),
        loadPublicMedia(LATEST_MEDIA_LIMIT),
        loadFeaturedMedia(),
      ]);

    const creators = withSlug(
      creatorsResult.status === 'fulfilled' ? creatorsResult.value : [],
    );

    return {
      ...media,
      articles:
        articlesResult.status === 'fulfilled' ? articlesResult.value.items : [],
      creators,
      featured,
    };
  },
);
