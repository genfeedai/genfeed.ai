import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CACHE_TAGS } from '@api/common/constants/cache-patterns.constants';
import { PublicBrandReachService } from '@api/endpoints/public/services/public-brand-reach.service';
import { Cache } from '@api/helpers/decorators/cache/cache.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import { AssetScope } from '@genfeedai/contracts';
import type { IPublicBrandReach } from '@genfeedai/contracts/interfaces';
import { Public } from '@libs/decorators/public.decorator';
import { Controller, Get, Param } from '@nestjs/common';

/**
 * The totals a public profile shows next to the creator's name. Sums only: no
 * post, platform or account is named, and a brand that is missing or not
 * public answers null.
 */
@AutoSwagger()
@Public()
@Controller('public/brands')
export class PublicBrandReachController {
  constructor(
    private readonly brandsService: BrandsService,
    private readonly publicBrandReachService: PublicBrandReachService,
  ) {}

  /** Lifetime views, impressions and engagements across the platforms. */
  @Get(':brandId/reach')
  @Cache({
    keyGenerator: (req) =>
      `public:brand:${req.params?.brandId ?? 'unknown'}:reach`,
    tags: ['brands', 'reach', CACHE_TAGS.PUBLIC_BRAND_CONTENT],
    ttl: 1800, // 30 minutes: analytics sync a few times a day
  })
  async findBrandReach(
    @Param('brandId') brandId: string,
  ): Promise<{ data: IPublicBrandReach | null }> {
    if (!isEntityId(brandId)) {
      return { data: null };
    }

    const brand = await this.brandsService.findOne(
      { id: brandId, isDeleted: false, scope: AssetScope.PUBLIC },
      'none',
    );

    if (!brand) {
      return { data: null };
    }

    return {
      data: await this.publicBrandReachService.findForBrand(
        brandId,
        brand.organizationId,
      ),
    };
  }
}
