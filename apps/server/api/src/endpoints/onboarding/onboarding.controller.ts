import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { verifyBrandAccess } from '@api/collections/brands/controllers/brand-access.helpers';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import {
  OnboardingDraftsDto,
  OnboardingScanDto,
} from '@api/endpoints/onboarding/dto/onboarding-first-drafts.dto';
import { SetPrefixDto } from '@api/endpoints/onboarding/dto/set-prefix.dto';
import { OnboardingService } from '@api/endpoints/onboarding/onboarding.service';
import { OnboardingFirstDraftsService } from '@api/endpoints/onboarding/services/onboarding-first-drafts.service';
import { SkipRoles } from '@api/helpers/decorators/roles/roles.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { TenantReadPolicy } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

/**
 * OnboardingController
 *
 * Genuine onboarding actions only. The resource-shaped writes that used to live
 * here (brand-name, brand confirm, reference-images, skip, account-type,
 * complete-funnel, brand-setup) were dissolved into their canonical resources
 * per REST audit #1354:
 * - brand rename / confirm / scrape / reference-images → `/brands/*`
 * - account-type → `PATCH /organizations/:id`
 * - skip → `PATCH /organizations/:id/settings { isFirstLogin: false }`
 * - complete-funnel → `PATCH /users/me { isOnboardingCompleted: true }`
 */
@ApiTags('Onboarding')
@AutoSwagger()
@Controller('onboarding')
@UseGuards(RolesGuard)
export class OnboardingController {
  constructor(
    private readonly brandsService: BrandsService,
    private readonly firstDraftsService: OnboardingFirstDraftsService,
    private readonly onboardingService: OnboardingService,
    readonly _loggerService: LoggerService,
  ) {}

  /**
   * Get onboarding status for current user
   */
  @Get('status')
  @SkipRoles()
  @ApiOperation({ summary: 'Get onboarding status' })
  @ApiResponse({
    description: 'Returns onboarding status',
    schema: {
      properties: {
        hasCompletedOnboarding: { type: 'boolean' },
        isFirstLogin: { type: 'boolean' },
      },
      type: 'object',
    },
    status: 200,
  })
  getStatus(@CurrentUser() user: User) {
    return this.onboardingService.getOnboardingStatus(user);
  }

  @Get('install-readiness')
  @SkipRoles()
  @ApiOperation({
    summary: 'Get install readiness for OSS onboarding',
  })
  getInstallReadiness(@CurrentUser() user: User) {
    return this.onboardingService.getInstallReadiness(user);
  }

  /**
   * Check if a prefix is available
   */
  @Get('prefix/:prefix/available')
  @SkipRoles()
  @ApiOperation({
    description: 'Checks if a 3-letter prefix is available for use.',
    summary: 'Check prefix availability',
  })
  @ApiResponse({
    description: 'Returns availability status',
    schema: {
      properties: {
        isAvailable: { type: 'boolean' },
        prefix: { type: 'string' },
      },
      type: 'object',
    },
    status: 200,
  })
  async checkPrefixAvailable(@Param('prefix') prefix: string) {
    const normalized = prefix.toUpperCase();
    const isAvailable =
      await this.onboardingService.checkPrefixAvailable(normalized);
    return { isAvailable, prefix: normalized };
  }

  /**
   * Set organization prefix during onboarding
   * Prefix is immutable once set — used for issue identifiers (e.g., GEN-42)
   */
  @Post('prefix')
  @HttpCode(200)
  @ApiOperation({
    description:
      'Sets the unique 3-letter uppercase prefix for the organization. Used for issue identifiers. Immutable once set.',
    summary: 'Set organization prefix',
  })
  @ApiResponse({
    description: 'Prefix set successfully',
    schema: {
      properties: {
        message: { type: 'string' },
        prefix: { type: 'string' },
        success: { type: 'boolean' },
      },
      type: 'object',
    },
    status: 200,
  })
  @ApiResponse({
    description: 'Prefix already set or taken',
    status: 409,
  })
  setPrefix(@Body() dto: SetPrefixDto, @CurrentUser() user: User) {
    return this.onboardingService.setPrefix(user, dto.prefix);
  }

  /** Read a public link and prefill the brand from it. */
  @Post('brands/:brandId/scan')
  @HttpCode(200)
  @ApiOperation({
    description:
      'Reads one public link about the brand and prefills its identity. A failed read is reported in the body, not as an error.',
    summary: 'Scan a brand link during onboarding',
  })
  async scanBrand(
    @CurrentUser() user: User,
    @Param('brandId') brandId: string,
    @Body() dto: OnboardingScanDto,
  ) {
    await verifyBrandAccess(this.brandsService, brandId, user);
    return this.firstDraftsService.scan(user, brandId, dto.url);
  }

  @TenantReadPolicy('owner')
  @Get('brands/:brandId/drafts')
  @ApiOperation({
    summary: 'Recover saved onboarding content without generating',
  })
  async readDrafts(
    @CurrentUser() user: User,
    @Param('brandId') brandId: string,
  ) {
    await verifyBrandAccess(this.brandsService, brandId, user);
    return this.firstDraftsService.read(user, brandId);
  }

  /** Draft one post each for X, Instagram, TikTok and LinkedIn with shared media. */
  @Post('brands/:brandId/drafts')
  @HttpCode(200)
  @ApiOperation({
    description:
      'Writes first drafts for the brand with a cheap text model and one shared image. Optional context from the retry round is saved on the brand. Nothing is published.',
    summary: 'Generate first drafts during onboarding',
  })
  async generateDrafts(
    @CurrentUser() user: User,
    @Param('brandId') brandId: string,
    @Body() dto: OnboardingDraftsDto,
  ) {
    await verifyBrandAccess(this.brandsService, brandId, user);
    return this.firstDraftsService.generate(user, brandId, dto);
  }

  /** Regenerate the image or video a saved run is missing. */
  @Post('brands/:brandId/drafts/media')
  @HttpCode(200)
  @ApiOperation({
    description:
      'Generates again only the image or video the latest onboarding run is missing. Saved drafts and media that came back are kept. A run has a small number of retries, and nothing is published.',
    summary: 'Retry missing onboarding media',
  })
  async retryDraftMedia(
    @CurrentUser() user: User,
    @Param('brandId') brandId: string,
  ) {
    await verifyBrandAccess(this.brandsService, brandId, user);
    return this.firstDraftsService.retryMedia(user, brandId);
  }
}
