import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { baseModelKey } from '@api/collections/models/utils/model-key.util';
import { AnalyzeToneDto } from '@api/collections/profiles/dto/analyze-tone.dto';
import { ApplyProfileDto } from '@api/collections/profiles/dto/apply-profile.dto';
import { CreateProfileDto } from '@api/collections/profiles/dto/create-profile.dto';
import { GenerateFromExamplesDto } from '@api/collections/profiles/dto/generate-from-examples.dto';
import { UpdateProfileDto } from '@api/collections/profiles/dto/update-profile.dto';
import { ProfilesService } from '@api/collections/profiles/services/profiles.service';
import { DEFAULT_TEXT_MODEL } from '@api/constants/default-text-model.constant';
import {
  Credits,
  DeferCreditsUntilModelResolution,
} from '@api/helpers/decorators/credits/credits.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { getMinimumTextCredits } from '@api/helpers/utils/text-pricing/text-pricing.util';
import type { User } from '@clerk/backend';
import { ActivitySource } from '@genfeedai/enums';
import { ProfileSerializer } from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
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
export class ProfilesController {
  private static readonly TEXT_MAX_OVERDRAFT_CREDITS = 5;

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
    const { organization } = getPublicMetadata(user);
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
  @Get()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Query('search') search?: string,
    @Query('isDefault') isDefault?: string,
  ) {
    const { organization } = getPublicMetadata(user);

    const docs = await this.profilesService.findAll(organization, {
      isDefault: isDefault ? isDefault === 'true' : undefined,
      search,
    });
    return serializeCollection(req, ProfileSerializer, { docs });
  }

  /**
   * Get one profile
   */
  @Get(':profileId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findOne(
    @Req() req: Request,
    @Param('profileId') profileId: string,
    @CurrentUser() user: User,
  ) {
    const { organization } = getPublicMetadata(user);
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
    const { organization } = getPublicMetadata(user);
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
    const { organization } = getPublicMetadata(user);
    await this.profilesService.remove(profileId, organization);
    return { message: 'Profile deleted successfully' };
  }

  /**
   * Apply profile to prompt
   */
  @Post(':profileId/apply')
  @UseGuards(SubscriptionGuard, CreditsGuard)
  @Credits({
    description: 'Profile prompt application (text model)',
    source: ActivitySource.SCRIPT,
  })
  @DeferCreditsUntilModelResolution()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async applyProfile(
    @Req() request: Request,
    @Body() dto: ApplyProfileDto,
    @CurrentUser() user: User,
  ) {
    const { organization } = getPublicMetadata(user);
    await this.assertOrganizationCreditsAvailable(
      organization,
      await this.getDefaultTextMinimumCredits(),
    );

    let billedCredits = 0;
    const result = await this.profilesService.applyProfile(
      dto,
      organization,
      (amount) => {
        billedCredits += amount;
      },
    );

    this.finalizeDeferredCredits(request, billedCredits);

    return result;
  }

  /**
   * Analyze content for tone compliance
   */
  @Post(':profileId/analyze')
  @UseGuards(SubscriptionGuard, CreditsGuard)
  @Credits({
    description: 'Profile tone analysis (text model)',
    source: ActivitySource.SCRIPT,
  })
  @DeferCreditsUntilModelResolution()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async analyzeTone(
    @Req() request: Request,
    @Body() dto: AnalyzeToneDto,
    @CurrentUser() user: User,
  ) {
    const { organization } = getPublicMetadata(user);
    await this.assertOrganizationCreditsAvailable(
      organization,
      await this.getDefaultTextMinimumCredits(),
    );

    let billedCredits = 0;
    const result = await this.profilesService.analyzeTone(
      dto,
      organization,
      (amount) => {
        billedCredits += amount;
      },
    );

    this.finalizeDeferredCredits(request, billedCredits);

    return result;
  }

  /**
   * Get default profile
   */
  @Get('default')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getDefault(@Req() req: Request, @CurrentUser() user: User) {
    const { organization } = getPublicMetadata(user);
    const profile = await this.profilesService.getDefault(organization);
    return serializeSingle(req, ProfileSerializer, profile);
  }

  /**
   * Generate profile from examples
   */
  @Post('generate')
  @UseGuards(SubscriptionGuard, CreditsGuard)
  @Credits({
    description: 'Profile generation from examples (text model)',
    source: ActivitySource.SCRIPT,
  })
  @DeferCreditsUntilModelResolution()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async generateFromExamples(
    @Req() req: Request,
    @Body() dto: GenerateFromExamplesDto,
    @CurrentUser() user: User,
  ) {
    const { organization } = getPublicMetadata(user);
    await this.assertOrganizationCreditsAvailable(
      organization,
      await this.getDefaultTextMinimumCredits(),
    );

    let billedCredits = 0;
    const profile = await this.profilesService.generateFromExamples(
      dto,
      organization,
      user.id,
      (amount) => {
        billedCredits += amount;
      },
    );

    this.finalizeDeferredCredits(req, billedCredits);

    return serializeSingle(req, ProfileSerializer, profile);
  }

  private async assertOrganizationCreditsAvailable(
    organizationId: string,
    requiredCredits: number,
  ): Promise<void> {
    if (requiredCredits <= 0) {
      return;
    }

    const hasCredits =
      await this.creditsUtilsService.checkOrganizationCreditsAvailable(
        organizationId,
        requiredCredits,
      );

    if (hasCredits) {
      return;
    }

    const balance =
      await this.creditsUtilsService.getOrganizationCreditsBalance(
        organizationId,
      );

    throw new HttpException(
      {
        detail: `Insufficient credits: ${requiredCredits} required, ${balance} available`,
        title: 'Insufficient credits',
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }

  private async getDefaultTextMinimumCredits(): Promise<number> {
    const model = await this.modelsService.findOne({
      isDeleted: false,
      key: baseModelKey(DEFAULT_TEXT_MODEL),
    });

    if (!model) {
      return 0;
    }

    if (model.pricingType === 'per-token') {
      return getMinimumTextCredits(model);
    }

    return model.cost || 0;
  }

  private finalizeDeferredCredits(request: Request, amount: number): void {
    const reqWithCredits = request as Request & {
      creditsConfig?: {
        amount?: number;
        deferred?: boolean;
        maxOverdraftCredits?: number;
      };
    };

    if (!reqWithCredits.creditsConfig?.deferred) {
      return;
    }

    reqWithCredits.creditsConfig = {
      ...reqWithCredits.creditsConfig,
      amount,
      deferred: false,
      maxOverdraftCredits: ProfilesController.TEXT_MAX_OVERDRAFT_CREDITS,
    };
  }
}
