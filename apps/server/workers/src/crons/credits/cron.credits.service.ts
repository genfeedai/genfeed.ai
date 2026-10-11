import { FreeTrialService } from '@api/collections/credits/services/free-trial.service';
import { ReferralsService } from '@api/collections/referrals/services/referrals.service';
import { CacheService } from '@api/services/cache/cache.service';
import { LoggerService } from '@libs/logger/logger.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { Injectable } from '@nestjs/common';
import {
  FREE_TRIAL_EXPIRY_LOCK_KEY,
  FREE_TRIAL_EXPIRY_LOCK_TTL_SECONDS,
  FREE_TRIAL_EXPIRY_PAGE_SIZE,
} from '@workers/crons/credits/free-trial-expiry.constants';

export type FreeTrialExpiryTotals = {
  expiredCredits: number;
  failed: number;
  organizations: number;
};

/** Platform-scheduled credit maintenance: referral rewards and trial expiry. */
@Injectable()
export class CronCreditsService {
  private readonly context = { service: CronCreditsService.name };

  constructor(
    private readonly referralsService: ReferralsService,
    private readonly freeTrialService: FreeTrialService,
    private readonly cacheService: CacheService,
    private readonly logger: LoggerService,
  ) {}

  settleReferralRewards(): Promise<void> {
    return this.referralsService.settleDueRewards();
  }

  /**
   * Expires the leftover free credits of every never-paid organization past
   * its trial. One organization at a time, each in its own serializable,
   * organization-scoped transaction that re-checks eligibility, so a payment
   * landing mid-sweep is honoured and a re-run changes nothing. A failure on
   * one organization is logged and the sweep moves on; the next tick retries.
   * Returns null when another worker holds the sweep.
   */
  async expireFreeTrials(
    now: Date = new Date(),
  ): Promise<FreeTrialExpiryTotals | null> {
    const isAcquired = await this.cacheService.acquireLock(
      FREE_TRIAL_EXPIRY_LOCK_KEY,
      FREE_TRIAL_EXPIRY_LOCK_TTL_SECONDS,
    );
    if (!isAcquired) {
      this.logger.debug('Free-trial expiry already running, skipping tick', {
        ...this.context,
      });
      return null;
    }

    const totals: FreeTrialExpiryTotals = {
      expiredCredits: 0,
      failed: 0,
      organizations: 0,
    };
    try {
      let cursor: string | undefined;
      while (true) {
        const organizationIds =
          await this.freeTrialService.findExpiryCandidates(
            now,
            cursor,
            FREE_TRIAL_EXPIRY_PAGE_SIZE,
          );
        for (const organizationId of organizationIds) {
          await this.expireOne(organizationId, now, totals);
        }
        if (organizationIds.length < FREE_TRIAL_EXPIRY_PAGE_SIZE) {
          break;
        }
        cursor = organizationIds[organizationIds.length - 1];
      }
      if (totals.organizations > 0 || totals.failed > 0) {
        this.logger.log('Free-trial expiry sweep finished', {
          ...this.context,
          ...totals,
        });
      }
      return totals;
    } finally {
      await this.cacheService.releaseLock(FREE_TRIAL_EXPIRY_LOCK_KEY);
    }
  }

  private async expireOne(
    organizationId: string,
    now: Date,
    totals: FreeTrialExpiryTotals,
  ): Promise<void> {
    try {
      const expiredCredits = await this.freeTrialService.expireTrialCredits(
        organizationId,
        now,
      );
      if (expiredCredits > 0) {
        totals.expiredCredits += expiredCredits;
        totals.organizations += 1;
      }
    } catch (error: unknown) {
      totals.failed += 1;
      this.logger.error('Could not expire free-trial credits', {
        ...this.context,
        error: getErrorMessage(error, { fallback: () => 'unknown error' }),
        organizationId,
      });
    }
  }
}
