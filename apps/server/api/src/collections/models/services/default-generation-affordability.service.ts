import { ModelCreditQuoteService } from '@api/collections/models/services/model-credit-quote.service';
import { TrialCreditsUsedUpException } from '@api/exceptions/business-logic.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { hasOrganizationBilling, isCloudDeployment } from '@genfeedai/config';
import { getFallbackImageModelKey } from '@genfeedai/contracts/constants';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export interface TrialSpendAdmissionInput {
  hasPaidPlan: boolean;
  isSuperAdmin: boolean;
  organizationId: string;
  /** Read lazily so paid and super-admin requests never pay for a wallet read. */
  readBalance: () => Promise<number>;
  userId: string;
}

/**
 * "Can this organization afford a generation?" The yardstick is one standard
 * image on the deployment's default image model, quoted through the same
 * tariff path as admission, so the rule follows pricing instead of a constant.
 *
 * Trial used up = billing on, no paid plan, not a super admin, onboarding done,
 * and a balance below that price. Admission is all-or-nothing, so a balance can
 * sit above zero yet be unable to pay for anything useful; that is the point
 * where the app asks for a credit pack or a plan.
 */
@Injectable()
export class DefaultGenerationAffordabilityService {
  private readonly context = {
    service: DefaultGenerationAffordabilityService.name,
  };

  constructor(
    private readonly modelCreditQuote: ModelCreditQuoteService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  /** Credits for one default image, or `null` when the tariff cannot be resolved. */
  async getDefaultImageCredits(organizationId: string): Promise<number | null> {
    const modelKey = getFallbackImageModelKey({
      isCloud: isCloudDeployment(),
      nodeEnv: this.configService.get('NODE_ENV'),
    });

    try {
      const credits = await this.modelCreditQuote.quoteByKey(modelKey, {
        organizationId,
        outputs: 1,
      });
      return Number.isFinite(credits) && credits > 0 ? credits : null;
    } catch (error: unknown) {
      this.logger.warn('Default image price is unavailable', {
        ...this.context,
        error: error instanceof Error ? error.message : String(error),
        modelKey,
        organizationId,
      });
      return null;
    }
  }

  /**
   * Whether `balance` pays for one default image. Deployments without
   * organization billing always can. An unresolvable price falls back to "any
   * credits left" so a pricing outage never locks out a funded organization.
   */
  async canAffordDefaultGeneration(
    organizationId: string,
    balance: number,
  ): Promise<boolean> {
    if (!hasOrganizationBilling()) {
      return true;
    }
    if (balance <= 0) {
      return false;
    }

    const price = await this.getDefaultImageCredits(organizationId);
    return price === null || balance >= price;
  }

  /**
   * Refuses a credit-spending action once the trial is used up. Onboarding is
   * never refused here: a user still onboarding keeps spending what they have.
   */
  async assertTrialAllowsSpend(input: TrialSpendAdmissionInput): Promise<void> {
    if (!hasOrganizationBilling() || input.hasPaidPlan || input.isSuperAdmin) {
      return;
    }

    const balance = await input.readBalance();
    if (await this.canAffordDefaultGeneration(input.organizationId, balance)) {
      return;
    }

    const user = await this.prisma.user.findFirst({
      select: { isOnboardingCompleted: true },
      where: { id: input.userId, isDeleted: false },
    });
    if (user?.isOnboardingCompleted !== true) {
      return;
    }

    throw new TrialCreditsUsedUpException(
      (await this.getDefaultImageCredits(input.organizationId)) ?? 0,
      balance,
    );
  }
}
