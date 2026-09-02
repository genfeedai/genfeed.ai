import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { verifyBrandAccess } from '@api/collections/brands/controllers/brand-access.helpers';
import { WebsitePreviewDto } from '@api/collections/brands/dto/website-preview.dto';
import { BrandSetupService } from '@api/collections/brands/services/brand-setup.service';
import { BrandWebsitePreviewService } from '@api/collections/brands/services/brand-website-preview.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { BrandSetupDto } from '@api/endpoints/onboarding/dto/brand-setup.dto';
import { AddReferenceImagesDto } from '@api/endpoints/onboarding/dto/reference-images.dto';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';

@AutoSwagger()
@Controller('brands')
@UseGuards(RolesGuard)
export class BrandsSetupController {
  constructor(
    private readonly brandsService: BrandsService,
    private readonly brandSetupService: BrandSetupService,
    private readonly brandWebsitePreviewService: BrandWebsitePreviewService,
    public readonly loggerService: LoggerService,
  ) {}

  /** Prefill create-brand form fields from a public website. */
  @Post('website-preview')
  @HttpCode(HttpStatus.OK)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @ApiOperation({
    operationId: 'BrandsController.previewWebsite',
    summary: 'previewWebsite',
  })
  previewWebsite(@Body() dto: WebsitePreviewDto) {
    return this.brandWebsitePreviewService.previewWebsite(dto.websiteUrl);
  }

  /** Scrape and populate the canonical guidance for an explicit brand. */
  @Post(':id/scrape')
  @HttpCode(HttpStatus.OK)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @ApiOperation({
    operationId: 'BrandsController.scrapeBrand',
    summary: 'scrapeBrand',
  })
  async scrapeBrand(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: BrandSetupDto,
  ) {
    await verifyBrandAccess(this.brandsService, id, user);
    return this.brandSetupService.setupBrand(id, dto, user);
  }

  /** Add face, product, style, or logo reference images to a brand. */
  @Post(':id/reference-images')
  @HttpCode(HttpStatus.OK)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @ApiOperation({
    operationId: 'BrandsController.addReferenceImages',
    summary: 'addReferenceImages',
  })
  async addReferenceImages(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: AddReferenceImagesDto,
  ) {
    await verifyBrandAccess(this.brandsService, id, user);
    return this.brandSetupService.addReferenceImages(id, dto.images, user);
  }
}
