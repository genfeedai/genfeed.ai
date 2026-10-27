import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { FreeTrialService } from '@api/collections/credits/services/free-trial.service';
import {
  decideRetryCreditBack,
  normalizeBriefPrompt,
} from '@api/collections/credits/services/retry-credit-back.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { usesMeteredCredits } from '@genfeedai/config';
import { IngredientStatus } from '@genfeedai/contracts';
import {
  RETRY_CREDIT_BACK_EXPIRY_MS,
  RETRY_CREDIT_BACK_SOURCE,
  RETRY_CREDIT_BACK_WINDOW_MS,
} from '@genfeedai/contracts/constants';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

/** Attempts of one brief the matcher compares against, newest first. */
const PRIOR_ATTEMPT_SCAN_LIMIT = 50;

/** An earlier output the user saw, whether or not they kept it. */
const PRIOR_ATTEMPT_STATUSES = [
  IngredientStatus.GENERATED,
  IngredientStatus.VALIDATED,
  IngredientStatus.REJECTED,
];

/**
 * Returns a share of a retry's price as expiring credits when the same user
 * regenerates the same brief on the same model within 24 hours (#7730). The
 * grant is its own ledger entry, written after the retry's charge settles, so
 * quote, hold and settlement parity is untouched. Drafts never count as an
 * attempt, a free-trial organization earns nothing, and a per-user cap bounds
 * the total. Best effort: a failed grant must never fail the charge.
 */
@Injectable()
export class RetryCreditBackService {
  private readonly constructorName = 'RetryCreditBackService';

  constructor(
    private readonly prisma: PrismaService,
    private readonly credits: CreditsUtilsService,
    private readonly freeTrial: FreeTrialService,
    private readonly logger: LoggerService,
  ) {}

  /** Credits granted for this settled output, or 0 when it earns none. */
  async grantForSettledOutput(input: {
    chargedCredits: number;
    ingredientId: string;
    organizationId: string;
  }): Promise<number> {
    if (!usesMeteredCredits() || !(input.chargedCredits > 0)) return 0;
    const { ingredientId, organizationId } = input;
    const idempotencyKey = `${RETRY_CREDIT_BACK_SOURCE}:${ingredientId}`;
    const granted = await this.prisma.creditTransaction.findFirst({
      select: { id: true },
      where: { idempotencyKey, isDeleted: false, organizationId },
    });
    if (granted) return 0;
    const retry = await this.prisma.ingredient.findFirst({
      select: {
        brandId: true,
        createdAt: true,
        generationPrompt: true,
        isDraftRender: true,
        modelUsed: true,
        userId: true,
      },
      where: { id: ingredientId, isDeleted: false, organizationId },
    });
    if (
      !retry?.userId ||
      !retry.generationPrompt ||
      !retry.modelUsed ||
      retry.isDraftRender
    ) {
      return 0;
    }
    const userId = retry.userId;
    const since = new Date(
      retry.createdAt.getTime() - RETRY_CREDIT_BACK_WINDOW_MS,
    );
    const trial = await this.freeTrial.getState(organizationId);
    const hasPriorAttempt = await this.hasPriorAttempt({
      brandId: retry.brandId,
      createdAt: retry.createdAt,
      ingredientId,
      modelUsed: retry.modelUsed,
      organizationId,
      prompt: retry.generationPrompt,
      since,
      userId,
    });
    const credits = decideRetryCreditBack({
      chargedCredits: input.chargedCredits,
      earnedInWindowCredits: await this.earnedSince(
        organizationId,
        userId,
        new Date(Date.now() - RETRY_CREDIT_BACK_WINDOW_MS),
      ),
      hasPriorAttempt,
      isDraft: false,
      isTrialSubject: trial.trialEndsAt !== null,
    });
    if (credits <= 0) return 0;
    await this.credits.addOrganizationCreditsWithExpiration(
      organizationId,
      credits,
      RETRY_CREDIT_BACK_SOURCE,
      'Retry credit back',
      new Date(Date.now() + RETRY_CREDIT_BACK_EXPIRY_MS),
      {
        actorUserId: userId,
        brandId: retry.brandId,
        idempotencyKey,
        metadata: {
          chargedCredits: input.chargedCredits,
          ingredientId,
          kind: 'promotional',
        },
        referenceId: ingredientId,
        referenceType: RETRY_CREDIT_BACK_SOURCE,
      },
    );
    this.logger.log(`${this.constructorName} granted retry credit back`, {
      credits,
      ingredientId,
      organizationId,
    });
    return credits;
  }

