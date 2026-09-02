import { PerformanceSource } from '@api/collections/content-performance/schemas/content-performance.schema';
import { mapPostCategoryToContentType } from '@api/collections/content-performance/utils/content-performance-category.util';
import {
  SERVER_TOKENS,
  type ServerBrandMemorySync,
  type ServerLogger,
  type ServerPrisma,
} from '@api/server.dependencies';
import { scopedWhere } from '@api/tenancy/scoped-where';
import type { Prisma } from '@genfeedai/prisma';
import { Inject, Injectable } from '@nestjs/common';

export interface AnalyticsSyncOptions {
  organizationId: string;
  brandId?: string;
  since?: Date;
}

export interface AnalyticsSyncItem {
  brandId: string;
  clicks: number;
  comments: number;
  contentRunId?: string;
  contentType?: ReturnType<typeof mapPostCategoryToContentType>;
  creativeVersion?: string;
  externalPostId?: string;
  generationId?: string;
  hookVersion?: string;
  likes: number;
  measuredAt: string;
  organizationId: string;
  personaId?: string;
  platform?: string;
  postId: string;
  publishIntent?: string;
  saves: number;
  scheduleSlot?: string;
  shares: number;
  sourceAnalyticsId: string;
  userId?: string;
  variantId?: string;
  views: number;
  workflowExecutionId?: string;
}

export interface PersistedAnalyticsSyncItem {
  contentPerformanceId: string;
  item: AnalyticsSyncItem;
}

const MAX_DISCOVERY_ITEMS = 500;

@Injectable()
export class AnalyticsSyncService {
  constructor(
    @Inject(SERVER_TOKENS.prisma)
    private readonly prisma: ServerPrisma,
    @Inject(SERVER_TOKENS.brandMemorySync)
    private readonly brandMemorySyncService: ServerBrandMemorySync,
    @Inject(SERVER_TOKENS.logger)
    private readonly logger: ServerLogger,
  ) {}

  async discoverItems(
    options: AnalyticsSyncOptions,
  ): Promise<{ items: AnalyticsSyncItem[] }> {
    const where: Prisma.PostAnalyticsWhereInput = {
      organizationId: options.organizationId,
      ...(options.brandId ? { brandId: options.brandId } : {}),
      ...(options.since ? { date: { gte: options.since } } : {}),
    };
    const analytics = await this.prisma.postAnalytics.findMany({
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
      take: MAX_DISCOVERY_ITEMS + 1,
      where,
    });
    if (analytics.length > MAX_DISCOVERY_ITEMS) {
      throw new Error(
        `Analytics discovery exceeded ${MAX_DISCOVERY_ITEMS} items; split the workflow window before retrying`,
      );
    }

    const postIds = [...new Set(analytics.map((row) => String(row.postId)))];
    const posts =
      postIds.length === 0
        ? []
        : await this.prisma.post.findMany({
            where: scopedWhere(options.organizationId, {
              id: { in: postIds },
            }),
          });
    const postById = new Map(posts.map((post) => [post.id, post]));

    return {
      items: analytics.map((row) => {
        const postId = String(row.postId);
        const post = postById.get(postId);
        const brandId = row.brandId ?? post?.brandId;
        if (!post || !brandId) {
          throw new Error(
            `Analytics record ${row.id} requires a tenant-scoped post and brand`,
          );
        }
        const contentType = mapPostCategoryToContentType(post.category);
        return {
          brandId,
          clicks: 0,
          comments: row.totalComments ?? 0,
          ...(post.contentRunId ? { contentRunId: post.contentRunId } : {}),
          ...(contentType ? { contentType } : {}),
          ...(post.creativeVersion
            ? { creativeVersion: post.creativeVersion }
            : {}),
          ...(post.externalId ? { externalPostId: post.externalId } : {}),
          ...(post.generationId ? { generationId: post.generationId } : {}),
          ...(post.hookVersion ? { hookVersion: post.hookVersion } : {}),
          likes: row.totalLikes ?? 0,
          measuredAt: new Date(row.date).toISOString(),
          organizationId: options.organizationId,
          ...(post.personaId ? { personaId: post.personaId } : {}),
          ...(row.platform ? { platform: row.platform } : {}),
          postId,
          ...(post.publishIntent ? { publishIntent: post.publishIntent } : {}),
          saves: row.totalSaves ?? 0,
          ...(post.scheduleSlot ? { scheduleSlot: post.scheduleSlot } : {}),
          shares: row.totalShares ?? 0,
          sourceAnalyticsId: row.id,
          ...(row.userId ? { userId: row.userId } : {}),
          ...(post.variantId ? { variantId: post.variantId } : {}),
          views: row.totalViews ?? 0,
          ...(post.workflowExecutionId
            ? { workflowExecutionId: post.workflowExecutionId }
            : {}),
        } satisfies AnalyticsSyncItem;
      }),
    };
  }

