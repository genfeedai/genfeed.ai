import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { AnalyzeToneDto } from '@api/collections/profiles/dto/analyze-tone.dto';
import { ApplyProfileDto } from '@api/collections/profiles/dto/apply-profile.dto';
import { CreateProfileDto } from '@api/collections/profiles/dto/create-profile.dto';
import { GenerateFromExamplesDto } from '@api/collections/profiles/dto/generate-from-examples.dto';
import { UpdateProfileDto } from '@api/collections/profiles/dto/update-profile.dto';
import { ProfilesService } from '@api/collections/profiles/services/profiles.service';
import { OrganizationModule } from '@api/common/organization-modules/organization-module.decorator';
import {
  Credits,
  DeferCreditsUntilModelResolution,
} from '@api/helpers/decorators/credits/credits.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import type { CreditsGuardRequest } from '@api/helpers/guards/credits/credits.guard';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { TenantReadPolicy } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { resolveTenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.context';
import { finalizeDeferredTextCredits } from '@api/helpers/utils/credits/finalize-deferred-credits.util';
import {
  assertOrganizationCreditsAvailable,
  getDefaultTextMinimumCredits,
} from '@api/helpers/utils/credits/organization-credits-gate.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { ActivitySource, ByokProvider } from '@genfeedai/contracts';
import { ProfileSerializer } from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@AutoSwagger()
@ApiTags('Profiles')
@Controller('profiles')
@UseInterceptors(CreditsInterceptor)
@OrganizationModule('playground')
export class ProfilesController {
  constructor(
    private readonly profilesService: ProfilesService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly modelsService: ModelsService,
  ) {}

  /**
   * Create a new profile
   */
  @Post()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async create(
    @Req() req: Request,
    @Body() dto: CreateProfileDto,
    @CurrentUser() user: User,
  ) {
    const organization = user.organizationId;
    const profile = await this.profilesService.create(
      dto,
      organization,
      user.id,
    );
    return serializeSingle(req, ProfileSerializer, profile);
  }

  /**
   * Get all profiles
   */
  @TenantReadPolicy('selected')
  @Get()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Query('search') search?: string,
    @Query('isDefault') isDefault?: string,
  ) {
    const organization = resolveTenantReadScope(user).organizationId;

    const docs = await this.profilesService.findAll(organization, {
      isDefault: isDefault ? isDefault === 'true' : undefined,
      search,
    });
    return serializeCollection(req, ProfileSerializer, { docs });
  }

  /**
   * Get one profile
   */
  @TenantReadPolicy('selected')
  @Get(':profileId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findOne(
    @Req() req: Request,
    @Param('profileId') profileId: string,
    @CurrentUser() user: User,
  ) {
    const organization = resolveTenantReadScope(user).organizationId;
    const profile = await this.profilesService.findOne(profileId, organization);
    return serializeSingle(req, ProfileSerializer, profile);
  }

  /**
   * Update profile
   */
  @Patch(':profileId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async update(
    @Req() req: Request,
    @Param('profileId') profileId: string,
    @Body() dto: UpdateProfileDto,
    @CurrentUser() user: User,
  ) {
    const organization = user.organizationId;
    const profile = await this.profilesService.update(
      profileId,
      dto,
      organization,
    );
    return serializeSingle(req, ProfileSerializer, profile);
  }

  /**
   * Delete profile
   */
  @Delete(':profileId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async remove(
    @Param('profileId') profileId: string,
    @CurrentUser() user: User,
  ) {
    const organization = user.organizationId;
    await this.profilesService.remove(profileId, organization);
    return { message: 'Profile deleted successfully' };
  }

  /**
   * Apply profile to prompt
   */
  @Post(':profileId/apply')
  @UseGuards(CreditsGuard)
  @Credits({
    allowByokBypass: true,
    description: 'Profile prompt application (text model)',
    provider: ByokProvider.OPENROUTER,
    source: ActivitySource.SCRIPT,
  })
  @DeferCreditsUntilModelResolution()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async applyProfile(
    @Req() request: Request,
    @Body() dto: ApplyProfileDto,
    @CurrentUser() user: User,
  ) {
    const organization = user.organizationId;
    const creditsConfig = (request as CreditsGuardRequest).creditsConfig;
    if (!creditsConfig?.isByokBypass) {
      await assertOrganizationCreditsAvailable(
        this.creditsUtilsService,
        organization,
        await getDefaultTextMinimumCredits(this.modelsService),
      );
    }

    let billedCredits = 0;
    const result = await this.profilesService.applyProfile(
      dto,
      organization,
      (amount) => {
        billedCredits += amount;
      },
      creditsConfig?.byokApiKeyOverride,
    );

    finalizeDeferredTextCredits(request, billedCredits);

    return result;
  }

  /**
   * Analyze content for tone compliance
   */
  @Post(':profileId/analyze')
  @UseGuards(CreditsGuard)
  @Credits({
    allowByokBypass: true,
    description: 'Profile tone analysis (text model)',
    provider: ByokProvider.OPENROUTER,
    source: ActivitySource.SCRIPT,
  })
  @DeferCreditsUntilModelResolution()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async analyzeTone(
    @Req() request: Request,
    @Body() dto: AnalyzeToneDto,
    @CurrentUser() user: User,
  ) {
    const organization = user.organizationId;
    const creditsConfig = (request as CreditsGuardRequest).creditsConfig;
    if (!creditsConfig?.isByokBypass) {
      await assertOrganizationCreditsAvailable(
        this.creditsUtilsService,
        organization,
        await getDefaultTextMinimumCredits(this.modelsService),
      );
    }

    let billedCredits = 0;
    const result = await this.profilesService.analyzeTone(
      dto,
      organization,
      (amount) => {
        billedCredits += amount;
      },
      creditsConfig?.byokApiKeyOverride,
    );

    finalizeDeferredTextCredits(request, billedCredits);

    return result;
  }

  /**
   * Generate profile from examples
   */
  @Post('generate')
  @UseGuards(CreditsGuard)
  @Credits({
    allowByokBypass: true,
    description: 'Profile generation from examples (text model)',
    provider: ByokProvider.OPENROUTER,
    source: ActivitySource.SCRIPT,
  })
  @DeferCreditsUntilModelResolution()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async generateFromExamples(
    @Req() req: Request,
    @Body() dto: GenerateFromExamplesDto,
    @CurrentUser() user: User,
  ) {
    const organization = user.organizationId;
    const creditsConfig = (req as CreditsGuardRequest).creditsConfig;
    if (!creditsConfig?.isByokBypass) {
      await assertOrganizationCreditsAvailable(
        this.creditsUtilsService,
        organization,
        await getDefaultTextMinimumCredits(this.modelsService),
      );
    }

    let billedCredits = 0;
    const profile = await this.profilesService.generateFromExamples(
      dto,
      organization,
      user.id,
      (amount) => {
        billedCredits += amount;
      },
      creditsConfig?.byokApiKeyOverride,
    );

    finalizeDeferredTextCredits(req, billedCredits);

    return serializeSingle(req, ProfileSerializer, profile);
  }
}