  /**
   * Credits a retry would earn back if the user generated this brief now, for
   * the Studio quote line. Same rules as the grant, no ledger write. Zero for
   * anything that earns nothing (first attempt, trial, cap reached).
   */
  async previewForBrief(input: {
    brandId: string | null;
    chargedCredits: number;
    modelKey: string;
    organizationId: string;
    prompt: string;
    userId: string;
  }): Promise<number> {
    if (
      !usesMeteredCredits() ||
      !(input.chargedCredits > 0) ||
      !input.prompt.trim() ||
      !input.modelKey
    ) {
      return 0;
    }
    const now = new Date();
    const trial = await this.freeTrial.getState(input.organizationId);
    const hasPriorAttempt = await this.hasPriorAttempt({
      brandId: input.brandId,
      createdAt: now,
      modelUsed: input.modelKey,
      organizationId: input.organizationId,
      prompt: input.prompt,
      since: new Date(now.getTime() - RETRY_CREDIT_BACK_WINDOW_MS),
      userId: input.userId,
    });
    return decideRetryCreditBack({
      chargedCredits: input.chargedCredits,
      earnedInWindowCredits: await this.earnedSince(
        input.organizationId,
        input.userId,
        new Date(now.getTime() - RETRY_CREDIT_BACK_WINDOW_MS),
      ),
      hasPriorAttempt,
      isDraft: false,
      isTrialSubject: trial.trialEndsAt !== null,
    });
  }

  /** The same, but a failure is logged and never thrown. */
  async grantBestEffort(input: {
    chargedCredits: number;
    ingredientId: string;
    organizationId: string;
  }): Promise<void> {
    try {
      await this.grantForSettledOutput(input);
    } catch (error: unknown) {
      this.logger.error(`${this.constructorName} retry credit back failed`, {
        error,
        ingredientId: input.ingredientId,
        organizationId: input.organizationId,
      });
    }
  }

  private async hasPriorAttempt(brief: {
    brandId: string | null;
    createdAt: Date;
    ingredientId?: string;
    modelUsed: string;
    organizationId: string;
    prompt: string;
    since: Date;
    userId: string;
  }): Promise<boolean> {
    const candidates = await this.prisma.ingredient.findMany({
      orderBy: { createdAt: 'desc' },
      select: { generationPrompt: true },
      take: PRIOR_ATTEMPT_SCAN_LIMIT,
      where: {
        brandId: brief.brandId,
        createdAt: { gte: brief.since, lt: brief.createdAt },
        ...(brief.ingredientId ? { id: { not: brief.ingredientId } } : {}),
        isDeleted: false,
        isDraftRender: false,
        modelUsed: brief.modelUsed,
        organizationId: brief.organizationId,
        status: { in: PRIOR_ATTEMPT_STATUSES },
        userId: brief.userId,
      },
    });
    const wanted = normalizeBriefPrompt(brief.prompt);
    return candidates.some(
      (candidate) =>
        candidate.generationPrompt !== null &&
        normalizeBriefPrompt(candidate.generationPrompt) === wanted,
    );
  }

  private async earnedSince(
    organizationId: string,
    userId: string,
    since: Date,
  ): Promise<number> {
    const earned = await this.prisma.creditTransaction.aggregate({
      _sum: { amount: true },
      where: {
        actorUserId: userId,
        createdAt: { gte: since },
        isDeleted: false,
        organizationId,
        source: RETRY_CREDIT_BACK_SOURCE,
      },
    });
    return earned._sum.amount ?? 0;
  }
}
