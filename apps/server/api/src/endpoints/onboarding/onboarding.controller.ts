import { SetAccountTypeDto } from '@api/endpoints/onboarding/dto/account-type.dto';
import {
  BrandSetupDto,
  ConfirmBrandDataDto,
  SkipOnboardingDto,
  UpdateBrandNameDto,
} from '@api/endpoints/onboarding/dto/brand-setup.dto';
import { GeneratePreviewDto } from '@api/endpoints/onboarding/dto/generate-preview.dto';
import { AddReferenceImagesDto } from '@api/endpoints/onboarding/dto/reference-images.dto';
import { SetPrefixDto } from '@api/endpoints/onboarding/dto/set-prefix.dto';
import { OnboardingService } from '@api/endpoints/onboarding/onboarding.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import type { User } from '@clerk/backend';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('Onboarding')
@AutoSwagger()
@Controller('onboarding')
@UseGuards(RolesGuard)
export class OnboardingController {
  constructor(
    private readonly onboardingService: OnboardingService,
    readonly _loggerService: LoggerService,
  ) {}

  /**
   * Get onboarding status for current user
   */
  @Get('status')
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

  /**
   * Setup brand from URL
   * Scrapes website, analyzes with AI, and populates the canonical brand guidance
   */
  @Post('brand-setup')
  @HttpCode(200)
  @ApiOperation({
    description:
      'Scrapes the provided brand URL, extracts brand information, and stores the canonical brand guidance directly on the brand.',
    summary: 'Setup brand from website URL',
  })
  @ApiResponse({
    description: 'Brand setup completed successfully',
    schema: {
      properties: {
        brandId: { type: 'string' },
        extractedData: {
          properties: {
            brandVoice: {
              properties: {
                audience: { type: 'string' },
                hashtags: { items: { type: 'string' }, type: 'array' },
                taglines: { items: { type: 'string' }, type: 'array' },
                tone: { type: 'string' },
                values: { items: { type: 'string' }, type: 'array' },
                voice: { type: 'string' },
              },
              type: 'object',
            },
            companyName: { type: 'string' },
            description: { type: 'string' },
            logoUrl: { type: 'string' },
            primaryColor: { type: 'string' },
            secondaryColor: { type: 'string' },
            sourceUrl: { type: 'string' },
            tagline: { type: 'string' },
          },
          type: 'object',
        },
        message: { type: 'string' },
        success: { type: 'boolean' },
      },
      type: 'object',
    },
    status: 200,
  })
  @ApiResponse({
    description: 'Invalid URL or scraping failed',
    status: 400,
  })
  setupBrand(@Body() dto: BrandSetupDto, @CurrentUser() user: User) {
    return this.onboardingService.setupBrand(dto, user);
  }

  /**
   * Update brand name without scanning a website
   */
  @Patch('brand-name')
  @ApiOperation({
    description:
      'Updates the brand and organization name without requiring a website scan.',
    summary: 'Update brand name only',
  })
  @ApiResponse({
    description: 'Brand name updated successfully',
    schema: {
      properties: {
        message: { type: 'string' },
        success: { type: 'boolean' },
      },
      type: 'object',
    },
    status: 200,
  })
  updateBrandName(@Body() dto: UpdateBrandNameDto, @CurrentUser() user: User) {
    return this.onboardingService.updateBrandName(dto, user);
  }

  /**
   * Confirm and optionally override extracted brand data
   */
  @Patch('brand/:brandId/confirm')
  @ApiOperation({
    description:
      'Allows user to review and override the extracted brand data before finalizing.',
    summary: 'Confirm extracted brand data with optional overrides',
  })
  @ApiResponse({
    description: 'Brand data confirmed',
    schema: {
      properties: {
        message: { type: 'string' },
        success: { type: 'boolean' },
      },
      type: 'object',
    },
    status: 200,
  })
  confirmBrandData(
    @Param('brandId') brandId: string,
    @Body() dto: ConfirmBrandDataDto,
    @CurrentUser() user: User,
  ) {
    return this.onboardingService.confirmBrandData(brandId, dto, user);
  }

