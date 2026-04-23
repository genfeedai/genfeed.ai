import { TrackSubscriptionDto } from '@api/collections/subscription-attributions/dto/track-subscription.dto';
import type { SubscriptionAttributionDocument } from '@api/collections/subscription-attributions/schemas/subscription-attribution.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Timeframe } from '@genfeedai/enums';
import { Injectable, Logger } from '@nestjs/common';

type SubscriptionAttribution = SubscriptionAttributionDocument;

type SubscriptionAttributionSource = {
  content: string;
  contentType: string;
  link?: string;
  platform: string;
  sessionId?: string;
};

type SubscriptionAttributionUtm = {
  campaign?: string;
  content?: string;
  medium?: string;
  source?: string;
};

type SubscriptionAttributionMetadata = {
  amount?: number;
  currency?: string;
  email?: string;
  plan?: string;
  source?: SubscriptionAttributionSource;
  status?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  subscribedAt?: string;
  utm?: SubscriptionAttributionUtm;
};

type NormalizedSubscriptionAttribution = Omit<
  SubscriptionAttribution,
  'metadata'
> & {
  amount?: number;
  currency?: string;
  metadata?: SubscriptionAttributionMetadata;
  plan?: string;
  source?: SubscriptionAttributionSource;
  stripeSubscriptionId?: string;
  subscribedAt?: Date;
  utm?: SubscriptionAttributionUtm;
};

@Injectable()
export class SubscriptionAttributionsService {
  private readonly logger = new Logger(SubscriptionAttributionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  private mergeMetadata(
    current: unknown,
    update: SubscriptionAttributionMetadata,
  ): Record<string, unknown> {
    return {
      ...(this.isPlainObject(current) ? current : {}),
      ...update,
    };
  }

  private normalizeAttribution(
    attribution: SubscriptionAttributionDocument,
  ): NormalizedSubscriptionAttribution {
    const metadata = this.isPlainObject(attribution.metadata)
      ? (attribution.metadata as SubscriptionAttributionMetadata)
      : undefined;
    const subscribedAt =
      metadata?.subscribedAt !== undefined
        ? new Date(metadata.subscribedAt)
        : attribution.createdAt;

    return {
      ...attribution,
      amount: metadata?.amount,
      currency: metadata?.currency,
      metadata,
      plan: metadata?.plan,
      source: metadata?.source,
      stripeSubscriptionId: metadata?.stripeSubscriptionId,
      subscribedAt: Number.isNaN(subscribedAt.getTime())
        ? undefined
        : subscribedAt,
      utm: metadata?.utm,
    };
  }

  /**
   * Track subscription with attribution
   */
  async trackSubscription(
    dto: TrackSubscriptionDto,
    organizationId: string,
  ): Promise<NormalizedSubscriptionAttribution> {
    const currency = dto.currency ? dto.currency.toUpperCase() : 'USD';
    const source = this.buildSourceFromDto(dto);
    const utm = this.buildUtmFromDto(dto);

    const existingAttribution = (
      await this.prisma.subscriptionAttribution.findMany({
        where: { organizationId },
      })
    )
      .map((attribution) => this.normalizeAttribution(attribution))
      .find(
        (attribution) =>
          attribution.stripeSubscriptionId === dto.stripeSubscriptionId,
      );

    const baseMetadata: SubscriptionAttributionMetadata = {
      amount: dto.amount,
      currency,
      email: dto.email,
      plan: dto.plan,
      status: 'active',
      stripeCustomerId: dto.stripeCustomerId,
      stripeSubscriptionId: dto.stripeSubscriptionId,
    };

    if (source) {
      baseMetadata.source = source;
    }

    if (utm) {
      baseMetadata.utm = utm;
    }

    if (dto.sessionId && !baseMetadata.source) {
      baseMetadata.source = {
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
          channel: dto.sourcePlatform ?? existingAttribution.channel,
          metadata: this.mergeMetadata(existingAttribution.metadata, {
            ...baseMetadata,
            subscribedAt:
              existingAttribution.metadata?.subscribedAt ??
              new Date().toISOString(),
          }) as never,
          referrer: dto.utm?.source ?? existingAttribution.referrer,
          sourceContentId:
            dto.sourceContentId ?? existingAttribution.sourceContentId,
          sourceLinkId: dto.sourceLinkId ?? existingAttribution.sourceLinkId,
          userId: dto.userId,
        },
        where: { id: existingAttribution.id },
      });

      this.logger.log(`Subscription attribution updated`, {
        content: baseMetadata.source?.content,
        platform: baseMetadata.source?.platform,
        subscriptionId: dto.stripeSubscriptionId,
      });

      return this.normalizeAttribution(updated);
    }

