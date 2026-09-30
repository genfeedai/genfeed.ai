import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { GenerationQuoteGroupService } from '@api/collections/credits/services/generation-quote-group.service';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import type { ReservationCreditsConfig } from '@api/helpers/utils/credits/generation-credit-reservation.util';
import { generationUsageReceiptSchema as usageReceiptSchema } from '@api/helpers/utils/credits/generation-submission-evidence.schema';
import {
  generationSubmissionIntentSchema,
  persistSubmissionFailure,
  persistSubmissionRejection,
  submittedGenerationMetadataSchema,
} from '@api/helpers/utils/credits/persist-submission-failure.util';
import { CreditDeductionQueueService } from '@api/queues/credit-deduction/credit-deduction-queue.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ActivitySource,
  CreditReservationStatus,
  IngredientStatus,
} from '@genfeedai/contracts';
import {
  GENERATION_POOL_WORKLOAD_TYPE,
  MEDIA_GENERATION_HOLD_TTL_MS,
  MEDIA_GENERATION_WORKLOAD_TYPE,
} from '@genfeedai/contracts/constants';
import type {
  ICreditReservation,
  IGenerationUsageReceipt,
} from '@genfeedai/contracts/interfaces/billing';
import { Prisma, toPrismaJson } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';

/** The request-shaped input every generation billing step reads. */
export interface GenerationBillingRequest {
  creditsConfig?: ReservationCreditsConfig & {
    boundOutputCount?: number;
    isPoolReleaseDeferred?: boolean;
  };
  user?: AuthenticatedUser;
}

export type GenerationSettlementOutcome =
  | 'queued'
  | 'already-settled'
  | 'no-hold'
  | 'hold-ended'
  | 'group-handled';

export type GenerationReleaseOutcome = 'released' | 'no-hold';

/** Reconcile leaves a fresh hold to the completion hook before sweeping it. */
const RECONCILE_GRACE_MS = 2 * 60 * 1000;
const RECONCILE_BATCH = 200;
const TERMINAL_FAILURE_STATUSES: readonly string[] = [
  IngredientStatus.FAILED,
  IngredientStatus.REJECTED,
  IngredientStatus.ARCHIVED,
];
const SETTLEABLE_STATUSES: readonly string[] = [
  IngredientStatus.GENERATED,
  IngredientStatus.VALIDATED,
];

/**
 * The one billing contract for async media generation (#5657).
 *
 * 1. The credits guard reserves the request's price into a pool hold.
 * 2. When the provider accepts an output, the service `bindOutput`s it: that
 *    output's share moves from the pool into its own hold.
 * 3. The completion path `settleOutput`s the hold on success or `releaseOutput`s
 *    it on failure. A sweep (`reconcile`) settles or releases any hold whose
 *    ingredient already ended, so a lost webhook cannot strand credits.
 *
 * Settlement is a queued reserved-settlement job keyed by the hold, so webhook
 * and poll retries collapse into one CreditTransaction.
 */
@Injectable()
export class GenerationBillingService {
  constructor(
    private readonly credits: CreditsUtilsService,
    private readonly queue: CreditDeductionQueueService,
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly quoteGroups: GenerationQuoteGroupService,
  ) {}

  /**
   * Opens a pool hold for a caller that has no request-level hold (a background
   * task, a workflow node). Throws INSUFFICIENT_CREDITS when the wallet cannot
   * cover it, before any provider work starts.
   */
  async holdForService(params: {
    credits: number;
    description: string;
    organizationId: string;
    source: ActivitySource;
    userId: string;
  }): Promise<GenerationBillingRequest> {
    const reservation = await this.credits.reserveCredits({
      actorUserId: params.userId,
      amount: params.credits,
      description: params.description,
      expiresAt: new Date(Date.now() + MEDIA_GENERATION_HOLD_TTL_MS),
      idempotencyKey: `${GENERATION_POOL_WORKLOAD_TYPE}:${randomUUID()}`,
      organizationId: params.organizationId,
      source: params.source,
      workloadType: GENERATION_POOL_WORKLOAD_TYPE,
    });
    return {
      creditsConfig: {
        amount: params.credits,
        description: params.description,
        reservationId: reservation.id,
        settlement: 'completion',
        source: params.source,
      },
      user: {
        brandId: '',
        id: params.userId,
        organizationId: params.organizationId,
        userId: params.userId,
      },
    };
  }