  /**
   * Skip onboarding for users who want to set up later
   */
  @Post('skip')
  @HttpCode(200)
  @ApiOperation({
    description:
      'Marks onboarding as skipped. User can set up their brand later from settings.',
    summary: 'Skip onboarding',
  })
  @ApiResponse({
    description: 'Onboarding skipped',
    schema: {
      properties: {
        message: { type: 'string' },
        success: { type: 'boolean' },
      },
      type: 'object',
    },
    status: 200,
  })
  skipOnboarding(@Body() _dto: SkipOnboardingDto, @CurrentUser() user: User) {
    return this.onboardingService.skipOnboarding(user);
  }

  /**
   * Check if a prefix is available
   */
  @Get('prefix/:prefix/available')
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

  /**
   * Set account type (Creator/Business/Agency) during onboarding funnel
   */
  @Post('account-type')
  @HttpCode(200)
  @ApiOperation({
    description:
      'Sets the organization category and updates Clerk metadata during the onboarding funnel.',
    summary: 'Set account type',
  })
  @ApiResponse({
    description: 'Account type set successfully',
    schema: {
      properties: {
        message: { type: 'string' },
        success: { type: 'boolean' },
      },
      type: 'object',
    },
    status: 200,
  })
  setAccountType(@Body() dto: SetAccountTypeDto, @CurrentUser() user: User) {
    return this.onboardingService.setAccountType(user, dto.category);
  }

  /**
   * Complete the onboarding funnel (called after Stripe payment succeeds)
   */
  @Post('complete-funnel')
  @HttpCode(200)
  @ApiOperation({
    description:
      'Marks the onboarding funnel as completed in Clerk metadata. Called after successful Stripe payment.',
    summary: 'Complete onboarding funnel',
  })
  @ApiResponse({
    description: 'Funnel completed successfully',
    schema: {
      properties: {
        message: { type: 'string' },
        success: { type: 'boolean' },
      },
      type: 'object',
    },
    status: 200,
  })
  completeFunnel(@CurrentUser() user: User) {
    return this.onboardingService.completeFunnel(user);
  }

  @Get('proactive-workspace')
  @ApiOperation({
    description:
      'Returns the prepared proactive onboarding workspace for an invited lead.',
    summary: 'Get proactive workspace',
  })
  getProactiveWorkspace(@CurrentUser() user: User) {
    return this.onboardingService.getProactiveWorkspace(user);
  }

  @Post('proactive-claim')
  @HttpCode(200)
  @ApiOperation({
    description:
      'Claims the prepared proactive onboarding workspace for the current invited user.',
    summary: 'Claim proactive workspace',
  })
  claimProactiveWorkspace(@CurrentUser() user: User) {
    return this.onboardingService.claimProactiveWorkspace(user);
  }

  /**
   * Generate AI preview image during onboarding
   */
  @Post('generate-preview')
  @HttpCode(200)
  @ApiOperation({
    description:
      'Generates an AI preview image based on the brand data and selected content type. Deducts onboarding credits.',
    summary: 'Generate AI preview image during onboarding',
  })
  @ApiResponse({
    description: 'Preview image generated successfully',
    schema: {
      properties: {
        imageUrl: { type: 'string' },
        prompt: { type: 'string' },
      },
      type: 'object',
    },
    status: 200,
  })
  @ApiResponse({
    description: 'Brand not found or insufficient credits',
    status: 402,
  })
  generatePreview(@Body() dto: GeneratePreviewDto, @CurrentUser() user: User) {
    return this.onboardingService.generateOnboardingPreview(dto, user);
  }

  /**
   * Add reference images to a brand during onboarding
   */
  @Post('brand/:brandId/reference-images')
  @HttpCode(200)
  @ApiOperation({
    description:
      'Adds reference images (face, product, style, logo) to a brand for consistent content generation.',
    summary: 'Add reference images to brand',
  })
  @ApiResponse({
    description: 'Reference images added successfully',
    schema: {
      properties: {
        count: { type: 'number' },
        success: { type: 'boolean' },
      },
      type: 'object',
    },
    status: 200,
  })
  addReferenceImages(
    @Param('brandId') brandId: string,
    @Body() dto: AddReferenceImagesDto,
    @CurrentUser() user: User,
  ) {
    return this.onboardingService.addReferenceImages(brandId, dto.images, user);
  }
}
