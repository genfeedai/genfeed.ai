import { TrackSubscriptionDto } from '@api/collections/subscription-attributions/dto/track-subscription.dto';
import {
  SubscriptionAttribution,
  type SubscriptionAttributionDocument,
} from '@api/collections/subscription-attributions/schemas/subscription-attribution.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { PipelineBuilder } from '@api/shared/utils/pipeline-builder/pipeline-builder.util';
import { Timeframe } from '@genfeedai/enums';
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

@Injectable()
export class SubscriptionAttributionsService {
  private readonly logger = new Logger(SubscriptionAttributionsService.name);

  constructor(
    @InjectModel(SubscriptionAttribution.name, DB_CONNECTIONS.AUTH)
    private subscriptionAttributionModel: Model<SubscriptionAttributionDocument>,
  ) {}

  /**
   * Track subscription with attribution
   */
  async trackSubscription(
    dto: TrackSubscriptionDto,
    organizationId: string,
  ): Promise<SubscriptionAttribution> {
    const currency = dto.currency ? dto.currency.toUpperCase() : 'USD';
    const source = this.buildSourceFromDto(dto);
    const utm = this.buildUtmFromDto(dto);

    const existingAttribution = await this.subscriptionAttributionModel.findOne(
      {
        organization: organizationId,
        stripeSubscriptionId: dto.stripeSubscriptionId,
      },
    );

    const baseUpdate: Partial<SubscriptionAttribution> = {
      amount: dto.amount,
      currency,
      email: dto.email,
      plan: dto.plan,
      status: 'active',
      stripeCustomerId: dto.stripeCustomerId,
      user: dto.userId as unknown,
    };

    if (source) {
      baseUpdate.source = source;
    }

    if (utm) {
      baseUpdate.utm = utm;
    }

    if (dto.sessionId && !baseUpdate.source) {
      baseUpdate.source = {
        // @ts-expect-error TS2322
        content: dto.sourceContentId ?? 'unknown',
        contentType: dto.sourceContentType ?? 'unknown',
        link: dto.sourceLinkId as unknown,
        platform: dto.sourcePlatform ?? 'unknown',
        sessionId: dto.sessionId,
      };
    }

    if (existingAttribution) {
      existingAttribution.set({
        ...baseUpdate,
        subscribedAt: existingAttribution.subscribedAt ?? new Date(),
      });

      const updatedAttribution = await existingAttribution.save();

      this.logger.log(`Subscription attribution updated`, {
        content: baseUpdate.source?.content,
        platform: baseUpdate.source?.platform,
        subscriptionId: dto.stripeSubscriptionId,
      });

      return updatedAttribution;
    }

    const attribution = await this.subscriptionAttributionModel.create({
      organization: organizationId,
      stripeSubscriptionId: dto.stripeSubscriptionId,
      subscribedAt: new Date(),
      ...baseUpdate,
    });

    this.logger.log(`Subscription attribution tracked`, {
      content: baseUpdate.source?.content,
      platform: baseUpdate.source?.platform,
      subscriptionId: dto.stripeSubscriptionId,
    });

    return attribution;
  }

  /**
   * Get subscription stats for content
   */
  async getContentSubscriptionStats(
    contentId: string,
    organizationId: string,
  ): Promise<{
    contentId: string;
    contentType: string;
    totalSubscriptions: number;
    totalRevenue: number;
    avgOrderValue: number;
    byPlan: Record<string, { count: number; revenue: number }>;
    timeline: Record<string, number>;
    currency: string | null;
  }> {
    const attributions = await this.subscriptionAttributionModel.find({
      organization: organizationId,
      'source.content': contentId,
    });

    const totalSubscriptions = attributions.length;
    const totalRevenue = attributions.reduce(
      (sum, attr) => sum + attr.amount,
      0,
    );
    const avgOrderValue =
      totalSubscriptions > 0 ? totalRevenue / totalSubscriptions : 0;

    // By plan
    const byPlan: Record<string, { count: number; revenue: number }> = {};
    attributions.forEach((attr) => {
      if (!byPlan[attr.plan]) {
        byPlan[attr.plan] = { count: 0, revenue: 0 };
      }
      byPlan[attr.plan].count++;
      byPlan[attr.plan].revenue += attr.amount;
    });

    // Timeline
    const timeline: Record<string, number> = {};
    attributions.forEach((attr) => {
      const date = attr.subscribedAt.toISOString().split('T')[0];
      timeline[date] = (timeline[date] || 0) + 1;
    });

    return {
      avgOrderValue,
      byPlan,
      contentId,
      contentType: attributions[0]?.source?.contentType || 'unknown',
      currency: attributions[0]?.currency ?? null,
      timeline,
      totalRevenue,
      totalSubscriptions,
    };
  }

  /**
   * Get top content by subscriptions
   */
  async getTopContentBySubscriptions(params: {
    organizationId: string;
    limit?: number;
    period?: Timeframe.D7 | Timeframe.D30 | Timeframe.D90;
  }): Promise<
    Array<{
      contentId: string;
      contentType: string;
      subscriptions: number;
      revenue: number;
      currency: string | null;
    }>
  > {
    const dateFilter: Date | undefined = params.period
      ? new Date(
          Date.now() -
            (params.period === Timeframe.D7
              ? 7
              : params.period === Timeframe.D30
                ? 30
                : 90) *
              24 *
              60 *
              60 *
              1000,
        )
      : undefined;

    const results = await this.subscriptionAttributionModel.aggregate([
      PipelineBuilder.buildMatch({
        organization: params.organizationId,
        'source.content': { $exists: true },
        ...(dateFilter && { subscribedAt: { $gte: dateFilter } }),
      }),
      {
        $group: {
          _id: '$source.content',
          contentType: { $first: '$source.contentType' },
          currency: { $first: '$currency' },
          revenue: { $sum: '$amount' },
          subscriptions: { $sum: 1 },
        },
      },
      { $sort: { subscriptions: -1 } },
      { $limit: params.limit || 10 },
    ]);

    return results.map((r) => ({
      contentId: r._id,
      contentType: r.contentType,
      currency: r.currency ?? null,
      revenue: r.revenue,
      subscriptions: r.subscriptions,
    }));
  }

  private buildSourceFromDto(
    dto: TrackSubscriptionDto,
  ): SubscriptionAttribution['source'] | undefined {
    if (!dto.sourceContentId) {
      return undefined;
    }

    return {
      // @ts-expect-error TS2322
      content: dto.sourceContentId,
      contentType: dto.sourceContentType || 'unknown',
      link: dto.sourceLinkId as unknown,
      platform: dto.sourcePlatform || 'unknown',
      sessionId: dto.sessionId,
    };
  }

  private buildUtmFromDto(
    dto: TrackSubscriptionDto,
  ): SubscriptionAttribution['utm'] | undefined {
    if (!dto.utm) {
      return undefined;
    }

    const { source, medium, campaign, content } = dto.utm;

    if (!source && !medium && !campaign && !content) {
      return undefined;
    }

    return {
      campaign,
      content,
      medium,
      source,
    };
  }

  /**
   * Update subscription status (when canceled, expired, etc.)
   */
  async updateSubscriptionStatus(
    stripeSubscriptionId: string,
    status: string,
  ): Promise<void> {
    await this.subscriptionAttributionModel.updateOne(
      { stripeSubscriptionId },
      { status },
    );

    this.logger.log(`Subscription status updated`, {
      status,
      subscriptionId: stripeSubscriptionId,
    });
  }
}
