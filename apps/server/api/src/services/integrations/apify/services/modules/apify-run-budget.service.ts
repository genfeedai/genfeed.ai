import { CacheService } from '@api/services/cache/services/cache.service';
import type {
  ApifyRunBudgetDecision,
  ApifyRunBudgetLimits,
} from '@api/services/integrations/apify/interfaces/apify.interfaces';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

/**
 * ApifyRunBudgetService
 *
 * Apify bills per actor run, with a fixed platform overhead on every run
 * regardless of how few items it returns. Item limits therefore do nothing to
 * contain spend — the number of runs is the only lever.
 *
 * This is the hard backstop: a Redis-backed hourly and daily run counter, so
 * every API task and worker in the cluster spends from one shared budget. Any
 * caller that gets past every cache, cooldown, and concurrency bound still
 * cannot push the account past its configured ceiling.
 *
 * Budgets are keyed by token scope, so one organization's BYOK key never
 * consumes the hosted budget (and vice versa).
 */
@Injectable()
export class ApifyRunBudgetService {
  /**
   * Conservative enough to stay inside the entry-level Apify plan: the audit in
   * #3572 measured ~1,100 run attempts/day, roughly 7x what the plan sustains.
   */
  private static readonly DEFAULT_MAX_RUNS_PER_HOUR = 25;
  private static readonly DEFAULT_MAX_RUNS_PER_DAY = 150;

  private static readonly HOUR_WINDOW_SECONDS = 60 * 60;
  private static readonly DAY_WINDOW_SECONDS = 24 * 60 * 60;

  private readonly constructorName: string = String(this.constructor.name);
  private readonly limits: ApifyRunBudgetLimits;

  /**
   * Windows already reported as exhausted, so a saturated budget produces one
   * log line per window instead of one per refused call.
   */
  private readonly reportedWindows = new Set<string>();

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly cacheService: CacheService,
  ) {
    this.limits = {
      maxRunsPerDay: this.readLimit(
        'APIFY_MAX_RUNS_PER_DAY',
        ApifyRunBudgetService.DEFAULT_MAX_RUNS_PER_DAY,
      ),
      maxRunsPerHour: this.readLimit(
        'APIFY_MAX_RUNS_PER_HOUR',
        ApifyRunBudgetService.DEFAULT_MAX_RUNS_PER_HOUR,
      ),
    };
  }

  getLimits(): ApifyRunBudgetLimits {
    return { ...this.limits };
  }

  /**
   * Claim one actor run against the scope's budget.
   *
   * The daily window is charged first so a refused run never burns hourly
   * budget it will not use.
   */
  async consumeRun(
    scope: string,
    actorId: string,
  ): Promise<ApifyRunBudgetDecision> {
    const now = new Date();

    const daily = await this.consumeWindow({
      actorId,
      label: 'daily',
      limit: this.limits.maxRunsPerDay,
      now,
      scope,
      windowId: this.buildDayWindowId(now),
      windowSeconds: ApifyRunBudgetService.DAY_WINDOW_SECONDS,
    });

    if (!daily.isAllowed) {
      return daily;
    }

    return this.consumeWindow({
      actorId,
      label: 'hourly',
      limit: this.limits.maxRunsPerHour,
      now,
      scope,
      windowId: this.buildHourWindowId(now),
      windowSeconds: ApifyRunBudgetService.HOUR_WINDOW_SECONDS,
    });
  }

  private async consumeWindow({
    actorId,
    label,
    limit,
    now,
    scope,
    windowId,
    windowSeconds,
  }: {
    actorId: string;
    label: string;
    limit: number;
    now: Date;
    scope: string;
    windowId: string;
    windowSeconds: number;
  }): Promise<ApifyRunBudgetDecision> {
    if (limit <= 0) {
      return { isAllowed: true };
    }

    const key = this.cacheService.generateKey(
      'apify:run-budget',
      scope,
      label,
      windowId,
    );

    const count = await this.cacheService.incr(key);

    // `incr` returns 0 only when the cache is unavailable — a live counter
    // always starts at 1. Fail open: a Redis outage must not stop scraping.
    if (count <= 0) {
      return { isAllowed: true };
    }

    if (count === 1) {
      await this.cacheService.expire(key, windowSeconds);
    }

    if (count <= limit) {
      return { isAllowed: true };
    }

    const retryAfterMs = this.getWindowRemainingMs(now, windowSeconds);
    this.reportExhaustedWindow({
      actorId,
      key,
      label,
      limit,
      retryAfterMs,
      scope,
    });

    return {
      isAllowed: false,
      reason: `Apify ${label} run budget exhausted for the "${scope}" token (${limit} runs)`,
      retryAfterMs,
    };
  }

  private reportExhaustedWindow({
    actorId,
    key,
    label,
    limit,
    retryAfterMs,
    scope,
  }: {
    actorId: string;
    key: string;
    label: string;
    limit: number;
    retryAfterMs: number;
    scope: string;
  }): void {
    if (this.reportedWindows.has(key)) {
      return;
    }

    this.reportedWindows.add(key);

    this.loggerService.warn(
      `${this.constructorName} Apify ${label} run budget of ${limit} exhausted for the "${scope}" token — skipping ${actorId} and every further run for ${Math.round(retryAfterMs / 60000)} minute(s). Raise APIFY_MAX_RUNS_PER_${label === 'daily' ? 'DAY' : 'HOUR'} only alongside the Apify plan that pays for it.`,
      { actorId, label, limit, scope },
    );
  }

  private getWindowRemainingMs(now: Date, windowSeconds: number): number {
    const windowMs = windowSeconds * 1000;
    return windowMs - (now.getTime() % windowMs);
  }

  private buildHourWindowId(now: Date): string {
    return `${this.buildDayWindowId(now)}T${String(now.getUTCHours()).padStart(2, '0')}`;
  }

  private buildDayWindowId(now: Date): string {
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
  }

  private readLimit(key: string, fallback: number): number {
    const raw = this.configService.get(key);
    if (raw === undefined || raw === null || raw === '') {
      return fallback;
    }

    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
}
