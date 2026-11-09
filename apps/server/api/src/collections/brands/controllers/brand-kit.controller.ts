import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { verifyBrandAccess } from '@api/collections/brands/controllers/brand-access.helpers';
import { BrandReadScopes } from '@api/collections/brands/decorators/brand-read-scopes.decorator';
import { FillPlatformSlotsDto } from '@api/collections/brands/dto/fill-platform-slots.dto';
import type { BrandFontActor } from '@api/collections/brands/services/brand-font-assets.service';
import { BrandKitAssetsService } from '@api/collections/brands/services/brand-kit-assets.service';
import { BrandKitBundleService } from '@api/collections/brands/services/brand-kit-bundle.service';
import { BrandLogoColorsService } from '@api/collections/brands/services/brand-logo-colors.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { TenantReadPolicy } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { UploadValidationPipe } from '@api/helpers/pipes/upload-validation';
import { InputValidationUtil } from '@api/helpers/utils/input-validation/input-validation.util';
import { ApiKeyScope, MemberRole } from '@genfeedai/contracts';
import { BRAND_KIT_BUNDLE_MAX_BYTES } from '@genfeedai/contracts/api-types/contracts/brand-kit-bundle.contract';
import type {
  IBrandKitImportResult,
  IBrandKitLogoColor,
  IBrandKitPlatformFillResult,
  IBrandKitView,
} from '@genfeedai/contracts/interfaces';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes } from '@nestjs/swagger';
import type { Response } from 'express';

/**
 * The brand kit as a whole: logo variants, platform images and their slots,
 * plus reading, downloading and importing the full kit (#9710).
 */
@AutoSwagger()
@Controller('brands/:brandId/kit')
@UseGuards(RolesGuard)
@BrandReadScopes()
export class BrandKitController {
  constructor(
    private readonly brandsService: BrandsService,
    private readonly brandKitAssets: BrandKitAssetsService,
    private readonly logoColors: BrandLogoColorsService,
    private readonly bundles: BrandKitBundleService,
  ) {}

  /** Checks brand access and returns who is acting on which brand. */
  private async actor(
    user: AuthenticatedUser,
    brandId: string,
  ): Promise<BrandFontActor> {
    const actorId = user.userId ?? user.id;
    if (!user.organizationId || !actorId) {
      throw new ForbiddenException('brand_kit_access_denied');
    }
    const id = InputValidationUtil.validateEntityId(brandId, 'brandId');
    await verifyBrandAccess(this.brandsService, id, user);
    return {
      actorId,
      apiKeyId: user.apiKeyId,
      brandId: id,
      isApiKey: user.isApiKey,
      organizationId: user.organizationId,
      scopes: user.scopes,
    };
  }

  /**
   * The full kit: colors, palette, fonts by role, logo variants and platform
   * images. Image URLs are signed for the caller like other brand assets.
   */
  @TenantReadPolicy('owner')
  @Get()
  async kit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('brandId') brandId: string,
  ): Promise<{ data: IBrandKitView }> {
    return { data: await this.bundles.view(await this.actor(user, brandId)) };
  }

  /** The full kit as one ZIP: every file plus a `manifest.json`. */
  @TenantReadPolicy('owner')
  @Get('export')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
  async exportKit(
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() user: AuthenticatedUser,
    @Param('brandId') brandId: string,
  ): Promise<StreamableFile> {
    const download = await this.bundles.exportBundle(
      await this.actor(user, brandId),
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(download.bytes, {
      disposition: `attachment; filename="${download.fileName}"`,
      length: download.bytes.length,
      type: 'application/zip',
    });
  }

  /** Import a kit ZIP exported from any brand into this one. */
  @Post('import')
  @RequiredScopes(ApiKeyScope.BRANDS_WRITE)
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fields: 0,
        fileSize: BRAND_KIT_BUNDLE_MAX_BYTES,
        files: 1,
        parts: 1,
      },
    }),
  )
  async importKit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('brandId') brandId: string,
    @UploadedFile(
      new UploadValidationPipe({
        allowedExtensions: ['zip'],
        allowedMimeTypes: [
          'application/zip',
          'application/x-zip-compressed',
          'application/octet-stream',
        ],
        maxSizeBytes: BRAND_KIT_BUNDLE_MAX_BYTES,
      }),
    )
    file: Express.Multer.File,
  ): Promise<{ data: IBrandKitImportResult }> {
    const actor = await this.actor(user, brandId);
    return { data: await this.bundles.importBundle(actor, file.buffer) };
  }

  /** Candidate palette colors read from the primary logo. Saves nothing. */
  @TenantReadPolicy('owner')
  @Get('logo-colors')
  async logoColorCandidates(
    @CurrentUser() user: AuthenticatedUser,
    @Param('brandId') brandId: string,
  ): Promise<{ data: IBrandKitLogoColor[] }> {
    const organizationId = user.organizationId;
    if (!organizationId) {
      throw new ForbiddenException('brand_kit_access_denied');
    }
    const id = InputValidationUtil.validateEntityId(brandId, 'brandId');
    await verifyBrandAccess(this.brandsService, id, user);
    return { data: await this.logoColors.fromPrimaryLogo(id, organizationId) };
  }

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
