import { TrackSubscriptionDto } from '@api/collections/subscription-attributions/dto/track-subscription.dto';
import { SubscriptionAttributionsService } from '@api/collections/subscription-attributions/services/subscription-attributions.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import type { User } from '@clerk/backend';
import { Timeframe } from '@genfeedai/enums';
import { SubscriptionAttributionSerializer } from '@genfeedai/serializers';
import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@AutoSwagger()
@ApiTags('Analytics')
@Controller('analytics')
export class SubscriptionAttributionsController {
  constructor(
    private readonly subscriptionAttributionsService: SubscriptionAttributionsService,
  ) {}

  /**
   * Track subscription attribution
   */
  @Post('subscription-attribution')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async trackSubscription(
    @Req() req: Request,
    @Body() dto: TrackSubscriptionDto,
    @CurrentUser() user: User,
  ) {
    const { organization } = getPublicMetadata(user);
    const data = await this.subscriptionAttributionsService.trackSubscription(
      dto,
      organization,
    );
    return serializeSingle(req, SubscriptionAttributionSerializer, data);
  }

  /**
   * Get subscription stats for content
   */
  @Get('content/:contentId/subscription-stats')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getContentSubscriptionStats(
    @Param('contentId') contentId: string,
    @CurrentUser() user: User,
  ) {
    const { organization } = getPublicMetadata(user);
    return await this.subscriptionAttributionsService.getContentSubscriptionStats(
      contentId,
      organization,
    );
  }

  /**
   * Get top content by subscriptions
   */
  @Get('top-content-by-subscriptions')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getTopContent(
    @Query('limit') limit: string | undefined,
    @Query('period') period:
      | Timeframe.D7
      | Timeframe.D30
      | Timeframe.D90
      | undefined,
    @CurrentUser() user: User,
  ) {
    const { organization } = getPublicMetadata(user);
    return await this.subscriptionAttributionsService.getTopContentBySubscriptions(
      {
        limit: limit ? parseInt(limit, 10) : 10,
        organizationId: organization,
        period: period || Timeframe.D30,
      },
    );
  }
}
