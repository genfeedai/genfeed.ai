import { startOfReadWeek } from '@api/collections/outlier-library/outlier-library-weekly-read.constants';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { OutlierLibraryPlatform } from '@genfeedai/contracts/interfaces';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

export interface ClaimedOutlierCreator {
  externalId: string;
  handle: string;
  id: string;
  platform: OutlierLibraryPlatform;
}

/**
 * Who may read which creator this week. Two workers run side by side at every
 * deploy, so every step is one conditional write that either wins or does
 * nothing, and the claim carries a lease that runs out when its worker dies.
 *
 * A creator is due when its last attempt is older than this week's start. A
 * claim reserves one unit of the week's budget with a single `claimed < cap`
 * update, so the cap holds however many workers claim at once.
 */
@Traced()
@Injectable()
export class OutlierReadClaimService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Claims the creator whose last attempt is oldest, or returns null when
   * none is due or the week's budget for the platform is spent.
   */
  async claimNext(
    platform: OutlierLibraryPlatform,
    options: {
      cap: number;
      claimId: string;
      leaseMs: number;
      now: Date;
    },
  ): Promise<ClaimedOutlierCreator | null> {
    const { cap, claimId, leaseMs, now } = options;
    const weekStart = startOfReadWeek(now);
    if (cap <= 0) {
      return null;
    }

    const due = {
      AND: [
        {
          OR: [
            { lastReadAttemptAt: null },
            { lastReadAttemptAt: { lt: weekStart } },
          ],
        },
        {
          OR: [{ readClaimedUntil: null }, { readClaimedUntil: { lt: now } }],
        },
      ],
      isDeleted: false,
      platform,
      status: 'active',
    };

    for (;;) {
      const candidate = await this.prisma.outlierCreator.findFirst({
        orderBy: [
          { lastReadAttemptAt: { nulls: 'first', sort: 'asc' } },
          { id: 'asc' },
        ],
        select: { externalId: true, handle: true, id: true },
        where: due,
      });
      if (!candidate) {
        return null;
      }

      // sql-risk-audit: ignore bulk-write-tenant-review -- outlier_creators and outlier_read_budgets are platform tables with no tenant column; the where names one row by id or by platform and week.
      const won = await this.prisma.outlierCreator.updateMany({
        data: {
          readClaimId: claimId,
          readClaimedUntil: new Date(now.getTime() + leaseMs),
        },
        where: { ...due, id: candidate.id },
      });
      if (won.count === 0) {
        // Another worker took this creator first; look at the next one.
        continue;
      }

      await this.prisma.outlierReadBudget.createMany({
        data: [{ claimed: 0, platform, weekStart }],
        skipDuplicates: true,
      });
      // sql-risk-audit: ignore bulk-write-tenant-review -- outlier_creators and outlier_read_budgets are platform tables with no tenant column; the where names one row by id or by platform and week.
      const reserved = await this.prisma.outlierReadBudget.updateMany({
        data: { claimed: { increment: 1 } },
        where: { claimed: { lt: cap }, platform, weekStart },
      });
      if (reserved.count === 0) {
        await this.release(candidate.id, claimId);
        return null;
      }

      return { ...candidate, platform };
    }
  }

  /**
   * Ends a claim with the attempt recorded, which makes the creator not due
   * until next week. Does nothing when the lease ran out and another worker
   * holds the creator now: that worker's result is the one that counts.
   */
  async complete(
    creatorId: string,
    claimId: string,
    outcome: { missed: boolean },
    now: Date,
  ): Promise<boolean> {
    // sql-risk-audit: ignore bulk-write-tenant-review -- outlier_creators and outlier_read_budgets are platform tables with no tenant column; the where names one row by id or by platform and week.
    const done = await this.prisma.outlierCreator.updateMany({
      data: {
        lastReadAttemptAt: now,
        missedReads: outcome.missed ? { increment: 1 } : 0,
        readClaimId: null,
        readClaimedUntil: null,
      },
      where: { id: creatorId, readClaimId: claimId },
    });
    return done.count === 1;
  }

  /** Gives a claim back without recording an attempt. */
  async release(creatorId: string, claimId: string): Promise<void> {
    // sql-risk-audit: ignore bulk-write-tenant-review -- outlier_creators and outlier_read_budgets are platform tables with no tenant column; the where names one row by id or by platform and week.
    await this.prisma.outlierCreator.updateMany({
      data: { readClaimId: null, readClaimedUntil: null },
      where: { id: creatorId, readClaimId: claimId },
    });
  }
}
