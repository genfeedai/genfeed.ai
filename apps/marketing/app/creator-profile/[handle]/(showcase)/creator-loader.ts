import { AssetScope } from '@genfeedai/contracts';
import type { IPaginatedResponse } from '@genfeedai/contracts/interfaces';
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
  referralCode: string | null;
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

async function getPublicReferralCode(brandId: string): Promise<string | null> {
  try {
    return await PublicService.getInstance().findPublicReferralCode(brandId);
  } catch {
    return null;
  }
}

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

/** The brand, its referral code and one page of each kind of content. */
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

    const [showcase, referralCode] = await Promise.all([
      getCreatorShowcase(brand.id, pageSize, page),
      getPublicReferralCode(brand.id),
    ]);

    return { brand, referralCode, showcase };
  },
);

/** Turns `?page=` into a positive page number. */
export function resolveCreatorPage(rawPage: string | undefined): number {
  const parsed = Number.parseInt(rawPage ?? '1', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}