  /**
   * True when the request holds platform credits on a completion-settled route,
   * so accepted outputs can be bound to it. A route that settles on response
   * keeps its hold whole for the interceptor.
   */
  hasPool(request: GenerationBillingRequest): boolean {
    const config = request.creditsConfig;
    return Boolean(
      config?.settlement === 'completion' &&
        config.reservationId &&
        !config.isByokBypass &&
        (config.amount ?? 0) > 0,
    );
  }

  /**
   * Binds an output to its own hold before provider dispatch, so a fast
   * completion callback always finds immutable funding for that output.
   */
  async bindOutput(
    request: GenerationBillingRequest,
    output: {
      credits: number;
      ingredientId: string;
      submissionIntentProvider?: string;
    },
  ): Promise<void> {
    const config = request.creditsConfig;
    const organizationId = request.user?.organizationId;
    if (
      config?.settlement === 'completion' &&
      config.isByokBypass &&
      organizationId
    ) {
      await this.bindByokOutput(request, output, organizationId);
      return;
    }
    if (
      config?.modelQuote &&
      (config.amount ?? 0) > 0 &&
      !config.isByokBypass &&
      organizationId
    ) {
      await this.quoteGroups.bindOutput(request, output.ingredientId);
      request.creditsConfig = {
        ...config,
        boundOutputCount: (config.boundOutputCount ?? 0) + 1,
      };
      return;
    }
    if (!config?.reservationId || !organizationId || !this.hasPool(request)) {
      return;
    }
    const bound = await this.credits.bindReservationOutput({
      amount: output.credits,
      expiresAt: new Date(Date.now() + MEDIA_GENERATION_HOLD_TTL_MS),
      metadata: {
        assetId: output.ingredientId,
        ...(output.submissionIntentProvider
          ? {
              submissionIntent: {
                version: 1,
                provider: output.submissionIntentProvider,
              },
            }
          : {}),
      },
      organizationId,
      reservationId: config.reservationId,
      workloadId: output.ingredientId,
    });
    request.creditsConfig = {
      ...config,
      boundOutputCount: (config.boundOutputCount ?? 0) + 1,
    };
    this.logger.log('Generation output bound to its credit hold', {
      amount: bound.amount,
      ingredientId: output.ingredientId,
      organizationId,
      reservationId: bound.id,
    });
  }

  /**
   * Called by a service that binds further outputs after the response returns
   * (multi-output fan-out). The request hold then stays open until the service
   * calls `releasePool`; the hold's TTL backstops a service that never does.
   */
  deferPoolRelease(request: GenerationBillingRequest): void {
    if (request.creditsConfig?.reservationId) {
      request.creditsConfig = {
        ...request.creditsConfig,
        isPoolReleaseDeferred: true,
      };
    }
  }

  /** Releases whatever no output claimed (dispatch never reached acceptance). */
  async releasePool(request: GenerationBillingRequest): Promise<void> {
    const reservationId = request.creditsConfig?.reservationId;
    const organizationId = request.user?.organizationId;
    if (!reservationId || !organizationId) {
      return;
    }
    try {
      if (request.creditsConfig?.modelQuote) {
        await this.quoteGroups.closeDispatch(reservationId, organizationId);
        return;
      }
      await this.credits.releaseReservation({ organizationId, reservationId });
    } catch (error: unknown) {
      this.logger.error('Generation pool release failed', error, {
        organizationId,
        reservationId,
      });
    }
  }

