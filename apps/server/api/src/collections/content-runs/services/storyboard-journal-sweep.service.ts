import { StoryboardAssetBibleService } from '@api/collections/content-runs/services/storyboard-asset-bible.service';
import { isLiveAssetOperation } from '@api/collections/content-runs/services/storyboard-asset-bible-state';
import { storyboardStoredRunConfigSchema } from '@api/collections/content-runs/services/storyboard-imported-run-state.schema';
import { isLiveShotRenderOperation } from '@api/collections/content-runs/services/storyboard-shot-render-state';
import { StoryboardShotRendersService } from '@api/collections/content-runs/services/storyboard-shot-renders.service';
import { isLiveStillOperation } from '@api/collections/content-runs/services/storyboard-still-state';
import { StoryboardStillsService } from '@api/collections/content-runs/services/storyboard-stills.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { STORYBOARD_RUN_CONTRACT } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import type { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

/** Runs reconciled per page. */
const STORYBOARD_JOURNAL_SWEEP_LIMIT = 25;

/** Pages drained per tick: 100 runs, so one tick stays bounded. */
const STORYBOARD_JOURNAL_SWEEP_MAX_PAGES = 4;

/**
 * Only runs touched in this window are swept. A paid hold lives two hours, so
 * a journal operation still live after three days belongs to a run nobody
 * will reopen and the next page open reconciles it.
 */
const STORYBOARD_JOURNAL_SWEEP_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

type JournalKey =
  | 'stillOperations'
  | 'shotRenderOperations'
  | 'assetOperations';

/** A paid journal operation that no provider verdict has settled yet. */
const LIVE_JOURNAL_FILTERS: Prisma.ContentRunWhereInput[] = (
  ['stillOperations', 'shotRenderOperations', 'assetOperations'] as const
).flatMap((journal: JournalKey) =>
  (['pending', 'submitted'] as const).map((state) => ({
    config: { path: [journal], array_contains: [{ state }] },
  })),
);

export type StoryboardJournalSweepResult = {
  /** Runs with at least one live paid operation that the sweep visited. */
  runCount: number;
  /** Runs where one of the reconcilers threw. */
  failedCount: number;
};

/**
 * Settles or releases the paid storyboard journals without an open page.
 *
 * Stills, shot renders and asset bible images dispatch with deferred credits:
 * the credits sit in a hold, and the journal settles a rendered operation or
 * releases a failed one only when its run is reconciled. The Studio page and
 * the agent `reconcile` action did that, so a creator who closed the page left
 * a hold that `CreditReservationService.expireDue` released two hours later,
 * and a render that succeeded was never charged (#9651).
 *
 * The sweep visits runs that still have a live operation and calls the same
 * reconcilers the page does. Each one reads the provider verdict from the
 * placeholder and writes through the run store's compare-and-set, so a sweep
 * racing an open page or another worker cannot charge an operation twice or
 * overwrite a newer revision. Settlement never exceeds the held amount: the
 * journal settles the quoted credits against the reservation, and an expired
 * or released hold is never charged again.
 *
 * It reads across organizations by design: a platform maintenance sweep, not a
 * tenant-facing query. Each candidate carries its own `organizationId`, and
 * every read and write after the candidate query is tenant scoped.
 */
@Traced()
@Injectable()
export class StoryboardJournalSweepService {
  /** Where the next sweep resumes, so a backlog cannot starve newer runs. */
  private cursor?: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stills: StoryboardStillsService,
    private readonly renders: StoryboardShotRendersService,
    private readonly assets: StoryboardAssetBibleService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Visits up to `maxPages` pages of `limit` runs, stopping early once the
   * backlog is drained. The cron runs this just before the generic expiry
   * sweep, which releases every due hold, so a backlog longer than one page
   * is drained here rather than left for the next tick.
   */
  async sweep(
    limit: number = STORYBOARD_JOURNAL_SWEEP_LIMIT,
    maxPages: number = STORYBOARD_JOURNAL_SWEEP_MAX_PAGES,
  ): Promise<StoryboardJournalSweepResult> {
    let runCount = 0;
    let failedCount = 0;
    for (let page = 0; page < maxPages; page += 1) {
      const result = await this.sweepPage(limit);
      runCount += result.runCount;
      failedCount += result.failedCount;
      if (result.isDrained) break;
      if (page === maxPages - 1)
        this.logger.warn('Storyboard journal sweep left a backlog', {
          pageCount: maxPages,
          limit,
        });
    }
    return { runCount, failedCount };
  }

  private async sweepPage(
    limit: number,
  ): Promise<StoryboardJournalSweepResult & { isDrained: boolean }> {
    const candidates = await this.findCandidates(limit);
    // A short page means the backlog is drained; start from the top next time.
    const isDrained = candidates.length < limit;
    this.cursor = isDrained ? undefined : candidates.at(-1)?.id;
    let runCount = 0;
    let failedCount = 0;
    for (const candidate of candidates) {
      const parsed = storyboardStoredRunConfigSchema.safeParse(
        candidate.config,
      );
      if (!parsed.success || !candidate.brandId) {
        this.logger.warn('Storyboard journal sweep skipped an invalid run', {
          runId: candidate.id,
          organizationId: candidate.organizationId,
        });
        continue;
      }
      const { organizationId, brandId, id: runId } = candidate;
      const config = parsed.data;
      const reconcilers: Array<[string, () => Promise<unknown>]> = [];
      if ((config.assetOperations ?? []).some(isLiveAssetOperation))
        reconcilers.push([
          'assets',
          () => this.assets.reconcile(organizationId, brandId, runId),
        ]);
      if ((config.stillOperations ?? []).some(isLiveStillOperation))
        reconcilers.push([
          'stills',
          () => this.stills.reconcile(organizationId, brandId, runId),
        ]);
      if ((config.shotRenderOperations ?? []).some(isLiveShotRenderOperation))
        reconcilers.push([
          'renders',
          () => this.renders.reconcile(organizationId, brandId, runId),
        ]);
      if (!reconcilers.length) continue;
      runCount += 1;
      let isFailed = false;
      for (const [journal, reconcile] of reconcilers) {
        try {
          await reconcile();
        } catch (error: unknown) {
          // One bad run or journal must not stop the sweep from reaching the rest.
          isFailed = true;
          this.logger.error(
            'Storyboard journal sweep failed for a run',
            error,
            {
              journal,
              runId,
              organizationId,
            },
          );
        }
      }
      if (isFailed) failedCount += 1;
    }
    if (runCount > 0)
      this.logger.log('Storyboard journal sweep completed', {
        runCount,
        failedCount,
      });
    return { runCount, failedCount, isDrained };
  }

  private async findCandidates(limit: number) {
    // tenant-scope-ignore: platform maintenance sweep — it must find storyboard runs with live paid journal operations across every organization, and each result carries its own organizationId so every later read and write stays scoped
    return this.prisma.contentRun.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, organizationId: true, brandId: true, config: true },
      take: limit,
      where: {
        contract: STORYBOARD_RUN_CONTRACT,
        isDeleted: false,
        updatedAt: {
          gte: new Date(Date.now() - STORYBOARD_JOURNAL_SWEEP_WINDOW_MS),
        },
        OR: LIVE_JOURNAL_FILTERS,
        ...(this.cursor ? { id: { gt: this.cursor } } : {}),
      },
    });
  }
}
