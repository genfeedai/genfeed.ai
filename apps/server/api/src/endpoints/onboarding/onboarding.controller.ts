import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { GeneratePreviewDto } from '@api/endpoints/onboarding/dto/generate-preview.dto';
import { SetPrefixDto } from '@api/endpoints/onboarding/dto/set-prefix.dto';
import { OnboardingService } from '@api/endpoints/onboarding/onboarding.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
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

  @Get('install-readiness')
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
}