    const attribution = await this.prisma.subscriptionAttribution.create({
      data: {
        channel: dto.sourcePlatform,
        metadata: {
          ...baseMetadata,
          subscribedAt: new Date().toISOString(),
        },
        organizationId,
        referrer: dto.utm?.source,
        sourceContentId: dto.sourceContentId,
        sourceLinkId: dto.sourceLinkId,
        userId: dto.userId,
      },
    });

    this.logger.log(`Subscription attribution tracked`, {
      content: baseMetadata.source?.content,
      platform: baseMetadata.source?.platform,
      subscriptionId: dto.stripeSubscriptionId,
    });

    return this.normalizeAttribution(attribution);
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
    const docs = (
      await this.prisma.subscriptionAttribution.findMany({
        where: {
          organizationId,
          sourceContentId: contentId,
        },
      })
    ).map((attribution) => this.normalizeAttribution(attribution));

    const totalSubscriptions = docs.length;
    const totalRevenue = docs.reduce(
      (sum, attr) => sum + (attr.amount ?? 0),
      0,
    );
    const avgOrderValue =
      totalSubscriptions > 0 ? totalRevenue / totalSubscriptions : 0;

    const byPlan: Record<string, { count: number; revenue: number }> = {};
    docs.forEach((attr) => {
      const plan = attr.plan ?? 'unknown';
      if (!byPlan[plan]) {
        byPlan[plan] = { count: 0, revenue: 0 };
      }
      byPlan[plan].count++;
      byPlan[plan].revenue += attr.amount ?? 0;
    });

    const timeline: Record<string, number> = {};
    docs.forEach((attr) => {
      const date = (attr.subscribedAt ?? attr.createdAt)
        .toISOString()
        .split('T')[0];
      timeline[date] = (timeline[date] || 0) + 1;
    });

    return {
      avgOrderValue,
      byPlan,
      contentId,
      contentType: docs[0]?.source?.contentType ?? 'unknown',
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

    const docs = (
      await this.prisma.subscriptionAttribution.findMany({
        where: {
          organizationId: params.organizationId,
          sourceContentId: { not: null },
        },
      })
    )
      .map((attribution) => this.normalizeAttribution(attribution))
      .filter(
        (attribution) =>
          !dateFilter ||
          (attribution.subscribedAt?.getTime() ?? 0) >= dateFilter.getTime(),
      );

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
      const contentId = doc.sourceContentId;
      if (!contentId) {
        continue;
      }

      const existing = grouped.get(contentId);
      if (existing) {
        existing.subscriptions++;
        existing.revenue += doc.amount ?? 0;
      } else {
        grouped.set(contentId, {
          contentType: doc.source?.contentType ?? 'unknown',
          currency: doc.currency ?? null,
          revenue: doc.amount ?? 0,
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
  ): SubscriptionAttributionSource | undefined {
    if (!dto.sourceContentId) {
      return undefined;
    }

    return {
      content: dto.sourceContentId,
      contentType: dto.sourceContentType || 'unknown',
      link: dto.sourceLinkId,
      platform: dto.sourcePlatform || 'unknown',
      sessionId: dto.sessionId,
    };
  }

  private buildUtmFromDto(
    dto: TrackSubscriptionDto,
  ): SubscriptionAttributionUtm | undefined {
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
    const attributions = await this.prisma.subscriptionAttribution.findMany();

    await Promise.all(
      attributions
        .map((attribution) => this.normalizeAttribution(attribution))
        .filter(
          (attribution) =>
            attribution.stripeSubscriptionId === stripeSubscriptionId,
        )
        .map((attribution) =>
          this.prisma.subscriptionAttribution.update({
            data: {
              metadata: this.mergeMetadata(attribution.metadata, {
                status,
              }) as never,
            },
            where: { id: attribution.id },
          }),
        ),
    );

    this.logger.log(`Subscription status updated`, {
      status,
      subscriptionId: stripeSubscriptionId,
    });
  }
}
