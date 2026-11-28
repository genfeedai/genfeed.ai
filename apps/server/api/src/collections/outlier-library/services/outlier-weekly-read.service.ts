import { randomUUID } from 'node:crypto';
import {
  OUTLIER_DAILY_READ_SHARE,
  OUTLIER_READ_CLAIM_LEASE_MS,
  OUTLIER_WEEKLY_READ_CAPS,
} from '@api/collections/outlier-library/outlier-library-weekly-read.constants';
import { OutlierCreatorReaderService } from '@api/collections/outlier-library/readers/outlier-creator-reader.service';
import { OutlierCreatorSeedService } from '@api/collections/outlier-library/services/outlier-creator-seed.service';
import { OutlierLibraryService } from '@api/collections/outlier-library/services/outlier-library.service';
import {
  type ClaimedOutlierCreator,
  OutlierReadClaimService,
} from '@api/collections/outlier-library/services/outlier-read-claim.service';
import { OUTLIER_LIBRARY_PLATFORMS } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

export interface OutlierPlatformReadTotals {
  attempted: number;
  missed: number;
  platform: string;
  read: number;
}

/**
 * The weekly read of tracked creators (#11642). One read per creator per
 * week fills the shared store, so no customer scan pays for a baseline. It
 * runs daily and reads at most a fifth of each platform's weekly cap per run,
 * so a week of runs spreads the spend and a failed day is made up later.
 *
 * An empty or failed read never wipes the last good numbers: `recordRead`
 * changes nothing on a read too thin to know a typical post, and a failure
 * records no read at all. A run where every read of a platform came back
 * empty is logged as an error, because the scraper reports those as succeeded.
 */
@Traced()
@Injectable()
export class OutlierWeeklyReadService {
  constructor(
    private readonly claims: OutlierReadClaimService,
    private readonly library: OutlierLibraryService,
    private readonly readers: OutlierCreatorReaderService,
    private readonly seeds: OutlierCreatorSeedService,
    private readonly logger: LoggerService,
  ) {}

  async run(now: Date = new Date()): Promise<OutlierPlatformReadTotals[]> {
    await this.seeds.seedFromNicheList();
    await this.seeds.seedFromTrendingVideos();

    const totals: OutlierPlatformReadTotals[] = [];
    for (const platform of OUTLIER_LIBRARY_PLATFORMS) {
      const cap = OUTLIER_WEEKLY_READ_CAPS[platform];
      if (cap <= 0 || !(await this.readers.canRead(platform))) {
        continue;
      }
      const perRun = Math.max(1, Math.ceil(cap / OUTLIER_DAILY_READ_SHARE));
      const total: OutlierPlatformReadTotals = {
        attempted: 0,
        missed: 0,
        platform,
        read: 0,
      };
      const claimId = randomUUID();

      for (let index = 0; index < perRun; index += 1) {
        const creator = await this.claims.claimNext(platform, {
          cap,
          claimId,
          leaseMs: OUTLIER_READ_CLAIM_LEASE_MS,
          now,
        });
        if (!creator) {
          break;
        }
        total.attempted += 1;
        const isRead = await this.readOne(creator, claimId, now);
        if (isRead) {
          total.read += 1;
        } else {
          total.missed += 1;
        }
      }

      if (total.attempted > 0 && total.read === 0) {
        this.logger.error('Outlier weekly read came back empty', {
          attempted: total.attempted,
          platform,
        });
      }
      totals.push(total);
    }
    return totals;
  }

  /** True when the read produced posts that were recorded. */
  private async readOne(
    creator: ClaimedOutlierCreator,
    claimId: string,
    now: Date,
  ): Promise<boolean> {
    let isRead = false;
    try {
      const posts = await this.readers.read(creator);
      if (posts.length > 0) {
        await this.library.recordRead(creator.id, posts, now);
        isRead = true;
      }
    } catch (error: unknown) {
      this.logger.warn('Outlier creator read failed', {
        creatorId: creator.id,
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
    await this.claims.complete(creator.id, claimId, { missed: !isRead }, now);
    return isRead;
  }
}
