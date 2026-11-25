import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { verifyBrandAccess } from '@api/collections/brands/controllers/brand-access.helpers';
import { BrandReadScopes } from '@api/collections/brands/decorators/brand-read-scopes.decorator';
import { BrandReachService } from '@api/collections/brands/services/brand-reach.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { TenantReadPolicy } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { InputValidationUtil } from '@api/helpers/utils/input-validation/input-validation.util';
import type { IPublicBrandReach } from '@genfeedai/contracts/interfaces';
import { Controller, Get, Param, UseGuards } from '@nestjs/common';

/**
 * The totals a brand's private profile shows to its own organization. The same
 * sums the public profile shows, but available while the brand is private and
 * whatever the Public analytics setting says: that setting hides numbers from
 * visitors, never from the owner.
 */
@AutoSwagger()
@Controller('brands/:brandId/reach')
@UseGuards(RolesGuard)
@BrandReadScopes()
export class BrandReachController {
  constructor(
    private readonly brandsService: BrandsService,
    private readonly brandReachService: BrandReachService,
  ) {}

  /** Lifetime views, impressions and engagements across the platforms. */
  @TenantReadPolicy('owner')
  @Get()
  async findBrandReach(
    @CurrentUser() user: AuthenticatedUser,
    @Param('brandId') brandId: string,
  ): Promise<{ data: IPublicBrandReach }> {
    const id = InputValidationUtil.validateEntityId(brandId, 'brandId');
    const brand = await verifyBrandAccess(this.brandsService, id, user);

    return {
      data: await this.brandReachService.findForBrand(
        brand.id,
        brand.organizationId,
      ),
    };
  }
}
