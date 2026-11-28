import { OUTLIER_NICHE_SEEDS } from '@api/collections/outlier-library/data/outlier-niche-seeds';
import { OutlierLibraryService } from '@api/collections/outlier-library/services/outlier-library.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Platform } from '@genfeedai/contracts';
import type { OutlierLibraryPlatform } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

const SEED_PLATFORMS: readonly OutlierLibraryPlatform[] = [
  Platform.TIKTOK,
  Platform.INSTAGRAM,
];
const TRENDING_SEED_LIMIT = 1_000;
const LEADING_AT = /^@/;

export interface SeedableVideo {
  creatorHandle?: unknown;
  platform?: unknown;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** The creator behind a scraped video, or null when it names none. */
export function creatorOfVideo(video: SeedableVideo): {
  externalId: string;
  handle: string;
  platform: OutlierLibraryPlatform;
} | null {
  const platform = SEED_PLATFORMS.find((value) => value === video.platform);
  const handle = text(video.creatorHandle)?.replace(LEADING_AT, '');
  if (!platform || !handle) {
    return null;
  }
  // The handle is what a read asks the platform for and is unique on both
  // platforms, so it is the id: one creator seen by two scrapes stays one row.
  return {
    externalId: handle.toLowerCase(),
    handle,
    platform,
  };
}

/**
 * Where tracked creators come from, at no extra scraper spend (#11642): the
 * creators of videos the trends refresh and a brand's niche scan already
 * returned, and a hand list per niche kept in the repository. A customer's
 * followed accounts are never a seed: who a tenant follows stays tenant data,
 * and a niche scan hands over the creator only, never the brand or its query.
 */
@Traced()
@Injectable()
export class OutlierCreatorSeedService {
  constructor(
    private readonly library: OutlierLibraryService,
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  /** Tracks the creators of videos a scrape returned; a bad row never stops the rest. */
  async seedFromVideos(videos: readonly SeedableVideo[]): Promise<number> {
    let tracked = 0;
    for (const video of videos) {
      const creator = creatorOfVideo(video);
      if (!creator) {
        continue;
      }
      try {
        await this.library.trackCreator(creator);
        tracked += 1;
      } catch (error: unknown) {
        this.logger.warn('Outlier creator seed failed', {
          error: error instanceof Error ? error.message : 'unknown',
          platform: creator.platform,
        });
      }
    }
    return tracked;
  }

  async seedFromTrendingVideos(): Promise<number> {
    const rows = await this.prisma.trendingVideo.findMany({
      orderBy: { updatedAt: 'desc' },
      select: { data: true, platform: true },
      take: TRENDING_SEED_LIMIT,
      where: {
        isCurrent: true,
        isDeleted: false,
        platform: { in: [...SEED_PLATFORMS] },
      },
    });
    return this.seedFromVideos(
      rows.map((row) => ({
        ...(typeof row.data === 'object' && row.data && !Array.isArray(row.data)
          ? (row.data as SeedableVideo)
          : {}),
        platform: row.platform,
      })),
    );
  }

  async seedFromNicheList(): Promise<number> {
    let tracked = 0;
    for (const seed of OUTLIER_NICHE_SEEDS) {
      await this.library.trackCreator({
        externalId: seed.handle.toLowerCase(),
        handle: seed.handle,
        nicheTags: [seed.niche],
        platform: seed.platform,
      });
      tracked += 1;
    }
    return tracked;
  }
}