  /** Persist a provider attachment retry without charging at acceptance. */
  async rememberAcceptedOutput(input: {
    ingredientId: string;
    externalId: string;
    organizationId: string;
    userId: string;
  }): Promise<void> {
    await this.queue.queueDeduction({
      amount: 0,
      description: 'Accepted generation attachment recovery',
      idempotencyKey: `media-generation-attach:${input.ingredientId}`,
      acceptedGeneration: {
        ingredientId: input.ingredientId,
        externalId: input.externalId,
      },
      organizationId: input.organizationId,
      userId: input.userId,
      source: ActivitySource.VIDEO_GENERATION,
      type: 'deduct-credits',
    });
  }

  async recordProviderFailure(
    ingredientId: string,
    organizationId: string,
  ): Promise<void> {
    await persistSubmissionFailure(
      this.prisma,
      {
        id: ingredientId,
        organizationId,
        isDeleted: false,
        status: IngredientStatus.FAILED,
      },
      { status: IngredientStatus.FAILED },
      true,
    );
  }

  recordSubmissionRejection(
    ingredientId: string,
    organizationId: string,
  ): Promise<void> {
    return persistSubmissionRejection(
      this.prisma,
      ingredientId,
      organizationId,
    );
  }

  /** Success: queue one reserved settlement for the output's hold. */
  async settleOutput(
    ingredientId: string,
    organizationId: string,
  ): Promise<GenerationSettlementOutcome> {
    if (await this.quoteGroups.reconcileOutput(ingredientId, organizationId))
      return 'group-handled';
    const hold = await this.findHold(ingredientId, organizationId);
    if (!hold) {
      return this.settleByokOutput(ingredientId, organizationId);
    }
    if (hold.status === CreditReservationStatus.SETTLED) {
      return 'already-settled';
    }
    if (hold.status !== CreditReservationStatus.RESERVED || !hold.actorUserId) {
      this.logger.error(
        'Generation completed after its credit hold ended; reconcile the missing charge',
        { ingredientId, organizationId, reservationId: hold.id },
      );
      return 'hold-ended';
    }
    await this.queue.queueDeduction({
      amount: hold.amount,
      description: hold.description ?? 'Media generation',
      idempotencyKey: `${MEDIA_GENERATION_WORKLOAD_TYPE}-settle:${hold.id}`,
      metadata: hold.metadata ?? undefined,
      organizationId,
      reservationId: hold.id,
      source: hold.source ?? ActivitySource.SCRIPT,
      type: 'deduct-credits',
      userId: hold.actorUserId,
    });
    this.logger.log('Generation credit settlement queued', {
      ingredientId,
      organizationId,
      reservationId: hold.id,
    });
    return 'queued';
  }

  private async bindByokOutput(
    request: GenerationBillingRequest,
    output: {
      credits: number;
      ingredientId: string;
      submissionIntentProvider?: string;
    },
    organizationId: string,
  ): Promise<void> {
    const config = request.creditsConfig;
    const userId = request.user?.userId ?? request.user?.id;
    if (!config || !userId)
      throw new BusinessLogicException('BYOK usage identity is required');
    const receipt: IGenerationUsageReceipt = usageReceiptSchema.parse({
      kind: 'byok',
      amount: output.credits,
      description: config.description,
      expiresAt: new Date(
        Date.now() + MEDIA_GENERATION_HOLD_TTL_MS,
      ).toISOString(),
      source: config.source ?? ActivitySource.SCRIPT,
      state: 'pending',
      userId,
      submissionIntentProvider: output.submissionIntentProvider,
    });
    const linked = await this.prisma.ingredient.updateMany({
      data: { generationBilling: toPrismaJson(receipt) },
      where: {
        id: output.ingredientId,
        organizationId,
        isDeleted: false,
        generationBilling: { equals: Prisma.DbNull },
      },
    });
    if (linked.count !== 1) {
      const existing = await this.readByokIngredient(
        output.ingredientId,
        organizationId,
      );
      if (!existing || !this.readUsageReceipt(existing.generationBilling))
        throw new BusinessLogicException('BYOK output linkage failed');
    }
    request.creditsConfig = {
      ...config,
      boundOutputCount: (config.boundOutputCount ?? 0) + 1,
    };
    this.logger.log('Generation BYOK usage linked', {
      organizationId,
      ingredientId: output.ingredientId,
    });
  }

