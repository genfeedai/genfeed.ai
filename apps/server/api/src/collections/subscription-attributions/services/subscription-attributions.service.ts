import type { TrackSubscriptionDto } from '@api/collections/subscription-attributions/dto/track-subscription.dto';
import type { SubscriptionAttributionDocument } from '@api/collections/subscription-attributions/schemas/subscription-attribution.schema';
import { Timeframe } from '@genfeedai/enums';
import type { ISubscriptionAttributionsService } from '@genfeedai/interfaces/billing';
import { Prisma } from '@genfeedai/prisma';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';

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
  'metadata' | 'stripeSubscriptionId'
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

type ContentStatsAggregateRow = {
  bucket: string;
  contentType: string | null;
  count: bigint;
  currency: string | null;
  dimension: 'date' | 'plan' | 'summary';
  revenue: number;
};

type TopContentAggregateRow = {
  contentId: string;
  contentType: string;
  currency: string | null;
  revenue: number;
  subscriptions: bigint;
};

@Injectable()
export class SubscriptionAttributionsService
  implements ISubscriptionAttributionsService
{
  private readonly logger = new Logger(SubscriptionAttributionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  private mergeMetadata(
    current: unknown,
    update: SubscriptionAttributionMetadata,
  ): Prisma.InputJsonValue {
    // Round-trip through JSON so `undefined` optional fields drop out and the
    // merged object is a Prisma-writable JSON value without a cast at the call site.
    return JSON.parse(
      JSON.stringify({
        ...(this.isPlainObject(current) ? current : {}),
        ...update,
      }),
    ) as Prisma.InputJsonValue;
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
      stripeSubscriptionId:
        attribution.stripeSubscriptionId ?? metadata?.stripeSubscriptionId,
      subscribedAt: Number.isNaN(subscribedAt.getTime())
        ? undefined
        : subscribedAt,
      utm: metadata?.utm,
    };
  }

  private async updateExistingAttribution(
    existingAttribution: NormalizedSubscriptionAttribution,
    dto: TrackSubscriptionDto,
    baseMetadata: SubscriptionAttributionMetadata,
  ): Promise<NormalizedSubscriptionAttribution> {
    const updated = await this.prisma.subscriptionAttribution.update({
      data: {
        channel: dto.sourcePlatform ?? existingAttribution.channel,
        metadata: this.mergeMetadata(existingAttribution.metadata, {
          ...baseMetadata,
          subscribedAt:
            existingAttribution.metadata?.subscribedAt ??
            new Date().toISOString(),
        }),
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

    const existing = await this.prisma.subscriptionAttribution.findUnique({
      where: {
        organizationId_stripeSubscriptionId: {
          organizationId,
          stripeSubscriptionId: dto.stripeSubscriptionId,
        },
      },
    });
    const existingAttribution = existing
      ? this.normalizeAttribution(existing)
      : undefined;

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
      return this.updateExistingAttribution(
        existingAttribution,
        dto,
        baseMetadata,
      );
    }

    try {
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
          stripeSubscriptionId: dto.stripeSubscriptionId,
          userId: dto.userId,
        },
      });

      this.logger.log(`Subscription attribution tracked`, {
        content: baseMetadata.source?.content,
        platform: baseMetadata.source?.platform,
        subscriptionId: dto.stripeSubscriptionId,
      });

      return this.normalizeAttribution(attribution);
    } catch (error: unknown) {
      if ((error as { code?: unknown }).code !== 'P2002') {
        throw error;
      }

      const winner = await this.prisma.subscriptionAttribution.findUnique({
        where: {
          organizationId_stripeSubscriptionId: {
            organizationId,
            stripeSubscriptionId: dto.stripeSubscriptionId,
          },
        },
      });
      if (!winner) {
        throw error;
      }

      return this.updateExistingAttribution(
        this.normalizeAttribution(winner),
        dto,
        baseMetadata,
      );
    }
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
    const rows = await this.prisma.$queryRaw<ContentStatsAggregateRow[]>(
      Prisma.sql`
        WITH normalized AS (
          SELECT
            "createdAt" AS created_at,
            COALESCE(metadata->>'plan', 'unknown') AS plan,
            metadata->>'currency' AS currency,
            COALESCE(metadata#>>'{source,contentType}', 'unknown') AS content_type,
            CASE
              WHEN JSONB_TYPEOF(metadata->'amount') = 'number'
                THEN (metadata->>'amount')::double precision
              ELSE 0
            END AS amount,
            CASE
              WHEN metadata->>'subscribedAt' ~
                '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]+)?Z$'
                THEN (metadata->>'subscribedAt')::timestamptz
              ELSE "createdAt"
            END AS subscribed_at
          FROM "subscription_attributions"
          WHERE "organizationId" = ${organizationId}
            AND "sourceContentId" = ${contentId}
        )
        SELECT
          breakdown.dimension,
          breakdown.bucket,
          COUNT(*)::bigint AS "count",
          COALESCE(SUM(normalized.amount), 0)::double precision AS "revenue",
          (ARRAY_AGG(normalized.currency ORDER BY normalized.created_at))[1] AS "currency",
          (ARRAY_AGG(normalized.content_type ORDER BY normalized.created_at))[1] AS "contentType"
        FROM normalized
        CROSS JOIN LATERAL (
          VALUES
            ('summary', 'all'),
            ('plan', normalized.plan),
            ('date', TO_CHAR(normalized.subscribed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD'))
        ) AS breakdown(dimension, bucket)
        GROUP BY breakdown.dimension, breakdown.bucket
      `,
    );

    let contentType = 'unknown';
    let currency: string | null = null;
    let totalRevenue = 0;
    let totalSubscriptions = 0;
    const byPlan: Record<string, { count: number; revenue: number }> = {};
    const timeline: Record<string, number> = {};

    for (const row of rows) {
      const count = Number(row.count);
      if (row.dimension === 'summary') {
        contentType = row.contentType ?? 'unknown';
        currency = row.currency;
        totalRevenue = row.revenue;
        totalSubscriptions = count;
      } else if (row.dimension === 'plan') {
        byPlan[row.bucket] = { count, revenue: row.revenue };
      } else {
        timeline[row.bucket] = count;
      }
    }

    const avgOrderValue =
      totalSubscriptions > 0 ? totalRevenue / totalSubscriptions : 0;

    return {
      avgOrderValue,
      byPlan,
      contentId,
      contentType,
      currency,
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

    const limit = Math.max(1, params.limit || 10);
    const periodFilter = dateFilter
      ? Prisma.sql`AND subscribed_at >= ${dateFilter}`
      : Prisma.empty;
    const rows = await this.prisma.$queryRaw<TopContentAggregateRow[]>(
      Prisma.sql`
        WITH normalized AS (
          SELECT
            "sourceContentId" AS content_id,
            "createdAt" AS created_at,
            COALESCE(metadata#>>'{source,contentType}', 'unknown') AS content_type,
            metadata->>'currency' AS currency,
            CASE
              WHEN JSONB_TYPEOF(metadata->'amount') = 'number'
                THEN (metadata->>'amount')::double precision
              ELSE 0
            END AS amount,
            CASE
              WHEN metadata->>'subscribedAt' IS NULL THEN "createdAt"
              WHEN metadata->>'subscribedAt' ~
                '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]+)?Z$'
                THEN (metadata->>'subscribedAt')::timestamptz
              ELSE NULL
            END AS subscribed_at
          FROM "subscription_attributions"
          WHERE "organizationId" = ${params.organizationId}
            AND "sourceContentId" IS NOT NULL
        )
        SELECT
          normalized.content_id AS "contentId",
          (ARRAY_AGG(normalized.content_type ORDER BY normalized.created_at))[1] AS "contentType",
          (ARRAY_AGG(normalized.currency ORDER BY normalized.created_at))[1] AS "currency",
          COALESCE(SUM(normalized.amount), 0)::double precision AS "revenue",
          COUNT(*)::bigint AS "subscriptions"
        FROM normalized
        WHERE TRUE ${periodFilter}
        GROUP BY normalized.content_id
        ORDER BY COUNT(*) DESC, MIN(normalized.created_at) ASC
        LIMIT ${limit}
      `,
    );

    return rows.map((row) => ({
      contentId: row.contentId,
      contentType: row.contentType,
      currency: row.currency,
      revenue: row.revenue,
      subscriptions: Number(row.subscriptions),
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
}
