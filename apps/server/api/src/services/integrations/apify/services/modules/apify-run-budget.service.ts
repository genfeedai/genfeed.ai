import { randomUUID } from 'node:crypto';
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
  /** How often the hosted ledger re-reads provider account usage. */
  private static readonly ACCOUNT_USAGE_REFRESH_MS = 5 * 60 * 1000;

  private static readonly HOUR_WINDOW_SECONDS = 60 * 60;
  private static readonly DAY_WINDOW_SECONDS = 24 * 60 * 60;
  private static readonly PRIOR_PERIOD_RETENTION_SECONDS = 90 * 24 * 60 * 60;

  private readonly constructorName: string = String(this.constructor.name);
  private hasValidHostedLimits = true;
  private readonly limits: ApifyRunBudgetLimits;
  private hostedBillingPeriod?: {
    endAtMs: number;
    usageKey: string;
  };
  private lastHostedUsageRefreshAtMs = 0;

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
    if (
      scope === ApifyRunBudgetService.HOSTED_SCOPE &&
      !this.hasValidHostedLimits
    ) {
      return {
        isAllowed: false,
        reason:
          'Apify hosted budget configuration is invalid; hosted actor starts fail closed',
      };
    }
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

    if (
      actualUsageUsd === undefined ||
      !Number.isFinite(actualUsageUsd) ||
      actualUsageUsd < 0 ||
      !Number.isSafeInteger(this.toMicroUsd(actualUsageUsd)) ||
      !reservation.reservationKey
    ) {
      this.reportRetainedReservation();
      return;
    }
    const result = await this.cacheService.reconcileCounterReservation(
      reservation.usageKey,
      reservation.reservationKey,
      reservation.reservedMicroUsd,
      this.toMicroUsd(actualUsageUsd),
    );
    if (result === 'unavailable') {
      this.reportRetainedReservation();
      return;
    }
    const noted = await this.cacheService.noteSettledResearchReservation(
      reservation.usageKey,
      reservation.reservationKey,
    );
    if (noted === 'unavailable') {
      await this.cacheService.set(
        `${reservation.usageKey}:books-unhealthy`,
        true,
        { ttl: ApifyRunBudgetService.PRIOR_PERIOD_RETENTION_SECONDS },
      );
      this.reportRetainedReservation();
    }
  }

  private reportRetainedReservation(): void {
    this.loggerService.warn(
      'Apify billing reservation retained; verify receipt, actual usage and Redis budget storage',
    );
  }

  private async consumeHostedBillingPeriod(
    actorId: string,
    token: string,
    now: Date,
  ): Promise<ApifyRunBudgetDecision> {
    const period = await this.ensureHostedBillingPeriod(token, now);
    if (!period) {
      return {
        isAllowed: false,
        reason:
          'Apify hosted billing-period budget is unavailable; hosted actor starts fail closed',
      };
    }
    if (
      await this.cacheService.get<boolean>(`${period.usageKey}:books-unhealthy`)
    ) {
      return {
        isAllowed: false,
        reason:
          'Apify hosted cost books are unverified; hosted actor starts fail closed',
      };
    }

    const currentMicroUsd = await this.cacheService.get<number>(
      period.usageKey,
    );
    if (
      typeof currentMicroUsd !== 'number' ||
      !Number.isSafeInteger(currentMicroUsd) ||
      currentMicroUsd < 0
    ) {
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
    const reservationKey = `${period.usageKey}:reservation:${randomUUID()}`;
    const result = await this.cacheService.reserveCounterBudget(
      period.usageKey,
      reservationKey,
      limitMicroUsd,
      configuredReservationMicroUsd,
    );
    if (result.status === 'exhausted')
      return this.billingPeriodExhausted(actorId, period.usageKey);
    if (result.status === 'unavailable') {
      return {
        isAllowed: false,
        reason:
          'Apify hosted billing-period budget is unavailable; hosted actor starts fail closed',
      };
    }
    const reservedMicroUsd = result.reserved;
    const reservedTotal = result.total;
    const noted = await this.cacheService.noteResearchReservation(
      period.usageKey,
      reservationKey,
      reservedMicroUsd,
    );
    if (noted === 'unavailable') {
      await this.cacheService.reconcileCounterReservation(
        period.usageKey,
        reservationKey,
        reservedMicroUsd,
        0,
      );
      return {
        isAllowed: false,
        reason:
          'Apify hosted cost books are unavailable; hosted actor starts fail closed',
      };
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
      reservation: {
        reservationKey,
        reservedMicroUsd,
        usageKey: period.usageKey,
      },
    };
  }

  private async ensureHostedBillingPeriod(
    token: string,
    now: Date,
  ): Promise<{ usageKey: string } | null> {
    const refreshDue =
      now.getTime() - this.lastHostedUsageRefreshAtMs >=
      ApifyRunBudgetService.ACCOUNT_USAGE_REFRESH_MS;
    if (
      this.hostedBillingPeriod &&
      now.getTime() <= this.hostedBillingPeriod.endAtMs &&
      !refreshDue
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
        currentUsageUsd < 0 ||
        !Number.isSafeInteger(this.toMicroUsd(currentUsageUsd)) ||
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
      const initialized = await this.cacheService.initializeCounterBudget(
        usageKey,
        this.toMicroUsd(currentUsageUsd),
        ttlSeconds,
      );
      if (!initialized) return null;
      const imported = await this.cacheService.importHostedAccountUsage(
        usageKey,
        this.toMicroUsd(currentUsageUsd),
      );
      if (imported.status === 'unavailable') return null;

      this.lastHostedUsageRefreshAtMs = now.getTime();
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
    const effective =
      key === 'APIFY_MAX_RUNS_PER_DAY' || key === 'APIFY_MAX_RUNS_PER_HOUR'
        ? parsed
        : this.toMicroUsd(parsed);
    if (
      (typeof raw !== 'string' && typeof raw !== 'number') ||
      (typeof raw === 'string' && raw.trim() === '') ||
      !Number.isFinite(parsed) ||
      parsed <= 0 ||
      !Number.isSafeInteger(effective) ||
      effective <= 0
    ) {
      this.hasValidHostedLimits = false;
    }
    return Number.isFinite(parsed) ? parsed : fallback;
  }
}
