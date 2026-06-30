import {
  buildPrelaunchReferenceCorpusSeeds,
  PRELAUNCH_REFERENCE_CORPUS_MINIMUMS,
  PRELAUNCH_REFERENCE_CORPUS_VERSION,
  type PrelaunchReferenceCorpusSeed,
} from '@api/collections/trends/data/prelaunch-reference-corpus.seed';
import { TrendEntity } from '@api/collections/trends/entities/trend.entity';
import type { TrendDocument } from '@api/collections/trends/schemas/trend.schema';
import { TrendSourceItemsService } from '@api/collections/trends/services/modules/trend-source-items.service';
import { TrendReferenceCorpusService } from '@api/collections/trends/services/trend-reference-corpus.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export interface PrelaunchReferenceCorpusBackfillOptions {
  dryRun?: boolean;
  now?: Date;
}

export interface PrelaunchReferenceCorpusBackfillResult {
  createdTrends: number;
  dryRun: boolean;
  plannedCreates: number;
  plannedUpdates: number;
  referenceSync: {
    links: number;
    references: number;
    snapshots: number;
  };
  seedReferences: number;
  seedTrends: number;
  updatedTrends: number;
  version: string;
}

/**
 * Owns prelaunch reference-corpus seeding/backfill and global corpus stats.
 *
 * Extracted from TrendsService (issue #752).
 */