  private readUsageReceipt(value: unknown): IGenerationUsageReceipt | null {
    const parsed = usageReceiptSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
  }

  private readByokIngredient(ingredientId: string, organizationId: string) {
    return this.prisma.ingredient.findFirst({
      select: { id: true, status: true, generationBilling: true },
      where: { id: ingredientId, organizationId, isDeleted: false },
    });
  }

  private async settleByokOutput(
    ingredientId: string,
    organizationId: string,
  ): Promise<GenerationSettlementOutcome> {
    const ingredient = await this.readByokIngredient(
      ingredientId,
      organizationId,
    );
    const receipt = this.readUsageReceipt(ingredient?.generationBilling);
    if (!ingredient || !receipt) return 'no-hold';
    if (receipt.state === 'recorded') return 'already-settled';
    if (
      receipt.state === 'failed' ||
      !SETTLEABLE_STATUSES.includes(ingredient.status)
    )
      return 'hold-ended';
    const idempotencyKey = `media-generation-usage:${ingredientId}`;
    const recorded = await this.prisma.creditTransaction.findFirst({
      select: { id: true },
      where: {
        organizationId,
        isDeleted: false,
        idempotencyKey: `byok:${organizationId}:${idempotencyKey}`,
      },
    });
    if (recorded) {
      await this.prisma.ingredient.updateMany({
        data: {
          generationBilling: toPrismaJson({ ...receipt, state: 'recorded' }),
        },
        where: {
          id: ingredientId,
          organizationId,
          isDeleted: false,
          status: {
            in: [IngredientStatus.GENERATED, IngredientStatus.VALIDATED],
          },
        },
      });
      return 'already-settled';
    }
    await this.queue.queueByokUsage({
      amount: receipt.amount,
      description: receipt.description,
      idempotencyKey,
      metadata: { assetId: ingredientId },
      organizationId,
      source: receipt.source,
      type: 'record-byok-usage',
      userId: receipt.userId,
    });
    // Keep the receipt pending until the ledger confirms usage. Enqueue acknowledgement
    // is not proof of worker completion; a crash here is safe to reconcile.
    this.logger.log('Generation BYOK completion usage queued', {
      ingredientId,
      organizationId,
      idempotencyKey,
    });
    return 'queued';
  }

  private async failByokOutput(
    ingredientId: string,
    organizationId: string,
  ): Promise<GenerationReleaseOutcome> {
    const ingredient = await this.readByokIngredient(
      ingredientId,
      organizationId,
    );
    const receipt = this.readUsageReceipt(ingredient?.generationBilling);
    if (!ingredient || !receipt) return 'no-hold';
    if (SETTLEABLE_STATUSES.includes(ingredient.status)) return 'released';
    await this.prisma.ingredient.updateMany({
      data: {
        generationBilling: toPrismaJson({ ...receipt, state: 'failed' }),
      },
      where: {
        id: ingredientId,
        organizationId,
        isDeleted: false,
        status: {
          notIn: [IngredientStatus.GENERATED, IngredientStatus.VALIDATED],
        },
      },
    });
    this.logger.log('Generation BYOK usage cancelled', {
      ingredientId,
      organizationId,
    });
    return 'released';
  }

