import { AssetScope } from '@genfeedai/contracts';
import type { CreatorProfileTab } from '@genfeedai/contracts/constants';
import type {
  IPaginatedResponse,
  IPublicBrandReach,
} from '@genfeedai/contracts/interfaces';
import type { Article } from '@models/content/article.model';
import type { Post } from '@models/content/post.model';
import type { Image as ImageModel } from '@models/ingredients/image.model';
import type { Video } from '@models/ingredients/video.model';
import type { Brand } from '@models/organization/brand.model';
import { PublicService } from '@services/external/public.service';
import { cache } from 'react';

/** Items per tab page; the "All" view shows the newest few of each kind. */
export const CREATOR_TAB_PAGE_SIZE = 24;
export const CREATOR_OVERVIEW_PAGE_SIZE = 6;

export interface CreatorShowcase {
  articles: IPaginatedResponse<Article>;
  images: IPaginatedResponse<ImageModel>;
  posts: IPaginatedResponse<Post>;
  videos: IPaginatedResponse<Video>;
}

export interface CreatorProfileData {
  brand: Brand;
  /** Lifetime totals; null when the API has none or could not answer. */
  reach: IPublicBrandReach | null;
  showcase: CreatorShowcase;
}

function emptyPage<T>(pageSize: number): IPaginatedResponse<T> {
  return {
    hasNext: false,
    hasPrevious: false,
    items: [],
    page: 1,
    pageSize,
    total: 0,
    totalPages: 1,
  };
}

// Null means the API answered that no public brand has this handle, and the
// page turns it into a 404. A failed request throws instead, so an outage is a
// server error and never a cached 404 for a profile that exists.
export const getPublicBrandBySlug = cache(
  (slug: string): Promise<Brand | null> =>
    PublicService.getInstance().findPublicProfileBySlug(slug),
);

/** The creator's referral code for sign-up links, or null when there is none. */
export const getPublicReferralCode = cache(
  async (brandId: string): Promise<string | null> => {
    try {
      return await PublicService.getInstance().findPublicReferralCode(brandId);
    } catch {
      return null;
    }
  },
);

/** The creator's lifetime totals, or null when there are none to show. */
export const getPublicReach = cache(
  async (brandId: string): Promise<IPublicBrandReach | null> => {
    try {
      return await PublicService.getInstance().findPublicReach(brandId);
    } catch {
      return null;
    }
  },
);

/**
 * The referral code for a handle's sign-up links. Unknown handles, an outage
 * and a creator without a code all read as null: the footer then offers a
 * plain sign-up, and the page is never blocked on it.
 */
export const getPublicReferralCodeBySlug = cache(
  async (slug: string): Promise<string | null> => {
    try {
      const brand = await getPublicBrandBySlug(slug);
      return brand ? await getPublicReferralCode(brand.id) : null;
    } catch {
      return null;
    }
  },
);

/**
 * One page of each kind of public content for a creator. A kind that fails to
 * load reads as empty, so one slow listing never takes the profile down.
 */
export const getCreatorShowcase = cache(
  async (
    brandId: string,
    pageSize: number,
    page = 1,
  ): Promise<CreatorShowcase> => {
    const publicService = PublicService.getInstance();
    const mediaQuery = {
      brand: brandId,
      limit: pageSize,
      page,
      scope: AssetScope.PUBLIC,
      sort: 'createdAt: -1',
    };

    const [videos, images, articles, posts] = await Promise.allSettled([
      publicService.findPublicVideosPage(mediaQuery),
      publicService.findPublicImagesPage(mediaQuery),
      // Article endpoints sort through `sortBy`/`sortOrder`.
      publicService.findPublicArticlesPage({
        brand: brandId,
        limit: pageSize,
        page,
        sortBy: 'publishedAt',
        sortOrder: 'desc',
      }),
      publicService.findPublicPostsPage({
        brand: brandId,
        limit: pageSize,
        page,
      }),
    ]);

    return {
      articles:
        articles.status === 'fulfilled' ? articles.value : emptyPage(pageSize),
      images:
        images.status === 'fulfilled' ? images.value : emptyPage(pageSize),
      posts: posts.status === 'fulfilled' ? posts.value : emptyPage(pageSize),
      videos:
        videos.status === 'fulfilled' ? videos.value : emptyPage(pageSize),
    };
  },
);

/**
 * One page of the creator's posts from a single platform. The wall's platform
 * chips link here; the unfiltered showcase keeps the counts every tab shows.
 */
export const getCreatorPlatformPosts = cache(
  async (
    brandId: string,
    pageSize: number,
    page: number,
    platform: string,
  ): Promise<IPaginatedResponse<Post>> => {
    try {
      return await PublicService.getInstance().findPublicPostsPage({
        brand: brandId,
        limit: pageSize,
        page,
        platform,
      });
    } catch {
      return emptyPage(pageSize);
    }
  },
);

/**
 * Whether the profile, or one of its tabs, has anything published. A profile
 * with nothing on it is thin content: it stays out of the index and the
 * sitemap until its first item is published. A listing that cannot be loaded
 * reads as "has content", so an outage never takes a real profile out of the
 * index.
 */
export const hasPublicContent = cache(
  async (
    brandId: string,
    tab: CreatorProfileTab | null = null,
  ): Promise<boolean> => {
    const publicService = PublicService.getInstance();
    const mediaQuery = {
      brand: brandId,
      limit: 1,
      page: 1,
      scope: AssetScope.PUBLIC,
    };
    const totals: Record<
      CreatorProfileTab,
      () => Promise<IPaginatedResponse<unknown>>
    > = {
      articles: () =>
        publicService.findPublicArticlesPage({
          brand: brandId,
          limit: 1,
          page: 1,
        }),
      images: () => publicService.findPublicImagesPage(mediaQuery),
      posts: () =>
        publicService.findPublicPostsPage({
          brand: brandId,
          limit: 1,
          page: 1,
        }),
      videos: () => publicService.findPublicVideosPage(mediaQuery),
    };
    const tabs = tab ? [tab] : (Object.keys(totals) as CreatorProfileTab[]);

    const results = await Promise.allSettled(
      tabs.map((kind) => totals[kind]()),
    );

    return results.some(
      (result) => result.status === 'rejected' || result.value.total > 0,
    );
  },
);

/** The brand, its totals and one page of each kind of content. */
export const getCreatorProfileData = cache(
  async (
    handle: string,
    pageSize: number = CREATOR_OVERVIEW_PAGE_SIZE,
    page = 1,
  ): Promise<CreatorProfileData | null> => {
    const brand = await getPublicBrandBySlug(handle);

    if (!brand) {
      return null;
    }

    const [showcase, reach] = await Promise.all([
      getCreatorShowcase(brand.id, pageSize, page),
      getPublicReach(brand.id),
    ]);

    return { brand, reach, showcase };
  },
);

/**
 * The platform a wall is narrowed to: `?platform=` counts only when the
 * creator has connected that platform, so a stray value shows every post.
 */
export function resolveCreatorPlatform(
  rawPlatform: string | undefined,
  brand: Brand,
): string | null {
  const platform = brand.socials?.find(
    (social) => social.platform === rawPlatform,
  )?.platform;
  return platform ?? null;
}

/** Turns `?page=` into a positive page number. */
export function resolveCreatorPage(rawPage: string | undefined): number {
  const parsed = Number.parseInt(rawPage ?? '1', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}
