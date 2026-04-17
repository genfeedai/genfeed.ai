import { TrackSubscriptionDto } from '@api/collections/subscription-attributions/dto/track-subscription.dto';
import type { SubscriptionAttributionDocument } from '@api/collections/subscription-attributions/schemas/subscription-attribution.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Timeframe } from '@genfeedai/enums';
import { Injectable, Logger } from '@nestjs/common';

type SubscriptionAttribution = SubscriptionAttributionDocument;

@Injectable()
export class SubscriptionAttributionsService {
  private readonly logger = new Logger(SubscriptionAttributionsService.name);

  constructor(private readonly prisma: PrismaService) {}

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

    const existingAttribution =
      await this.prisma.subscriptionAttribution.findFirst({
        where: {
          organizationId,
          stripeSubscriptionId: dto.stripeSubscriptionId,
        },
      });

    const baseUpdate: Record<string, unknown> = {
      amount: dto.amount,
      currency,
      email: dto.email,
      plan: dto.plan,
      status: 'active',
      stripeCustomerId: dto.stripeCustomerId,
      userId: dto.userId,
    };

    if (source) {
      baseUpdate.source = source;
    }

    if (utm) {
      baseUpdate.utm = utm;
    }

    if (dto.sessionId && !baseUpdate.source) {
      baseUpdate.source = {
        content: dto.sourceContentId ?? 'unknown',
        contentType: dto.sourceContentType ?? 'unknown',
        link: dto.sourceLinkId,
        platform: dto.sourcePlatform ?? 'unknown',
        sessionId: dto.sessionId,
      };
    }

    if (existingAttribution) {
      const updated = await this.prisma.subscriptionAttribution.update({
        data: {
          ...baseUpdate,
          subscribedAt:
            (existingAttribution as unknown as Record<string, unknown>)
              .subscribedAt ?? new Date(),
        } as never,
        where: { id: String(existingAttribution.id) },
      });

      this.logger.log(`Subscription attribution updated`, {
        content: (baseUpdate.source as Record<string, unknown>)?.content,
        platform: (baseUpdate.source as Record<string, unknown>)?.platform,
        subscriptionId: dto.stripeSubscriptionId,
      });

      return updated as unknown as SubscriptionAttribution;
    }

    const attribution = await this.prisma.subscriptionAttribution.create({
      data: {
        organizationId,
        stripeSubscriptionId: dto.stripeSubscriptionId,
        subscribedAt: new Date(),
        ...baseUpdate,
      } as never,
    });

    this.logger.log(`Subscription attribution tracked`, {
      content: (baseUpdate.source as Record<string, unknown>)?.content,
      platform: (baseUpdate.source as Record<string, unknown>)?.platform,
      subscriptionId: dto.stripeSubscriptionId,
    });

    return attribution as unknown as SubscriptionAttribution;
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
    const attributions = await this.prisma.subscriptionAttribution.findMany({
      where: {
        organizationId,
        source: { path: ['content'], equals: contentId },
      } as never,
    });

    const docs = attributions as unknown as Array<
      Record<string, unknown> & {
        amount: number;
        plan: string;
        subscribedAt: Date;
        source?: { contentType?: string };
        currency?: string;
      }
    >;

    const totalSubscriptions = docs.length;
    const totalRevenue = docs.reduce((sum, attr) => sum + attr.amount, 0);
    const avgOrderValue =
      totalSubscriptions > 0 ? totalRevenue / totalSubscriptions : 0;

    // By plan
    const byPlan: Record<string, { count: number; revenue: number }> = {};
    docs.forEach((attr) => {
      if (!byPlan[attr.plan]) {
        byPlan[attr.plan] = { count: 0, revenue: 0 };
      }
      byPlan[attr.plan].count++;
      byPlan[attr.plan].revenue += attr.amount;
    });

    // Timeline
    const timeline: Record<string, number> = {};
    docs.forEach((attr) => {
      const date = attr.subscribedAt.toISOString().split('T')[0];
      timeline[date] = (timeline[date] || 0) + 1;
    });

    return {
      avgOrderValue,
      byPlan,
      contentId,
      contentType: docs[0]?.source?.contentType || 'unknown',
      currency: docs[0]?.currency ?? null,
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

    const where: Record<string, unknown> = {
      organizationId: params.organizationId,
      source: { path: ['content'], not: null },
    };

    if (dateFilter) {
      where.subscribedAt = { gte: dateFilter };
    }

    const attributions = await this.prisma.subscriptionAttribution.findMany({
      where: where as never,
    });

    const docs = attributions as unknown as Array<{
      source?: { content?: string; contentType?: string };
      amount: number;
      currency?: string;
      subscribedAt: Date;
    }>;

    // Group in-memory (Prisma doesn't support MongoDB $group aggregation)
    const grouped = new Map<
      string,
      {
        contentType: string;
        currency: string | null;
        revenue: number;
        subscriptions: number;
      }
    >();

    for (const doc of docs) {
      const contentId = doc.source?.content;
      if (!contentId) continue;

      const existing = grouped.get(contentId);
      if (existing) {
        existing.subscriptions++;
        existing.revenue += doc.amount;
      } else {
        grouped.set(contentId, {
          contentType: doc.source?.contentType ?? 'unknown',
          currency: doc.currency ?? null,
          revenue: doc.amount,
          subscriptions: 1,
        });
      }
    }

    const limit = params.limit || 10;

    return Array.from(grouped.entries())
      .sort((a, b) => b[1].subscriptions - a[1].subscriptions)
      .slice(0, limit)
      .map(([contentId, data]) => ({
        contentId,
        contentType: data.contentType,
        currency: data.currency,
        revenue: data.revenue,
        subscriptions: data.subscriptions,
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
    await this.prisma.subscriptionAttribution.updateMany({
      data: { status } as never,
      where: { stripeSubscriptionId },
    });

    this.logger.log(`Subscription status updated`, {
      status,
      subscriptionId: stripeSubscriptionId,
    });
  }
}