  async persistItem(
    organizationId: string,
    value: unknown,
  ): Promise<PersistedAnalyticsSyncItem> {
    const item = this.readItem(value);
    this.assertScope(item, organizationId);
    const measuredAt = new Date(item.measuredAt);
    if (Number.isNaN(measuredAt.getTime())) {
      throw new Error('Analytics item measuredAt must be an ISO timestamp');
    }
    const metrics = {
      comments: item.comments,
      likes: item.likes,
      saves: item.saves,
      shares: item.shares,
      views: item.views,
    };
    const data = {
      brandId: item.brandId,
      comments: item.comments,
      contentRunId: item.contentRunId,
      contentType: item.contentType,
      data: {
        clicks: item.clicks,
        creativeVersion: item.creativeVersion,
        hookVersion: item.hookVersion,
        personaId: item.personaId,
        publishIntent: item.publishIntent,
        scheduleSlot: item.scheduleSlot,
      },
      engagementRate: this.computeEngagementRate(metrics),
      externalPostId: item.externalPostId,
      generationId: item.generationId,
      isDeleted: false,
      likes: item.likes,
      measuredAt,
      organizationId,
      performanceScore: this.computePerformanceScore({
        ...metrics,
        clicks: item.clicks,
      }),
      platform: item.platform,
      postId: item.postId,
      revenue: 0,
      saves: item.saves,
      shares: item.shares,
      source: PerformanceSource.API,
      userId: item.userId,
      variantId: item.variantId,
      views: item.views,
      workflowExecutionId: item.workflowExecutionId,
    };
    const contentPerformanceId = `analytics-sync:${item.sourceAnalyticsId}`;
    const existing = await this.prisma.contentPerformance.findFirst({
      where: scopedWhere(organizationId, { id: contentPerformanceId }),
    });
    if (!existing) {
      await this.prisma.contentPerformance.create({
        data: { ...data, id: contentPerformanceId },
      });
    }
    return { contentPerformanceId, item };
  }

  async syncItemMemory(
    organizationId: string,
    value: unknown,
  ): Promise<PersistedAnalyticsSyncItem> {
    const persisted = this.readPersisted(value);
    this.assertScope(persisted.item, organizationId);
    await this.brandMemorySyncService.syncPostPerformance(
      organizationId,
      persisted.item.brandId,
      persisted.item.postId,
    );
    return persisted;
  }

  async detectItemAlerts(
    organizationId: string,
    value: unknown,
  ): Promise<{ alerts: number; contentPerformanceId: string }> {
    const persisted = this.readPersisted(value);
    this.assertScope(persisted.item, organizationId);
    const alerts = await this.brandMemorySyncService.detectThresholdAlerts(
      organizationId,
      persisted.item.brandId,
    );
    for (const alert of alerts) {
      this.logger.warn(
        `Engagement ${alert.type} detected for brand=${persisted.item.brandId}`,
        alert,
      );
    }
    return {
      alerts: alerts.length,
      contentPerformanceId: persisted.contentPerformanceId,
    };
  }

