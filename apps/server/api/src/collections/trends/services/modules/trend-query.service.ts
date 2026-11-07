import { TrendEntity } from '@api/collections/trends/entities/trend.entity';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { Trend } from '@genfeedai/prisma';
import {
  platformOrTenantScope,
  withPlatformTenantArm,
} from '@libs/prisma/platform-scope';
import { crossOrgUnsafe } from '@libs/prisma/tenant-context';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

/**
 * Owns trend read queries against Prisma.
 *
 * Prelaunch/bootstrap fake corpus is hard-cut: discovery returns real rows only
 * (tenant-scoped or genuine global ingestion), never synthetic seed content.
 */
@Traced()
@Injectable()
export class TrendQueryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find current (active) trends for a tenant/platform scope, sorted by
   * virality.
   */
  findActiveTrends(filter: {
    organizationId: string | null;
    brandId: string | null;
    platform?: string;
  }): Promise<TrendEntity[]> {
    return this.queryTrendsByFilter(filter, { activeOnly: true });
  }

  /**
   * Find the most recent good trends regardless of expiry, used as a
   * last-good fallback when no active trends exist.
   */
  findLastGoodTrends(filter: {
    organizationId: string | null;
    brandId: string | null;
    platform?: string;
  }): Promise<TrendEntity[]> {
    return this.queryTrendsByFilter(filter, { activeOnly: false });
  }

  /**
   * Get a single trend by ID, scoped to the organization or global trends.
   */
  async getTrendById(
    trendId: string,
    organizationId?: string,
  ): Promise<TrendEntity | null> {
    // tenant-scope-ignore: platformOrTenantScope limits the lookup to the supplied organization (or the active tenant) plus platform trends; isDeleted is false
    const doc = await this.prisma.trend.findFirst({
      where: {
        id: trendId,
        isDeleted: false,
        ...platformOrTenantScope(organizationId),
      },
    });

    if (!doc) {
      return null;
    }

    if (this.isUnobservedTrend(doc)) {
      return null;
    }

    // If organizationId provided, trend must belong to that org or be global
    if (organizationId) {
      const docOrgId = (doc as unknown as Record<string, unknown>)
        .organizationId;
      if (docOrgId !== organizationId && docOrgId !== null) {
        return null;
      }
    }

    return this.toTrendEntity(doc);
  }

  /**
   * Count active global trends (real rows only — prelaunch seed excluded).
   */
  async countActiveGlobalTrends(): Promise<number> {
    const now = new Date();
    // tenant-scope-ignore: platform trends: organizationId null with the tenant proof from withPlatformTenantArm; isDeleted is false
    const activeGlobalTrends = await this.prisma.trend.findMany({
      select: { data: true, platform: true },
      where: withPlatformTenantArm({
        // A trend without an expiry never expires.
        AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
        isCurrent: true,
        isDeleted: false,
        organizationId: null,
      }),
    });

    return activeGlobalTrends.filter((doc) => !this.isUnobservedTrend(doc))
      .length;
  }

  /**
   * Soft-delete every prelaunch seed trend row so nothing can surface again.
   * Idempotent.
   */
  async purgeSyntheticTrendRows(): Promise<{ purged: number }> {
    // Superadmin maintenance sweep: prelaunch seed rows were planted across
    // every organization, so the purge must see (and soft-delete) all of them.
    return crossOrgUnsafe(async () => await this.purgeSyntheticRows());
  }

  private async purgeSyntheticRows(): Promise<{ purged: number }> {
    // tenant-scope-ignore: platform maintenance sweep — prelaunch seed rows were planted across every organization, so the purge must see all of them
    const docs = await this.prisma.trend.findMany({
      select: { data: true, id: true },
      where: { isDeleted: false },
    });

    const syntheticIds = docs
      .filter((doc) =>
        this.isSyntheticTrendData(
          doc.data as unknown as Record<string, unknown>,
        ),
      )
      .map((doc) => doc.id);

    if (syntheticIds.length === 0) {
      return { purged: 0 };
    }

    // tenant-scope-ignore: purging the synthetic rows found by the sweep above, addressed by their own primary keys
    const result = await this.prisma.trend.updateMany({
      data: { isDeleted: true },
      where: { id: { in: syntheticIds }, isDeleted: false },
    });

    return { purged: result.count };
  }

  /**
   * Hydrate a Prisma trend document (with its nested `data` blob) into a
   * flattened TrendEntity.
   */
  toTrendEntity(
    doc: {
      data: unknown;
    } & Record<string, unknown>,
  ): TrendEntity {
    return new TrendEntity({
      ...doc,
      ...(doc.data as Record<string, unknown>),
    } as unknown as Trend);
  }

  private isUnobservedTrend(doc: {
    data: unknown;
    platform: string | null;
  }): boolean {
    const data = doc.data as Record<string, unknown> | null;
    if (this.isSyntheticTrendData(data)) return true;
    const metadata = data?.metadata;
    return (
      doc.platform === 'linkedin' &&
      !!metadata &&
      typeof metadata === 'object' &&
      'source' in metadata &&
      metadata.source === 'public-reference'
    );
  }

  private isSyntheticTrendData(data: Record<string, unknown> | null): boolean {
    if (!data || typeof data !== 'object') {
      return false;
    }
    const metadata =
      data.metadata && typeof data.metadata === 'object'
        ? (data.metadata as Record<string, unknown>)
        : null;
    if (metadata?.prelaunchCorpus === true) {
      return true;
    }
    if (typeof metadata?.launchCorpusSlice === 'string') {
      return true;
    }
    if (typeof metadata?.prelaunchCorpusKey === 'string') {
      return true;
    }
    if (typeof data.id === 'string' && data.id.startsWith('bootstrap-trend-')) {
      return true;
    }
    return false;
  }

  private async queryTrendsByFilter(
    filter: {
      organizationId: string | null;
      brandId: string | null;
      platform?: string;
    },
    options: { activeOnly: boolean },
  ): Promise<TrendEntity[]> {
    const now = new Date();
    // tenant-scope-ignore: where names the requested organization (or the platform null with the tenant proof from withPlatformTenantArm); isDeleted is false
    const docs = await this.prisma.trend.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      // Platform trends (organizationId null) are read inside tenant requests;
      // the arm names the caller, the null filter still decides.
      where: withPlatformTenantArm({
        brandId: filter.brandId,
        isDeleted: false,
        organizationId: filter.organizationId,
        ...(filter.platform ? { platform: filter.platform } : {}),
        // A trend without an expiry never expires.
        ...(options.activeOnly
          ? {
              AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
              isCurrent: true,
            }
          : {}),
      }),
    });

    return docs
      .filter((doc) => !this.isUnobservedTrend(doc))
      .sort((a, b) => {
        const viralityDelta = (b.viralityScore ?? 0) - (a.viralityScore ?? 0);
        if (options.activeOnly) {
          return viralityDelta;
        }
        return (
          viralityDelta ||
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      })
      .slice(0, 50)
      .map((doc) => this.toTrendEntity(doc));
  }
}
