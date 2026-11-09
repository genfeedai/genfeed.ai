import type { Article } from '@genfeedai/models/content/article.model';
import type { Image as ImageModel } from '@genfeedai/models/ingredients/image.model';
import type { Video } from '@genfeedai/models/ingredients/video.model';
import type { Brand } from '@genfeedai/models/organization/brand.model';
import type { CommunityFeaturedMedia } from '@props/content/creator.props';
import { PublicService } from '@services/external/public.service';
import { cache } from 'react';

export const COMMUNITY_CREATOR_LIMIT = 12;
/** Every public creator the Creators page lists. */
export const COMMUNITY_DIRECTORY_LIMIT = 48;
const MEDIA_PER_CREATOR = 4;
const MEDIA_CREATOR_LIMIT = 8;
/** The Videos and Images pages read further than the Discover preview. */
const GALLERY_MEDIA_PER_CREATOR = 6;
const GALLERY_CREATOR_LIMIT = 24;
const LATEST_MEDIA_LIMIT = 12;
const GALLERY_MEDIA_LIMIT = 48;
const LATEST_ARTICLE_LIMIT = 6;

export interface CommunityMedia {
  images: ImageModel[];
  videos: Video[];
}

export interface CommunityPageData {
  articles: Article[];
  creators: Brand[];
  featured: CommunityFeaturedMedia | null;
  images: ImageModel[];
  videos: Video[];
}

function newestFirst<T extends { createdAt?: string }>(items: T[]): T[] {
  return [...items].sort((left, right) =>
    (right.createdAt ?? '').localeCompare(left.createdAt ?? ''),
  );
}

function withSlug(brands: Brand[]): Brand[] {
  return brands.filter((brand) => Boolean(brand.slug));
}

/**
 * The newest images and videos of the given creators, read per creator so
 * only work from public profiles appears. A creator whose listing fails is
 * skipped.
 */
async function loadCreatorMedia(
  creators: Brand[],
  perCreator: number,
  limit: number,
): Promise<CommunityMedia> {
  const publicService = PublicService.getInstance();
  const mediaQuery = (brandId: string) => ({
    brand: brandId,
    limit: perCreator,
    page: 1,
    sort: 'createdAt: -1',
  });

  const [videoPages, imagePages] = await Promise.all([
    Promise.allSettled(
      creators.map((brand) =>
        publicService.findPublicVideosPage(mediaQuery(brand.id)),
      ),
    ),
    Promise.allSettled(
      creators.map((brand) =>
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
    images: newestFirst(images).slice(0, limit),
    videos: newestFirst(videos).slice(0, limit),
  };
}

function brandIdOf(media: ImageModel | Video): string | undefined {
  if (typeof media.brand === 'string') {
    return media.brand;
  }
  return media.brand?.id ?? media.brandId ?? undefined;
}

/**
 * The newest image or video an operator featured, a video first. It shows only
 * when its creator's profile is public, and links to that profile.
 */
async function loadFeaturedMedia(): Promise<CommunityFeaturedMedia | null> {
  const publicService = PublicService.getInstance();
  const featuredQuery = {
    isHighlighted: 'true',
    limit: 1,
    page: 1,
    sort: 'createdAt: -1',
  };
  const [videoPage, imagePage] = await Promise.allSettled([
    publicService.findPublicVideosPage(featuredQuery),
    publicService.findPublicImagesPage(featuredQuery),
  ]);
  const video =
    videoPage.status === 'fulfilled' ? videoPage.value.items[0] : undefined;
  const image =
    imagePage.status === 'fulfilled' ? imagePage.value.items[0] : undefined;
  const media = video ?? image;
  if (!media) {
    return null;
  }
  const brandId = brandIdOf(media);
  const creator = brandId ? await publicService.findPublicBrand(brandId) : null;
  if (!creator?.slug) {
    return null;
  }
  return { handle: creator.slug, kind: video ? 'video' : 'image', media };
}

/** Every public creator with a handle, highlighted ones first. */
export const getCommunityCreators = cache(async (): Promise<Brand[]> => {
  const publicService = PublicService.getInstance();
  const [highlighted, all] = await Promise.allSettled([
    publicService.findPublicBrands({
      isHighlighted: 'true',
      limit: COMMUNITY_CREATOR_LIMIT,
    }),
    publicService.findPublicBrands({ limit: COMMUNITY_DIRECTORY_LIMIT }),
  ]);
  const ordered = [
    ...(highlighted.status === 'fulfilled' ? highlighted.value : []),
    ...(all.status === 'fulfilled' ? all.value : []),
  ];
  const seen = new Set<string>();
  return withSlug(ordered).filter((brand) => {
    if (seen.has(brand.id)) {
      return false;
    }
    seen.add(brand.id);
    return true;
  });
});

/** The gallery behind the Videos and Images pages. */
export const getCommunityMedia = cache(async (): Promise<CommunityMedia> => {
  const creators = await getCommunityCreators();
  return loadCreatorMedia(
    creators.slice(0, GALLERY_CREATOR_LIMIT),
    GALLERY_MEDIA_PER_CREATOR,
    GALLERY_MEDIA_LIMIT,
  );
});

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

    const creators = withSlug(
      creatorsResult.status === 'fulfilled' ? creatorsResult.value : [],
    );
    const [{ images, videos }, featured] = await Promise.all([
      loadCreatorMedia(
        creators.slice(0, MEDIA_CREATOR_LIMIT),
        MEDIA_PER_CREATOR,
        LATEST_MEDIA_LIMIT,
      ),
      loadFeaturedMedia(),
    ]);

    return {
      articles:
        articlesResult.status === 'fulfilled' ? articlesResult.value.items : [],
      creators,
      featured,
      images,
      videos,
    };
  },
);
