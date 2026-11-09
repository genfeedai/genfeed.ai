import { NotFoundException } from '@api/exceptions/not-found.exception';
import { CategoryPrismaUtil } from '@api/helpers/utils/category-prisma/category-prisma.util';
import { scopedWhere } from '@api/index';
import { CacheService } from '@api/services/cache/cache.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  AssetScope,
  IngredientCategory,
  IngredientStatus,
} from '@genfeedai/contracts';
import { ADMIN_COMMUNITY_MEDIA_PAGE_SIZE } from '@genfeedai/contracts/constants';
import type {
  IAdminCommunityCreator,
  IAdminCommunityMedia,
  IAdminCommunityOverview,
} from '@genfeedai/contracts/interfaces';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

/**
 * What the community pages and profiles cache. A write here has to show on
 * genfeed.ai at once, above all a removal.
 */
const COMMUNITY_CACHE_TAGS = ['brands', 'images', 'public', 'slugs', 'videos'];

const IMAGE_CATEGORY = CategoryPrismaUtil.toIngredientCategory(
  IngredientCategory.IMAGE,
);
const VIDEO_CATEGORY = CategoryPrismaUtil.toIngredientCategory(
  IngredientCategory.VIDEO,
);
const PUBLIC_SCOPE = CategoryPrismaUtil.toAssetScope(AssetScope.PUBLIC);
/** Off community, still shared with the organization that made it. */
const UNPUBLISHED_SCOPE = CategoryPrismaUtil.toAssetScope(
  AssetScope.ORGANIZATION,
);

/** The media community galleries show: public, generated images and videos. */
const PUBLIC_MEDIA = {
  category: { in: [IMAGE_CATEGORY, VIDEO_CATEGORY] },
  scope: PUBLIC_SCOPE,
  status: CategoryPrismaUtil.toIngredientStatus(IngredientStatus.GENERATED),
};

/** Featured first, then newest. */
const CURATION_ORDER = [
  { isHighlighted: 'desc' as const },
  { createdAt: 'desc' as const },
];

/**
 * Operator curation of genfeed.ai/community (#9670), one organization at a
 * time. Members cannot feature their own work; a platform superadmin features
 * a public creator or a public image or video, or takes it off community. A
 * removal moves it from public to organization scope, so the team keeps it.
 */
@Traced()
@Injectable()
export class AdminCommunityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  /** The organization's public creators and one page of its public media. */
  async getOverview(
    organizationId: string,
    page: number,
  ): Promise<IAdminCommunityOverview> {
    const mediaWhere = scopedWhere(organizationId, PUBLIC_MEDIA);
    const [brands, media, mediaTotal] = await runWithTenantContext(
      { organizationId },
      () =>
        Promise.all([
          this.prisma.brand.findMany({
            orderBy: CURATION_ORDER,
            select: {
              createdAt: true,
              id: true,
              isHighlighted: true,
              label: true,
              slug: true,
            },
            where: scopedWhere(organizationId, { scope: PUBLIC_SCOPE }),
          }),
          this.prisma.ingredient.findMany({
            orderBy: CURATION_ORDER,
            select: {
              brandId: true,
              category: true,
              cdnUrl: true,
              createdAt: true,
              id: true,
              isHighlighted: true,
              metadata: { select: { label: true } },
            },
            skip: (page - 1) * ADMIN_COMMUNITY_MEDIA_PAGE_SIZE,
            take: ADMIN_COMMUNITY_MEDIA_PAGE_SIZE,
            where: mediaWhere,
          }),
          this.prisma.ingredient.count({ where: mediaWhere }),
        ]),
    );

    return {
      creators: brands.map(
        (brand): IAdminCommunityCreator => ({
          createdAt: brand.createdAt.toISOString(),
          handle: brand.slug,
          id: brand.id,
          isFeatured: brand.isHighlighted,
          label: brand.label,
        }),
      ),
      media: media.map(
        (item): IAdminCommunityMedia => ({
          brandId: item.brandId,
          createdAt: item.createdAt.toISOString(),
          id: item.id,
          isFeatured: item.isHighlighted,
          kind: item.category === VIDEO_CATEGORY ? 'video' : 'image',
          label: item.metadata?.label ?? '',
          url: item.cdnUrl,
        }),
      ),
      mediaTotal,
    };
  }

  /** Feature, or stop featuring, a public image or video. */
  async setMediaFeatured(
    organizationId: string,
    ingredientId: string,
    isHighlighted: boolean,
  ): Promise<{ id: string; isFeatured: boolean }> {
    await this.writeMedia(organizationId, ingredientId, { isHighlighted });
    return { id: ingredientId, isFeatured: isHighlighted };
  }

  /** Take an image or video off community; the organization keeps it. */
  async unpublishMedia(
    organizationId: string,
    ingredientId: string,
  ): Promise<{ id: string }> {
    await this.writeMedia(organizationId, ingredientId, {
      isHighlighted: false,
      scope: UNPUBLISHED_SCOPE,
    });
    return { id: ingredientId };
  }

  /** Feature, or stop featuring, a creator with a public profile. */
  async setCreatorFeatured(
    organizationId: string,
    brandId: string,
    isHighlighted: boolean,
  ): Promise<{ id: string; isFeatured: boolean }> {
    await this.writeCreator(organizationId, brandId, { isHighlighted });
    return { id: brandId, isFeatured: isHighlighted };
  }

  /** Take a creator's profile off genfeed.ai; the brand itself stays. */
  async unpublishCreator(
    organizationId: string,
    brandId: string,
  ): Promise<{ id: string }> {
    await this.writeCreator(organizationId, brandId, {
      isHighlighted: false,
      scope: UNPUBLISHED_SCOPE,
    });
    return { id: brandId };
  }

  private async writeMedia(
    organizationId: string,
    ingredientId: string,
    data: { isHighlighted: boolean; scope?: typeof UNPUBLISHED_SCOPE },
  ): Promise<void> {
    const { count } = await runWithTenantContext({ organizationId }, () =>
      this.prisma.ingredient.updateMany({
        data,
        where: scopedWhere(organizationId, {
          ...PUBLIC_MEDIA,
          id: ingredientId,
        }),
      }),
    );
    if (count === 0) {
      throw new NotFoundException('Public media', ingredientId);
    }
    await this.cacheService.invalidateByTags(COMMUNITY_CACHE_TAGS);
  }

  private async writeCreator(
    organizationId: string,
    brandId: string,
    data: { isHighlighted: boolean; scope?: typeof UNPUBLISHED_SCOPE },
  ): Promise<void> {
    const { count } = await runWithTenantContext({ organizationId }, () =>
      this.prisma.brand.updateMany({
        data,
        where: scopedWhere(organizationId, {
          id: brandId,
          scope: PUBLIC_SCOPE,
        }),
      }),
    );
    if (count === 0) {
      throw new NotFoundException('Public profile', brandId);
    }
    await this.cacheService.invalidateByTags(COMMUNITY_CACHE_TAGS);
  }
}