@Injectable()
export class TrendPrelaunchCorpusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loggerService: LoggerService,
    private readonly cacheService: CacheService,
    private readonly trendReferenceCorpusService: TrendReferenceCorpusService,
    private readonly trendSourceItemsService: TrendSourceItemsService,
  ) {}

  async getGlobalCorpusStats(): Promise<{
    activeTrends: number;
    referenceRecords: number;
  }> {
    const now = new Date();
    const [allGlobalTrends, referenceRecords] = await Promise.all([
      this.prisma.trend.findMany({
        where: { isDeleted: false, organizationId: null },
      }),
      this.trendReferenceCorpusService.countGlobalReferences(),
    ]);
    const activeTrends = allGlobalTrends.filter((doc) => {
      const d = doc.data as unknown as Record<string, unknown>;
      return (
        d.isCurrent === true &&
        d.expiresAt != null &&
        new Date(d.expiresAt as string) > now
      );
    }).length;

    return {
      activeTrends,
      referenceRecords,
    };
  }

  async backfillPrelaunchReferenceCorpus(
    options: PrelaunchReferenceCorpusBackfillOptions = {},
  ): Promise<PrelaunchReferenceCorpusBackfillResult> {
    const now = options.now ?? new Date();
    const dryRun = options.dryRun ?? true;
    const seeds = buildPrelaunchReferenceCorpusSeeds(now);
    const seedReferences = seeds.reduce(
      (total, seed) => total + seed.sourcePreview.length,
      0,
    );

    const existingDocs = await this.findPrelaunchCorpusDocs();
    const existingByKey = new Map(
      existingDocs.flatMap((doc) => {
        const key = this.getPrelaunchCorpusKey(doc);
        return key ? [[key, doc] as const] : [];
      }),
    );
    const plannedCreates = seeds.filter(
      (seed) => !existingByKey.has(seed.key),
    ).length;
    const plannedUpdates = seeds.length - plannedCreates;

    if (dryRun) {
      return {
        createdTrends: 0,
        dryRun,
        plannedCreates,
        plannedUpdates,
        referenceSync: { links: 0, references: 0, snapshots: 0 },
        seedReferences,
        seedTrends: seeds.length,
        updatedTrends: 0,
        version: PRELAUNCH_REFERENCE_CORPUS_VERSION,
      };
    }

    const syncedTrends: TrendEntity[] = [];
    let createdTrends = 0;
    let updatedTrends = 0;

    for (const seed of seeds) {
      const trendData = this.buildPrelaunchTrendData(seed, now);
      const existing = existingByKey.get(seed.key);

      if (existing) {
        const updated = await this.prisma.trend.update({
          data: {
            data: trendData,
            isDeleted: false,
          } as never,
          where: { id: existing.id },
        });
        syncedTrends.push(this.toTrendEntity(updated));
        updatedTrends += 1;
        continue;
      }

      const created = await this.prisma.trend.create({
        data: {
          brandId: null,
          data: trendData,
          isDeleted: false,
          organizationId: null,
        } as never,
      });
      syncedTrends.push(this.toTrendEntity(created));
      createdTrends += 1;
    }

    const referenceSync =
      await this.trendReferenceCorpusService.syncTrendReferences(
        syncedTrends.map((trend) =>
          this.trendSourceItemsService.toSyncTrendInput(trend),
        ),
      );

    await this.cacheService.invalidateByTags(['trends', 'trends:content']);

    if (
      seeds.length < PRELAUNCH_REFERENCE_CORPUS_MINIMUMS.trends ||
      seedReferences < PRELAUNCH_REFERENCE_CORPUS_MINIMUMS.sourceReferences
    ) {
      this.loggerService.warn(
        'Prelaunch reference corpus seed is below floor',
        {
          minimums: PRELAUNCH_REFERENCE_CORPUS_MINIMUMS,
          seedReferences,
          seedTrends: seeds.length,
        },
      );
    }

    return {
      createdTrends,
      dryRun,
      plannedCreates,
      plannedUpdates,
      referenceSync,
      seedReferences,
      seedTrends: seeds.length,
      updatedTrends,
      version: PRELAUNCH_REFERENCE_CORPUS_VERSION,
    };
  }

  private async findPrelaunchCorpusDocs(): Promise<
    Array<{ data: unknown; id: string } & Record<string, unknown>>
  > {
    const docs = await this.prisma.trend.findMany({
      // Scan the full seeded corpus: capping the lookup would let older rows
      // fall out of existingByKey and create duplicate prelaunch trends.
      where: {
        brandId: null,
        isDeleted: false,
        organizationId: null,
      } as never,
    });

    return docs.filter((doc) => this.getPrelaunchCorpusKey(doc) != null);
  }

  private getPrelaunchCorpusKey(doc: { data: unknown }): string | null {
    const data = doc.data as Record<string, unknown>;
    const metadata = data.metadata as Record<string, unknown> | undefined;
    const key = metadata?.prelaunchCorpusKey;

    return typeof key === 'string' && key.length > 0 ? key : null;
  }

  private buildPrelaunchTrendData(
    seed: PrelaunchReferenceCorpusSeed,
    now: Date,
  ): Record<string, unknown> {
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const sourceUrls = seed.sourcePreview.map((item) => item.sourceUrl);
    const metadata = {
      ...seed.metadata,
      prelaunchCorpus: true,
      prelaunchCorpusKey: seed.key,
      source: 'public-reference',
      sourcePreviewCache: seed.sourcePreview,
      sourcePreviewCachedAt: now.toISOString(),
      sourcePreviewState: 'fallback',
      sourceSetVersion: PRELAUNCH_REFERENCE_CORPUS_VERSION,
      trendType: seed.sourcePreview.some((item) => item.contentType === 'video')
        ? 'video'
        : 'topic',
      urls: sourceUrls,
    };

    return {
      expiresAt: expiresAt.toISOString(),
      growthRate: seed.growthRate,
      isCurrent: true,
      isDeleted: false,
      mentions: seed.mentions,
      metadata,
      platform: seed.platform,
      requiresAuth: false,
      topic: seed.topic,
      viralityScore: seed.viralityScore,
    };
  }

  private toTrendEntity(
    doc: {
      data: unknown;
    } & Record<string, unknown>,
  ): TrendEntity {
    return new TrendEntity({
      ...doc,
      ...(doc.data as Record<string, unknown>),
    } as unknown as TrendDocument);
  }
}
