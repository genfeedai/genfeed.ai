import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { GetForecastDto } from '@api/collections/insights/dto/forecast.dto';
import { PredictViralDto } from '@api/collections/insights/dto/predict-viral.dto';
import { InsightsService } from '@api/collections/insights/services/insights.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { baseModelKey } from '@api/collections/models/utils/model-key.util';
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
import { InsightSerializer } from '@genfeedai/serializers';
import { ActivitySource } from '@genfeedai/enums';
import {
  Body,
  Controller,
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
@ApiTags('Insights')
@Controller('insights')
@UseInterceptors(CreditsInterceptor)
export class InsightsController {
  private static readonly TEXT_MAX_OVERDRAFT_CREDITS = 5;

  constructor(
    private readonly insightsService: InsightsService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly modelsService: ModelsService,
  ) {}

  /**
   * Get trend forecasts
   */
  @Post('forecast')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getForecast(@Body() dto: GetForecastDto, @CurrentUser() user: User) {
    const { organization } = getPublicMetadata(user);
    return await this.insightsService.getForecast(dto, organization);
  }

  /**
   * Get AI insights
   */
  @Get()
  @UseGuards(SubscriptionGuard, CreditsGuard)
  @Credits({
    description: 'AI insights generation (text model)',
    source: ActivitySource.SCRIPT,
  })
  @DeferCreditsUntilModelResolution()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getInsights(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Query('limit') limit?: string,
  ) {
    const { organization } = getPublicMetadata(user);
    if (
      await this.insightsService.needsInsightGeneration(
        organization,
        limit ? parseInt(limit, 10) : 5,
      )
    ) {
      await this.assertOrganizationCreditsAvailable(
        organization,
        await this.getDefaultTextMinimumCredits(),
      );
    }
    let billedCredits = 0;
    const docs = await this.insightsService.getInsights(
      organization,
      limit ? parseInt(limit, 10) : 5,
      (amount) => {
        billedCredits += amount;
      },
    );
    this.finalizeDeferredCredits(req, billedCredits);
    return serializeCollection(req, InsightSerializer, { docs });
  }

  /**
   * Predict viral potential
   */
  @Post('viral')
  @UseGuards(SubscriptionGuard, CreditsGuard)
  @Credits({
    description: 'Viral prediction (text model)',
    source: ActivitySource.SCRIPT,
  })
  @DeferCreditsUntilModelResolution()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async predictViral(
    @Req() req: Request,
    @Body() dto: PredictViralDto,
    @CurrentUser() user: User,
  ) {
    const { organization } = getPublicMetadata(user);
    await this.assertOrganizationCreditsAvailable(
      organization,
      await this.getDefaultTextMinimumCredits(),
    );
    let billedCredits = 0;
    const result = await this.insightsService.predictViral(
      dto,
      organization,
      (amount) => {
        billedCredits += amount;
      },
    );
    this.finalizeDeferredCredits(req, billedCredits);
    return result;
  }

  /**
   * Get content gaps
   */
  @Get('gaps')
  @UseGuards(SubscriptionGuard, CreditsGuard)
  @Credits({
    description: 'Content gap analysis (text model)',
    source: ActivitySource.SCRIPT,
  })
  @DeferCreditsUntilModelResolution()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getContentGaps(@Req() req: Request, @CurrentUser() user: User) {
    const { organization } = getPublicMetadata(user);
    await this.assertOrganizationCreditsAvailable(
      organization,
      await this.getDefaultTextMinimumCredits(),
    );
    let billedCredits = 0;
    const result = await this.insightsService.getContentGaps(
      organization,
      (amount) => {
        billedCredits += amount;
      },
    );
    this.finalizeDeferredCredits(req, billedCredits);
    return result;
  }

  /**
   * Get best posting times
   */
  @Get('times')
  @UseGuards(SubscriptionGuard, CreditsGuard)
  @Credits({
    description: 'Best posting times insight (text model)',
    source: ActivitySource.SCRIPT,
  })
  @DeferCreditsUntilModelResolution()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getBestTimes(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Query('platform') platform?: string,
    @Query('timezone') timezone?: string,
  ) {
    const { organization } = getPublicMetadata(user);
    await this.assertOrganizationCreditsAvailable(
      organization,
      await this.getDefaultTextMinimumCredits(),
    );
    let billedCredits = 0;
    const result = await this.insightsService.getBestTimes(
      platform || 'instagram',
      timezone || 'UTC',
      organization,
      (amount) => {
        billedCredits += amount;
      },
    );
    this.finalizeDeferredCredits(req, billedCredits);
    return result;
  }

  /**
   * Get growth prediction
   */
  @Get('growth')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getGrowthPrediction(
    @CurrentUser() user: User,
    @Query('platform') platform?: string,
  ) {
    const { organization } = getPublicMetadata(user);
    return await this.insightsService.getGrowthPrediction(
      platform || 'instagram',
      organization,
    );
  }

  /**
   * Mark insight as read
   */
  @Patch(':insightId/read')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async markAsRead(
    @Req() req: Request,
    @Param('insightId') insightId: string,
    @CurrentUser() user: User,
  ) {
    const { organization } = getPublicMetadata(user);
    const data = await this.insightsService.markAsRead(insightId, organization);
    return serializeSingle(req, InsightSerializer, data);
  }

  /**
   * Mark insight as dismissed
   */
  @Patch(':insightId/dismiss')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async markAsDismissed(
    @Req() req: Request,
    @Param('insightId') insightId: string,
    @CurrentUser() user: User,
  ) {
    const { organization } = getPublicMetadata(user);
    const data = await this.insightsService.markAsDismissed(
      insightId,
      organization,
    );
    return serializeSingle(req, InsightSerializer, data);
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
      maxOverdraftCredits: InsightsController.TEXT_MAX_OVERDRAFT_CREDITS,
    };
  }
}
