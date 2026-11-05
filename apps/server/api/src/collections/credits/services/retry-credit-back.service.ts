import { isCreditTransactionConflict } from '@api/collections/credits/services/credit-transaction-conflict';
import { BALANCE_TX_OPTIONS } from '@api/collections/credits/services/credit-transaction-options';
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
import type { IAddCreditsOptions } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
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
 * The normalized texts one attempt goes by. `generationPrompt` is what the
 * provider was sent (the enhanced prompt, brand style included), while the
 * Studio quote and a retry both start from what the user typed, which the
 * linked prompt keeps as `original`. Either one identifies the brief.
 */
function briefTextsOf(attempt: {
  generationPrompt: string | null;
  prompt: { original: string } | null;
}): string[] {
  return [attempt.prompt?.original, attempt.generationPrompt]
    .filter((text): text is string => typeof text === 'string')
    .map(normalizeBriefPrompt)
    .filter((text) => text.length > 0);
}

/**
 * Returns a share of a retry's price as expiring credits when the same user
 * regenerates the same brief on the same model within 24 hours (#7730). The
 * grant is its own ledger entry, written after the retry's charge settles, so
 * quote, hold and settlement parity is untouched. Drafts never count as an
 * attempt, a free-trial organization earns nothing, and a per-user cap bounds
 * the total. Best effort: a failed grant must never fail the charge.
 */
@Traced()
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
        prompt: { select: { original: true } },
        userId: true,
      },
      where: { id: ingredientId, isDeleted: false, organizationId },
    });
    const briefTexts = retry ? briefTextsOf(retry) : [];
    if (
      !retry?.userId ||
      briefTexts.length === 0 ||
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
      prompts: briefTexts,
      since,
      userId,
    });
    const decide = async (db: Pick<PrismaService, 'creditTransaction'>) =>
      decideRetryCreditBack({
        chargedCredits: input.chargedCredits,
        earnedInWindowCredits: await this.earnedSince(
          organizationId,
          userId,
          new Date(Date.now() - RETRY_CREDIT_BACK_WINDOW_MS),
          db,
        ),
        hasPriorAttempt,
        isDraft: false,
        isTrialSubject: trial.trialEndsAt !== null,
      });
    // Cheap early exit only. The amount is decided again inside the ledger
    // transaction, so concurrent grants cannot both spend the same cap.
    if ((await decide(this.prisma)) <= 0) return 0;
    const credits = await this.grantWithinCap({
      decide,
      expiresAt: new Date(Date.now() + RETRY_CREDIT_BACK_EXPIRY_MS),
      options: {
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
      organizationId,
    });
    if (credits <= 0) return 0;
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
      prompts: [input.prompt],
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

  /**
   * Decides the amount and writes the grant in one Serializable transaction,
   * again on every conflict retry, so two concurrent grants cannot both spend
   * the same cap headroom. Returns the credits written (0 if none, or if the
   * grant had already been applied).
   */
  private async grantWithinCap(input: {
    decide: (db: Pick<PrismaService, 'creditTransaction'>) => Promise<number>;
    expiresAt: Date;
    options: IAddCreditsOptions;
    organizationId: string;
  }): Promise<number> {
    const { decide, organizationId, ...grant } = input;
    for (let attempt = 1; ; attempt += 1) {
      try {
        const { credits, result } = await this.prisma.$transaction(
          async (tx) => {
            const decided = await decide(tx);
            if (!(decided > 0)) return { credits: 0, result: null };
            const added = await this.credits.addPromotionalCreditsInTransaction(
              {
                ...grant,
                creditsToAdd: decided,
                description: 'Retry credit back',
                organizationId,
                source: RETRY_CREDIT_BACK_SOURCE,
              },
              tx,
            );
            return { credits: decided, result: added };
          },
          BALANCE_TX_OPTIONS,
        );
        if (!result?.wasApplied) return 0;
        await this.credits.publishCreditAddition(
          organizationId,
          credits,
          result,
        );
        return credits;
      } catch (error: unknown) {
        if (!isCreditTransactionConflict(error) || attempt >= 3) throw error;
      }
    }
  }

  private async hasPriorAttempt(brief: {
    brandId: string | null;
    createdAt: Date;
    ingredientId?: string;
    modelUsed: string;
    organizationId: string;
    /** Every text the brief goes by: what was typed, and what the model was sent. */
    prompts: string[];
    since: Date;
    userId: string;
  }): Promise<boolean> {
    const candidates = await this.prisma.ingredient.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        generationPrompt: true,
        prompt: { select: { original: true } },
      },
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
    const wanted = new Set(brief.prompts.map(normalizeBriefPrompt));
    return candidates.some((candidate) =>
      briefTextsOf(candidate).some((text) => wanted.has(text)),
    );
  }

  private async earnedSince(
    organizationId: string,
    userId: string,
    since: Date,
    db: Pick<PrismaService, 'creditTransaction'> = this.prisma,
  ): Promise<number> {
    const earned = await db.creditTransaction.aggregate({
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