  private async reconcileByok(now: Date): Promise<number> {
    let cursor: string | undefined;
    let acted = 0;
    for (;;) {
      // tenant-scope-ignore: server-only receipt sweep; mutations re-scope to each row's organization
      const rows = await this.prisma.ingredient.findMany({
        orderBy: { id: 'asc' },
        take: RECONCILE_BATCH,
        select: {
          id: true,
          organizationId: true,
          status: true,
          generationBilling: true,
        },
        where: {
          ...(cursor ? { id: { gt: cursor } } : {}),
          isDeleted: false,
          createdAt: { lte: new Date(now.getTime() - RECONCILE_GRACE_MS) },
          generationBilling: { path: ['state'], equals: 'pending' },
        },
      });
      for (const row of rows) {
        const receipt = this.readUsageReceipt(row.generationBilling);
        if (!receipt || !row.organizationId) continue;
        try {
          if (SETTLEABLE_STATUSES.includes(row.status)) {
            await this.settleByokOutput(row.id, row.organizationId);
          } else if (receipt.submissionIntentProvider) {
            if (
              receipt.confirmedFailure?.ingredientId === row.id &&
              receipt.confirmedFailure.provider ===
                receipt.submissionIntentProvider
            ) {
              await this.failByokOutput(row.id, row.organizationId);
            } else continue;
          } else if (TERMINAL_FAILURE_STATUSES.includes(row.status)) {
            await this.failByokOutput(row.id, row.organizationId);
          } else if (new Date(receipt.expiresAt) <= now) {
            await this.failStuckIngredient(row.id, row.organizationId);
            const latest = await this.readByokIngredient(
              row.id,
              row.organizationId,
            );
            if (latest && SETTLEABLE_STATUSES.includes(latest.status))
              await this.settleByokOutput(row.id, row.organizationId);
            else await this.failByokOutput(row.id, row.organizationId);
          } else continue;
          acted += 1;
        } catch (error: unknown) {
          this.logger.error(
            'Generation BYOK usage reconciliation failed',
            error,
            { ingredientId: row.id, organizationId: row.organizationId },
          );
        }
      }
      if (rows.length < RECONCILE_BATCH) break;
      cursor = rows[rows.length - 1].id;
    }
    return acted;
  }

  /** Failure or timeout: give the output's hold back without charging. */
  async releaseOutput(
    ingredientId: string,
    organizationId: string,
    reason: 'release' | 'expiry' = 'release',
  ): Promise<GenerationReleaseOutcome> {
    if (
      await this.quoteGroups.reconcileOutput(
        ingredientId,
        organizationId,
        reason === 'release',
      )
    )
      return 'released';
    const hold = await this.findHold(ingredientId, organizationId);
    if (!hold) {
      return this.failByokOutput(ingredientId, organizationId);
    }
    if (hold.status === CreditReservationStatus.RESERVED) {
      await this.credits.releaseReservation({
        organizationId,
        reason,
        reservationId: hold.id,
      });
      this.logger.log('Generation credit hold released', {
        ingredientId,
        organizationId,
        reason,
        reservationId: hold.id,
      });
    }
    return 'released';
  }

  /**
   * Sweep: settle a hold whose ingredient finished, release one whose
   * ingredient failed or vanished, and fail then release one that outlived its
   * TTL still PROCESSING. Returns how many holds it acted on.
   */
  async reconcile(now = new Date()): Promise<number> {
    let cursor: string | undefined;
    let acted = 0;
    let candidates = 0;
    for (;;) {
      // tenant-scope-ignore: platform sweep; each hold carries its organizationId
      const holds = await this.prisma.creditReservation.findMany({
        orderBy: { id: 'asc' },
        take: RECONCILE_BATCH,
        where: {
          ...(cursor ? { id: { gt: cursor } } : {}),
          createdAt: { lte: new Date(now.getTime() - RECONCILE_GRACE_MS) },
          isDeleted: false,
          status: CreditReservationStatus.RESERVED,
          workloadId: { not: null },
          workloadType: MEDIA_GENERATION_WORKLOAD_TYPE,
        },
      });
      if (holds.length === 0) break;
      candidates += holds.length;
      acted += await this.reconcileHolds(holds, now);
      if (holds.length < RECONCILE_BATCH) break;
      cursor = holds[holds.length - 1].id;
    }
    acted += await this.reconcileByok(now);
    acted += await this.quoteGroups.reconcile(now);
    this.logger.log('Generation hold reconciliation completed', {
      acted,
      candidates,
    });
    return acted;
  }

