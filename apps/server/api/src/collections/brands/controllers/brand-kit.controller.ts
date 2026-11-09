import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { verifyBrandAccess } from '@api/collections/brands/controllers/brand-access.helpers';
import { FillPlatformSlotsDto } from '@api/collections/brands/dto/fill-platform-slots.dto';
import { BrandKitAssetsService } from '@api/collections/brands/services/brand-kit-assets.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { InputValidationUtil } from '@api/helpers/utils/input-validation/input-validation.util';
import { ApiKeyScope, MemberRole } from '@genfeedai/contracts';
import type { IBrandKitPlatformFillResult } from '@genfeedai/contracts/interfaces';
import {
  Body,
  Controller,
  ForbiddenException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

/** The brand kit as a whole: logo variants, platform images and their slots. */
@AutoSwagger()
@Controller('brands/:brandId/kit')
@UseGuards(RolesGuard)
export class BrandKitController {
  constructor(
    private readonly brandsService: BrandsService,
    private readonly brandKitAssets: BrandKitAssetsService,
  ) {}

  /** Resize the master banner into the chosen platform image slots. */
  @Post('platform-images/from-master')
  @RequiredScopes(ApiKeyScope.BRANDS_WRITE)
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
  async fillPlatformImagesFromMaster(
    @CurrentUser() user: AuthenticatedUser,
    @Param('brandId') brandId: string,
    @Body() dto: FillPlatformSlotsDto,
  ): Promise<{ data: IBrandKitPlatformFillResult[] }> {
    const organizationId = user.organizationId;
    const userId = user.userId ?? user.id;
    if (!organizationId || !userId) {
      throw new ForbiddenException('brand_kit_access_denied');
    }
    const id = InputValidationUtil.validateEntityId(brandId, 'brandId');
    await verifyBrandAccess(this.brandsService, id, user);
    const data = await this.brandKitAssets.fillPlatformSlotsFromMaster(
      id,
      organizationId,
      userId,
      dto.slots,
    );
    return { data };
  }
}
