import { CacheService } from '@api/services/cache/cache.service';
import type {
  ApifyMonthlyUsageResponse,
  ApifyRunBudgetDecision,
  ApifyRunBudgetLimits,
  ApifyRunBudgetReservation,
} from '@api/services/integrations/apify/interfaces/apify.interfaces';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

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
   * #3574 measured ~1,100 run attempts/day, roughly 7x what the plan sustains.
   */
  private static readonly DEFAULT_MAX_RUNS_PER_HOUR = 25;
  private static readonly DEFAULT_MAX_RUNS_PER_DAY = 150;
  private static readonly DEFAULT_MAX_BILLING_PERIOD_USD = 4;
  private static readonly DEFAULT_MAX_TOTAL_CHARGE_USD_PER_RUN = 0.25;
  private static readonly HOSTED_SCOPE = 'hosted';
  private static readonly MICRO_USD_PER_USD = 1_000_000;
  private static readonly MONTHLY_USAGE_TIMEOUT_MS = 15_000;

  private static readonly HOUR_WINDOW_SECONDS = 60 * 60;
  private static readonly DAY_WINDOW_SECONDS = 24 * 60 * 60;
  private static readonly PRIOR_PERIOD_RETENTION_SECONDS = 90 * 24 * 60 * 60;

  private readonly constructorName: string = String(this.constructor.name);
  private readonly limits: ApifyRunBudgetLimits;
  private hostedBillingPeriod?: {
    endAtMs: number;
    usageKey: string;
  };

  /**
   * Windows already reported as exhausted, so a saturated budget produces one
   * log line per window instead of one per refused call.
   */
  private readonly reportedWindows = new Set<string>();

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly cacheService: CacheService,
    private readonly httpService: HttpService,
  ) {
    this.limits = {
      maxBillingPeriodUsd: this.readLimit(
        'APIFY_MAX_BILLING_PERIOD_USD',
        ApifyRunBudgetService.DEFAULT_MAX_BILLING_PERIOD_USD,
      ),
      maxRunsPerDay: this.readLimit(
        'APIFY_MAX_RUNS_PER_DAY',
        ApifyRunBudgetService.DEFAULT_MAX_RUNS_PER_DAY,
      ),
      maxRunsPerHour: this.readLimit(
        'APIFY_MAX_RUNS_PER_HOUR',
        ApifyRunBudgetService.DEFAULT_MAX_RUNS_PER_HOUR,
      ),
      maxTotalChargeUsdPerRun: this.readLimit(
        'APIFY_MAX_TOTAL_CHARGE_USD_PER_RUN',
        ApifyRunBudgetService.DEFAULT_MAX_TOTAL_CHARGE_USD_PER_RUN,
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
    token: string,
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

    const hourly = await this.consumeWindow({
      actorId,
      label: 'hourly',
      limit: this.limits.maxRunsPerHour,
      now,
      scope,
      windowId: this.buildHourWindowId(now),
      windowSeconds: ApifyRunBudgetService.HOUR_WINDOW_SECONDS,
    });

    if (!hourly.isAllowed || scope !== ApifyRunBudgetService.HOSTED_SCOPE) {
      return hourly;
    }

    return this.consumeHostedBillingPeriod(actorId, token, now);
  }

  async reconcileRun(
    reservation: ApifyRunBudgetReservation | undefined,
    actualUsageUsd: number | undefined,
  ): Promise<void> {
    if (!reservation) {
      return;
    }

    if (actualUsageUsd === undefined) {
      this.loggerService.warn(
        'Apify actual usage unavailable; retaining the billing reservation',
        {
          reservedUsd:
            reservation.reservedMicroUsd /
            ApifyRunBudgetService.MICRO_USD_PER_USD,
          usageKey: reservation.usageKey,
        },
      );
      return;
    }

    if (!Number.isFinite(actualUsageUsd) || actualUsageUsd < 0) {
      return;
    }

    const actualMicroUsd = this.toMicroUsd(actualUsageUsd);
    const delta = actualMicroUsd - reservation.reservedMicroUsd;
    if (delta === 0) return;

    await this.cacheService.incr(reservation.usageKey, delta);
  }

  private async consumeHostedBillingPeriod(
    actorId: string,
    token: string,
    now: Date,
  ): Promise<ApifyRunBudgetDecision> {
    if (
      this.limits.maxBillingPeriodUsd <= 0 ||
      this.limits.maxTotalChargeUsdPerRun <= 0
    ) {
      return { isAllowed: true };
    }

    const period = await this.ensureHostedBillingPeriod(token, now);
    if (!period) {
      return {
        isAllowed: false,
        reason:
          'Apify hosted billing-period budget is unavailable; hosted actor starts fail closed',
      };
    }

    const currentMicroUsd = await this.cacheService.get<number>(
      period.usageKey,
    );
    if (typeof currentMicroUsd !== 'number') {
      return {
        isAllowed: false,
        reason:
          'Apify hosted billing-period budget is unavailable; hosted actor starts fail closed',
      };
    }

    const limitMicroUsd = this.toMicroUsd(this.limits.maxBillingPeriodUsd);
    await this.reportBillingThresholds(
      period.usageKey,
      currentMicroUsd,
      limitMicroUsd,
    );
    const configuredReservationMicroUsd = this.toMicroUsd(
      this.limits.maxTotalChargeUsdPerRun,
    );
    const remainingMicroUsd = limitMicroUsd - currentMicroUsd;
    const reservedMicroUsd = Math.min(
      configuredReservationMicroUsd,
      remainingMicroUsd,
    );

    if (reservedMicroUsd <= 0) {
      return this.billingPeriodExhausted(actorId, period.usageKey);
    }

    const reservedTotal = await this.cacheService.incr(
      period.usageKey,
      reservedMicroUsd,
    );
    if (reservedTotal <= 0) {
      return {
        isAllowed: false,
        reason:
          'Apify hosted billing-period budget is unavailable; hosted actor starts fail closed',
      };
    }

    if (reservedTotal > limitMicroUsd) {
      await this.cacheService.incr(period.usageKey, -reservedMicroUsd);
      return this.billingPeriodExhausted(actorId, period.usageKey);
    }

    await this.reportBillingThresholds(
      period.usageKey,
      reservedTotal,
      limitMicroUsd,
    );

    return {
      isAllowed: true,
      maxTotalChargeUsd:
        reservedMicroUsd / ApifyRunBudgetService.MICRO_USD_PER_USD,
      reservation: { reservedMicroUsd, usageKey: period.usageKey },
    };
  }

  private async ensureHostedBillingPeriod(
    token: string,
    now: Date,
  ): Promise<{ usageKey: string } | null> {
    if (
      this.hostedBillingPeriod &&
      now.getTime() <= this.hostedBillingPeriod.endAtMs
    ) {
      return { usageKey: this.hostedBillingPeriod.usageKey };
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get<ApifyMonthlyUsageResponse>(
          'https://api.apify.com/v2/users/me/usage/monthly',
          {
            headers: { Authorization: `Bearer ${token}` },
            timeout: ApifyRunBudgetService.MONTHLY_USAGE_TIMEOUT_MS,
          },
        ),
      );
      const usage = response.data.data;
      const endAtMs = Date.parse(usage.usageCycle.endAt);
      const startAtMs = Date.parse(usage.usageCycle.startAt);
      const currentUsageUsd = usage.totalUsageCreditsUsdAfterVolumeDiscount;

      if (
        !Number.isFinite(endAtMs) ||
        !Number.isFinite(startAtMs) ||
        !Number.isFinite(currentUsageUsd) ||
        endAtMs < now.getTime() ||
        startAtMs > now.getTime()
      ) {
        throw new Error('Apify returned an invalid monthly usage cycle');
      }

      const periodId = usage.usageCycle.startAt.slice(0, 10);
      const usageKey = this.cacheService.generateKey(
        'apify:billing-period-budget',
        ApifyRunBudgetService.HOSTED_SCOPE,
        periodId,
      );
      const initializationKey = `${usageKey}:initialized`;
      const secondsUntilPeriodEnd = Math.max(
        1,
        Math.ceil((endAtMs - now.getTime()) / 1000) + 1,
      );
      // Keep the completed-period ledger long enough for incident review and
      // reconciliation after the next explicit UTC boundary. The next cycle
      // receives a new key, so retention cannot consume the new allowance.
      const ttlSeconds =
        secondsUntilPeriodEnd +
        ApifyRunBudgetService.PRIOR_PERIOD_RETENTION_SECONDS;
      const claim = await this.cacheService.claimOnce(
        initializationKey,
        ttlSeconds,
      );

      if (claim === 'unavailable') return null;
      if (claim === 'claimed') {
        const initialized = await this.cacheService.set(
          usageKey,
          this.toMicroUsd(currentUsageUsd),
          { ttl: ttlSeconds },
        );
        if (!initialized) {
          await this.cacheService.del(initializationKey);
          return null;
        }
      } else {
        const initializedUsage = await this.cacheService.get<number>(usageKey);
        if (typeof initializedUsage !== 'number') return null;
      }

      this.hostedBillingPeriod = { endAtMs, usageKey };
      return { usageKey };
    } catch (error: unknown) {
      this.loggerService.error(
        'ApifyRunBudgetService could not initialize hosted billing-period usage',
        error,
      );
      return null;
    }
  }

  private billingPeriodExhausted(
    actorId: string,
    usageKey: string,
  ): ApifyRunBudgetDecision {
    this.reportExhaustedWindow({
      actorId,
      key: usageKey,
      label: 'billing-period',
      limit: this.limits.maxBillingPeriodUsd,
      retryAfterMs: Math.max(
        0,
        (this.hostedBillingPeriod?.endAtMs ?? Date.now()) - Date.now(),
      ),
      scope: ApifyRunBudgetService.HOSTED_SCOPE,
    });
    return {
      isAllowed: false,
      reason: `Apify billing-period budget exhausted for the hosted token ($${this.limits.maxBillingPeriodUsd})`,
      retryAfterMs: Math.max(
        0,
        (this.hostedBillingPeriod?.endAtMs ?? Date.now()) - Date.now(),
      ),
    };
  }

  private async reportBillingThresholds(
    usageKey: string,
    usageMicroUsd: number,
    limitMicroUsd: number,
  ): Promise<void> {
    for (const threshold of [50, 80, 100]) {
      if (usageMicroUsd * 100 < limitMicroUsd * threshold) continue;
      const reportKey = `${usageKey}:${threshold}`;
      const retentionSeconds = Math.max(
        1,
        Math.ceil(
          ((this.hostedBillingPeriod?.endAtMs ?? Date.now()) - Date.now()) /
            1000,
        ) + ApifyRunBudgetService.PRIOR_PERIOD_RETENTION_SECONDS,
      );
      const claim = await this.cacheService.claimOnce(
        reportKey,
        retentionSeconds,
      );
      if (claim !== 'claimed') continue;
      this.loggerService.warn(
        `Apify hosted billing-period usage reached ${threshold}% of the configured $${this.limits.maxBillingPeriodUsd} ceiling`,
        {
          threshold,
          usageUsd: usageMicroUsd / ApifyRunBudgetService.MICRO_USD_PER_USD,
        },
      );
    }
  }

  private toMicroUsd(value: number): number {
    return Math.round(value * ApifyRunBudgetService.MICRO_USD_PER_USD);
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
    // always starts at 1. Hosted usage fails closed; BYOK remains isolated.
    if (count <= 0) {
      return scope === ApifyRunBudgetService.HOSTED_SCOPE
        ? {
            isAllowed: false,
            reason: `Apify ${label} run budget is unavailable for the hosted token`,
          }
        : { isAllowed: true };
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
      `${this.constructorName} Apify ${label} budget of ${limit} exhausted for the "${scope}" token — skipping ${actorId} and every further run for ${Math.round(retryAfterMs / 60000)} minute(s).`,
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
