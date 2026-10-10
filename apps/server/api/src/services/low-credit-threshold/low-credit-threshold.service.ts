import { CreditTransactionsService } from '@api/collections/credits/services/credit-transactions.service';
import { FreeTrialService } from '@api/collections/credits/services/free-trial.service';
import { resolveLowCreditThreshold } from '@api/collections/credits/services/low-credit-threshold.util';
import { DefaultGenerationAffordabilityService } from '@api/services/router/default-generation-affordability.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { ILowCreditStanding } from '@genfeedai/contracts/interfaces/billing';
import { Injectable } from '@nestjs/common';

/**
 * One owner for "is this organization running low?". The credit-deduction
 * alert, the paid credit-low email and the app's low-balance banner all read
 * the threshold from here (`resolveLowCreditThreshold`): one default image
 * for a never-paid organization in its trial, 10% of the latest paid grant
 * (never below one default image) for a paying one, and no alert for an
 * expired trial (admission already refuses it) or when nothing is known.
 */
@Injectable()
export class LowCreditThresholdService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly freeTrialService: FreeTrialService,
    private readonly defaultGenerationAffordability: DefaultGenerationAffordabilityService,
    private readonly creditTransactionsService: CreditTransactionsService,
  ) {}

  async resolve(organizationId: string): Promise<ILowCreditStanding> {
    const trial = await this.freeTrialService.getState(organizationId);
    if (trial.isTrialExpired) {
      return { isTrialSubject: true, threshold: null };
    }
    const isTrialSubject = trial.trialEndsAt !== null;
    const settings = await this.prisma.organizationSetting.findFirst({
      select: { defaultImageModel: true },
      where: { organizationId },
    });
    const [defaultImageCredits, latestPaidGrantCredits] = await Promise.all([
      this.defaultGenerationAffordability.getDefaultImageCredits(
        organizationId,
        settings?.defaultImageModel,
      ),
      isTrialSubject
        ? Promise.resolve(null)
        : this.creditTransactionsService.getLatestPaidGrantCredits(
            organizationId,
          ),
    ]);
    return {
      isTrialSubject,
      threshold: resolveLowCreditThreshold({
        defaultImageCredits,
        isTrialSubject,
        latestPaidGrantCredits,
      }),
    };
  }
}
