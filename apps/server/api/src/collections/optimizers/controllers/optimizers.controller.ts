import type { AuthenticatedUser as User } from '@server/auth/interfaces/authenticated-user.interface';
import { CreditsUtilsService } from '@server/collections/credits/services/credits.utils.service';
import { ModelsService } from '@server/collections/models/services/models.service';
import { AnalyzeContentDto } from '@server/collections/optimizers/dto/analyze.dto';
import { GeneratePromptsDto } from '@server/collections/optimizers/dto/generate-prompts.dto';
import { SuggestHashtagsDto } from '@server/collections/optimizers/dto/hashtags.dto';
import { OptimizeContentDto } from '@server/collections/optimizers/dto/optimize.dto';
import { GenerateVariantsDto } from '@server/collections/optimizers/dto/variants.dto';
import { OptimizersService } from '@server/collections/optimizers/services/optimizers.service';
import {
  Credits,
  DeferCreditsUntilModelResolution,
} from '@api/helpers/decorators/credits/credits.decorator';
import { LogMethod } from '@server/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { finalizeDeferredTextCredits } from '@api/helpers/utils/credits/finalize-deferred-credits.util';
import {
  assertOrganizationCreditsAvailable,
  getDefaultTextMinimumCredits,
} from '@api/helpers/utils/credits/organization-credits-gate.util';
import { serializeCollection } from '@api/helpers/utils/response/response.util';
import { ActivitySource } from '@genfeedai/enums';
import { OptimizationSerializer } from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@AutoSwagger()
@ApiTags('Optimizers')
@Controller('optimizers')
@UseInterceptors(CreditsInterceptor)
export class OptimizersController {
  constructor(
    private readonly optimizersService: OptimizersService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly modelsService: ModelsService,
  ) {}

  /**
   * Analyze content and get score + suggestions
   */
  @Post('analyze')
  @UseGuards(SubscriptionGuard, CreditsGuard)
  @Credits({
    description: 'Optimizer analysis (text model)',
    source: ActivitySource.SCRIPT,
  })
  @DeferCreditsUntilModelResolution()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async analyzeContent(
    @Req() request: Request,
    @Body() dto: AnalyzeContentDto,
    @CurrentUser() user: User,
  ) {
    const organization = user.organizationId;
    await assertOrganizationCreditsAvailable(
      this.creditsUtilsService,
      organization,
      await getDefaultTextMinimumCredits(this.modelsService),
    );

    let billedCredits = 0;

    const result = await this.optimizersService.analyzeContent(
      dto,
      organization,
      user.id,
      (amount) => {
        billedCredits += amount;
      },
    );

    finalizeDeferredTextCredits(request, billedCredits);

    return result;
  }

  /**
   * Optimize content
   */
  @Post('optimize')
  @UseGuards(SubscriptionGuard, CreditsGuard)
  @Credits({
    description: 'Optimizer rewrite (text model)',
    source: ActivitySource.SCRIPT,
  })
  @DeferCreditsUntilModelResolution()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async optimizeContent(
    @Req() request: Request,
    @Body() dto: OptimizeContentDto,
    @CurrentUser() user: User,
  ) {
    const organization = user.organizationId;
    await assertOrganizationCreditsAvailable(
      this.creditsUtilsService,
      organization,
      await getDefaultTextMinimumCredits(this.modelsService),
    );

    let billedCredits = 0;

    const result = await this.optimizersService.optimizeContent(
      dto,
      organization,
      user.id,
      (amount) => {
        billedCredits += amount;
      },
    );

    finalizeDeferredTextCredits(request, billedCredits);

    return result;
  }

  /**
   * Suggest hashtags
   */
  @Post('hashtags')
  @UseGuards(SubscriptionGuard, CreditsGuard)
  @Credits({
    description: 'Hashtag suggestions (text model)',
    source: ActivitySource.SCRIPT,
  })
  @DeferCreditsUntilModelResolution()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async suggestHashtags(
    @Req() request: Request,
    @Body() dto: SuggestHashtagsDto,
    @CurrentUser() user: User,
  ) {
    const organization = user.organizationId;
    await assertOrganizationCreditsAvailable(
      this.creditsUtilsService,
      organization,
      await getDefaultTextMinimumCredits(this.modelsService),
    );

    let billedCredits = 0;

    const result = await this.optimizersService.suggestHashtags(
      dto,
      organization,
      (amount) => {
        billedCredits += amount;
      },
    );

    finalizeDeferredTextCredits(request, billedCredits);

    return result;
  }

  /**
   * Generate A/B test variants
   */
  @Post('variants')
  @UseGuards(SubscriptionGuard, CreditsGuard)
  @Credits({
    description: 'Variant generation (text model)',
    source: ActivitySource.SCRIPT,
  })
  @DeferCreditsUntilModelResolution()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async generateVariants(
    @Req() request: Request,
    @Body() dto: GenerateVariantsDto,
    @CurrentUser() user: User,
  ) {
    const organization = user.organizationId;
    await assertOrganizationCreditsAvailable(
      this.creditsUtilsService,
      organization,
      await getDefaultTextMinimumCredits(this.modelsService),
    );

    let billedCredits = 0;

    const result = await this.optimizersService.generateVariants(
      dto,
      organization,
      (amount) => {
        billedCredits += amount;
      },
    );

    finalizeDeferredTextCredits(request, billedCredits);

    return result;
  }

  /**
   * Generate creative prompts from idea or variations
   */
  @Post('prompts')
  @UseGuards(SubscriptionGuard, CreditsGuard)
  @Credits({
    description: 'Prompt generation (text model)',
    source: ActivitySource.SCRIPT,
  })
  @DeferCreditsUntilModelResolution()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async generatePrompts(
    @Req() request: Request,
    @Body() dto: GeneratePromptsDto,
    @CurrentUser() user: User,
  ) {
    const organization = user.organizationId;
    await assertOrganizationCreditsAvailable(
      this.creditsUtilsService,
      organization,
      await getDefaultTextMinimumCredits(this.modelsService),
    );

    let billedCredits = 0;

    const result = await this.optimizersService.generatePrompts(
      dto,
      organization,
      (amount) => {
        billedCredits += amount;
      },
    );

    finalizeDeferredTextCredits(request, billedCredits);

    return result;
  }

  /**
   * Get best posting times
   */
  @Get('times')
  @UseGuards(SubscriptionGuard, CreditsGuard)
  @Credits({
    description: 'Best posting times (text model)',
    source: ActivitySource.SCRIPT,
  })
  @DeferCreditsUntilModelResolution()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getBestPostingTimes(
    @Req() request: Request,
    @Query('platform') platform: string,
    @Query('timezone') timezone: string,
    @CurrentUser() user: User,
  ) {
    const organization = user.organizationId;
    await assertOrganizationCreditsAvailable(
      this.creditsUtilsService,
      organization,
      await getDefaultTextMinimumCredits(this.modelsService),
    );

    let billedCredits = 0;

    const result = await this.optimizersService.getBestPostingTimes(
      platform,
      timezone || 'UTC',
      organization,
      (amount) => {
        billedCredits += amount;
      },
    );

    finalizeDeferredTextCredits(request, billedCredits);

    return result;
  }

  /**
   * Get optimization history
   */
  @Get('history')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getOptimizationHistory(
    @Req() req: Request,
    @Query('limit') limit: string,
    @CurrentUser() user: User,
  ) {
    const organization = user.organizationId;
    const docs = await this.optimizersService.getOptimizationHistory(
      organization,
      user.id,
      limit ? parseInt(limit, 10) : 20,
    );
    return serializeCollection(req, OptimizationSerializer, { docs });
  }
}