  private async reconcileHolds(
    holds: Array<{
      expiresAt: Date;
      id: string;
      organizationId: string;
      workloadId: string | null;
      metadata?: unknown;
    }>,
    now: Date,
  ): Promise<number> {
    // tenant-scope-ignore: ids come from the holds above, matched by org below
    const ingredients = await this.prisma.ingredient.findMany({
      select: {
        id: true,
        isDeleted: true,
        organizationId: true,
        status: true,
      },
      where: {
        id: {
          in: holds.flatMap((hold) =>
            hold.workloadId ? [hold.workloadId] : [],
          ),
        },
      },
    });
    const byKey = new Map(
      ingredients.map((row) => [`${row.organizationId}:${row.id}`, row]),
    );

    let acted = 0;
    for (const hold of holds) {
      const ingredientId = hold.workloadId;
      if (!ingredientId) continue;
      try {
        const ingredient = byKey.get(`${hold.organizationId}:${ingredientId}`);
        const status = String(ingredient?.status ?? '');
        if (
          ingredient &&
          !ingredient.isDeleted &&
          SETTLEABLE_STATUSES.includes(status)
        ) {
          await this.settleOutput(ingredientId, hold.organizationId);
        } else if (
          generationSubmissionIntentSchema.safeParse(hold.metadata).success
        ) {
          const proof = submittedGenerationMetadataSchema.safeParse(
            hold.metadata,
          );
          const evidence = proof.success ? proof.data : null;
          if (
            evidence?.assetId === ingredientId &&
            evidence.confirmedFailure?.ingredientId === ingredientId &&
            evidence.confirmedFailure.provider ===
              evidence.submissionIntent.provider
          ) {
            await this.credits.releaseReservation({
              organizationId: hold.organizationId,
              reservationId: hold.id,
              expectedReservationMetadata: z
                .record(z.string(), z.unknown())
                .parse(hold.metadata),
            });
            acted += 1;
          }
          // A bound submission may have reached the provider. Library deletion,
          // generic failure and elapsed time cannot establish negative proof.
          continue;
        } else if (
          !ingredient ||
          ingredient.isDeleted ||
          TERMINAL_FAILURE_STATUSES.includes(status)
        ) {
          await this.releaseOutput(ingredientId, hold.organizationId);
        } else if (hold.expiresAt <= now) {
          const failed = await this.failStuckIngredient(
            ingredientId,
            hold.organizationId,
          );
          if (!failed) {
            const latest = await this.readByokIngredient(
              ingredientId,
              hold.organizationId,
            );
            if (latest && SETTLEABLE_STATUSES.includes(latest.status)) {
              await this.settleOutput(ingredientId, hold.organizationId);
              acted += 1;
              continue;
            }
            if (latest && !TERMINAL_FAILURE_STATUSES.includes(latest.status))
              continue;
          }
          await this.releaseOutput(ingredientId, hold.organizationId, 'expiry');
        } else {
          continue;
        }
        acted += 1;
      } catch (error: unknown) {
        this.logger.error('Generation hold reconciliation failed', error, {
          ingredientId,
          organizationId: hold.organizationId,
          reservationId: hold.id,
        });
      }
    }

    return acted;
  }

  private async failStuckIngredient(
    ingredientId: string,
    organizationId: string,
  ): Promise<boolean> {
    const claimed = await this.prisma.ingredient.updateMany({
      data: { status: IngredientStatus.FAILED },
      where: {
        id: ingredientId,
        isDeleted: false,
        organizationId,
        status: IngredientStatus.PROCESSING,
      },
    });
    if (claimed.count !== 1) return false;
    this.logger.warn('Generation still processing at hold expiry; failed', {
      ingredientId,
      organizationId,
    });
    return true;
  }

  private async findHold(
    ingredientId: string,
    organizationId: string,
  ): Promise<ICreditReservation | null> {
    return this.credits.findReservationForWorkload({
      organizationId,
      workloadId: ingredientId,
      workloadType: MEDIA_GENERATION_WORKLOAD_TYPE,
    });
  }
}

export function requirePositiveCredits(credits: number): number {
  if (!Number.isFinite(credits) || !(credits > 0)) {
    throw new BusinessLogicException(
      'Generation credits must be a positive number',
    );
  }
  return credits;
}