  async getLastSyncDate(
    organizationId: string,
    brandId?: string,
  ): Promise<Date | null> {
    const latest = await this.prisma.contentPerformance.findFirst({
      orderBy: { createdAt: 'desc' },
      where: scopedWhere(organizationId, {
        ...(brandId ? { brandId } : {}),
        source: PerformanceSource.API,
      }) as Prisma.ContentPerformanceWhereInput,
    });
    if (!latest) {
      return null;
    }
    return this.readMeasuredAt(latest);
  }

  private assertScope(item: AnalyticsSyncItem, organizationId: string): void {
    if (item.organizationId !== organizationId) {
      throw new Error(
        'Analytics item organization does not match workflow scope',
      );
    }
  }

  private readItem(value: unknown): AnalyticsSyncItem {
    const item = this.readRecord(value, 'item');
    const optionalString = (key: keyof AnalyticsSyncItem) => {
      const candidate = item[key];
      return typeof candidate === 'string' && candidate.length > 0
        ? candidate
        : undefined;
    };
    const requiredString = (key: keyof AnalyticsSyncItem) => {
      const candidate = optionalString(key);
      if (!candidate) {
        throw new Error(`Analytics item ${key} is required`);
      }
      return candidate;
    };
    const requiredNumber = (key: keyof AnalyticsSyncItem) => {
      const candidate = item[key];
      if (typeof candidate !== 'number' || !Number.isFinite(candidate)) {
        throw new Error(`Analytics item ${key} must be a finite number`);
      }
      return candidate;
    };
    return {
      brandId: requiredString('brandId'),
      clicks: requiredNumber('clicks'),
      comments: requiredNumber('comments'),
      contentRunId: optionalString('contentRunId'),
      contentType: optionalString(
        'contentType',
      ) as AnalyticsSyncItem['contentType'],
      creativeVersion: optionalString('creativeVersion'),
      externalPostId: optionalString('externalPostId'),
      generationId: optionalString('generationId'),
      hookVersion: optionalString('hookVersion'),
      likes: requiredNumber('likes'),
      measuredAt: requiredString('measuredAt'),
      organizationId: requiredString('organizationId'),
      personaId: optionalString('personaId'),
      platform: optionalString('platform'),
      postId: requiredString('postId'),
      publishIntent: optionalString('publishIntent'),
      saves: requiredNumber('saves'),
      scheduleSlot: optionalString('scheduleSlot'),
      shares: requiredNumber('shares'),
      sourceAnalyticsId: requiredString('sourceAnalyticsId'),
      userId: optionalString('userId'),
      variantId: optionalString('variantId'),
      views: requiredNumber('views'),
      workflowExecutionId: optionalString('workflowExecutionId'),
    };
  }

  private readPersisted(value: unknown): PersistedAnalyticsSyncItem {
    const persisted = this.readRecord(value, 'persisted');
    const contentPerformanceId = persisted.contentPerformanceId;
    if (
      typeof contentPerformanceId !== 'string' ||
      contentPerformanceId.length === 0
    ) {
      throw new Error('Persisted analytics contentPerformanceId is required');
    }
    return {
      contentPerformanceId,
      item: this.readItem(persisted.item),
    };
  }

  private readRecord(value: unknown, name: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`Analytics ${name} must be an object`);
    }
    return value as Record<string, unknown>;
  }

  private readMeasuredAt(value: {
    createdAt: Date;
    measuredAt?: Date | null;
  }): Date {
    return value.measuredAt ?? value.createdAt;
  }

  private computeEngagementRate(metrics: {
    comments: number;
    likes: number;
    saves: number;
    shares: number;
    views: number;
  }): number {
    if (metrics.views === 0) {
      return 0;
    }
    return Number(
      (
        ((metrics.likes + metrics.comments + metrics.shares + metrics.saves) /
          metrics.views) *
        100
      ).toFixed(2),
    );
  }

  private computePerformanceScore(metrics: {
    clicks: number;
    comments: number;
    likes: number;
    saves: number;
    shares: number;
    views: number;
  }): number {
    if (metrics.views === 0) {
      return 0;
    }
    const engagements =
      metrics.likes +
      metrics.comments +
      metrics.shares +
      metrics.saves +
      metrics.clicks;
    return Math.min(100, Math.round((engagements / metrics.views) * 1000));
  }
}
