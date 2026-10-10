import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import {
  GenerationByokUsage,
  SETTLEABLE_STATUSES,
} from '@api/collections/credits/services/generation-byok-usage';
import {
  isCrunBillingDispositionAllowed,
  recordCrunSubmissionFailure,
  runCrunBillingMutation,
} from '@api/collections/credits/services/generation-crun-billing-guard';
import { GenerationHoldRecoveryService } from '@api/collections/credits/services/generation-hold-recovery.service';
import {
  type HoldReconcileStats,
  pollHoldAtCeiling,
} from '@api/collections/credits/services/generation-hold-recovery-backoff.util';
import { GenerationQuoteGroupService } from '@api/collections/credits/services/generation-quote-group.service';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import type { ReservationCreditsConfig } from '@api/helpers/utils/credits/generation-credit-reservation.util';
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
  MEDIA_GENERATION_INTENT_HOLD_CEILING_MS,
  MEDIA_GENERATION_LATE_SETTLEMENT_KEY_PREFIX,
  MEDIA_GENERATION_LATE_SETTLEMENT_MAX_OVERDRAFT_CREDITS,
  MEDIA_GENERATION_LATE_SETTLEMENT_WINDOW_MS,
  MEDIA_GENERATION_WORKLOAD_TYPE,
} from '@genfeedai/contracts/constants';
import type { ICreditReservation } from '@genfeedai/contracts/interfaces/billing';
import { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';
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
  | 'late-queued'
  | 'already-settled'
  | 'no-hold'
  | 'hold-ended'
  | 'group-handled'
  | 'held';

export type GenerationReleaseOutcome = 'released' | 'no-hold' | 'held';

/** Reconcile leaves a fresh hold to the completion hook before sweeping it. */
const RECONCILE_GRACE_MS = 2 * 60 * 1000;
const RECONCILE_BATCH = 200;
const TERMINAL_FAILURE_STATUSES: readonly string[] = [
  IngredientStatus.FAILED,
  IngredientStatus.REJECTED,
  IngredientStatus.ARCHIVED,
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
  private readonly byok: GenerationByokUsage;

  constructor(
    private readonly credits: CreditsUtilsService,
    private readonly queue: CreditDeductionQueueService,
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly quoteGroups: GenerationQuoteGroupService,
    @Optional() private readonly holdRecovery?: GenerationHoldRecoveryService,
  ) {
    this.byok = new GenerationByokUsage(queue, prisma, logger);
  }

  /**
   * Opens a pool hold for a caller that has no request-level hold (a background
   * task, a workflow node). Throws INSUFFICIENT_CREDITS when the wallet cannot
   * cover it, before any provider work starts.
   */
  async holdForService(params: {
    brandId?: string | null;
    credits: number;
    description: string;
    organizationId: string;
    source: ActivitySource;
    userId: string;
  }): Promise<GenerationBillingRequest> {
    const reservation = await this.credits.reserveCredits({
      actorUserId: params.userId,
      amount: params.credits,
      ...(params.brandId ? { brandId: params.brandId } : {}),
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
        brandId: params.brandId ?? '',
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
      await this.byok.bindOutput(request, output, organizationId);
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

  /** Preserve only the trusted adapter's observed completion in the existing quote ledger. */
  recordProviderCompletion(
    input: Parameters<
      GenerationQuoteGroupService['recordProviderCompletion']
    >[0],
  ): Promise<void> {
    return this.quoteGroups.recordProviderCompletion(input);
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
    if (await this.recordCrunFailure(ingredientId, organizationId)) return;
    if (
      !(await this.crunDispositionAllowed(
        ingredientId,
        organizationId,
        'release',
      ))
    )
      return;
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

  async recordSubmissionRejection(
    ingredientId: string,
    organizationId: string,
  ): Promise<void> {
    if (await this.recordCrunFailure(ingredientId, organizationId)) return;
    if (
      !(await this.crunDispositionAllowed(
        ingredientId,
        organizationId,
        'release',
      ))
    )
      return;
    return persistSubmissionRejection(
      this.prisma,
      ingredientId,
      organizationId,
    );
  }

  abortUnsubmittedOutput(id: string, organizationId: string): Promise<void> {
    return this.quoteGroups.abortUnsubmittedOutput(id, organizationId);
  }

  reconcileAbortedCrunDispatches(now = new Date()): Promise<number> {
    return this.quoteGroups.reconcileAbortedCrunDispatches(now);
  }

  /** Success: queue one reserved settlement for the output's hold. */
  async settleOutput(
    ingredientId: string,
    organizationId: string,
  ): Promise<GenerationSettlementOutcome> {
    if (
      !(await this.crunDispositionAllowed(
        ingredientId,
        organizationId,
        'settle',
      ))
    )
      return 'held';
    if (await this.quoteGroups.reconcileOutput(ingredientId, organizationId))
      return 'group-handled';
    const hold = await this.findHold(ingredientId, organizationId);
    if (!hold) {
      return this.byok.settle(ingredientId, organizationId);
    }
    if (hold.status === CreditReservationStatus.SETTLED) {
      return 'already-settled';
    }
    if (hold.status !== CreditReservationStatus.RESERVED) {
      return this.chargeLateCompletion(hold, ingredientId, organizationId);
    }
    if (!hold.actorUserId) {
      this.logger.error(
        'Generation completed on a credit hold with no actor; reconcile the missing charge',
        { ingredientId, organizationId, reservationId: hold.id },
      );
      return 'hold-ended';
    }
    await this.queue.queueDeduction({
      amount: hold.amount,
      ...(hold.brandId ? { brandId: hold.brandId } : {}),
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

  /**
   * The output finished after its hold was released or expired (#5886). The
   * funds are gone, so the charge is a direct deduction keyed by the dead hold:
   * it settles from the wallet when funds exist and otherwise records the
   * shortfall as a negative balance, the same durable debt every other
   * delivered-then-billed output carries. The key keeps redeliveries and sweeps
   * to one ledger transaction.
   */
  private async chargeLateCompletion(
    hold: ICreditReservation,
    ingredientId: string,
    organizationId: string,
  ): Promise<GenerationSettlementOutcome> {
    const ingredient = await this.prisma.ingredient.findFirst({
      select: { status: true, userId: true },
      where: { id: ingredientId, organizationId, isDeleted: false },
    });
    if (!ingredient || !SETTLEABLE_STATUSES.includes(ingredient.status)) {
      this.logger.log('Credit hold ended without a usable output; no charge', {
        ingredientId,
        organizationId,
        reservationId: hold.id,
        reservationStatus: hold.status,
      });
      return 'hold-ended';
    }
    const userId = hold.actorUserId ?? ingredient.userId;
    if (!userId) {
      this.logger.error(
        'Generation completed after its credit hold ended with no user to charge; reconcile the missing charge',
        { ingredientId, organizationId, reservationId: hold.id },
      );
      return 'hold-ended';
    }
    await this.queue.queueDeduction({
      amount: hold.amount,
      ...(hold.brandId ? { brandId: hold.brandId } : {}),
      description: hold.description ?? 'Media generation',
      idempotencyKey: this.lateSettlementKey(hold.id),
      referenceId: hold.id,
      referenceType: 'credit_reservation',
      maxOverdraftCredits:
        MEDIA_GENERATION_LATE_SETTLEMENT_MAX_OVERDRAFT_CREDITS,
      metadata: {
        assetId: ingredientId,
        lateSettlementOfReservationId: hold.id,
      },
      organizationId,
      source: hold.source ?? ActivitySource.SCRIPT,
      type: 'deduct-credits',
      userId,
    });
    // Operator signal: error level pages through Sentry, and the stable message
    // and fields are what a metric or log query counts.
    this.logger.error(
      'Generation completed after its credit hold ended; charged late',
      {
        amount: hold.amount,
        ingredientId,
        organizationId,
        reservationId: hold.id,
        reservationStatus: hold.status,
      },
    );
    return 'late-queued';
  }

  private lateSettlementKey(reservationId: string): string {
    return `${MEDIA_GENERATION_LATE_SETTLEMENT_KEY_PREFIX}:${reservationId}`;
  }

  private crunMutation<T>(
    ingredientId: string,
    organizationId: string,
    disposition: 'settle' | 'release',
    mutate: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T | 'held' | undefined> {
    return runCrunBillingMutation(
      this.prisma,
      ingredientId,
      organizationId,
      disposition,
      mutate,
    );
  }
  private recordCrunFailure(
    ingredientId: string,
    organizationId: string,
  ): Promise<boolean> {
    return recordCrunSubmissionFailure(
      this.prisma,
      ingredientId,
      organizationId,
    );
  }
  private crunDispositionAllowed(
    ingredientId: string,
    organizationId: string,
    disposition: 'settle' | 'release',
  ): Promise<boolean> {
    return isCrunBillingDispositionAllowed(
      this.prisma,
      ingredientId,
      organizationId,
      disposition,
    );
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
        const receipt = this.byok.readReceipt(row.generationBilling);
        if (!receipt || !row.organizationId) continue;
        try {
          if (
            !(await this.crunDispositionAllowed(
              row.id,
              row.organizationId,
              SETTLEABLE_STATUSES.includes(row.status) ? 'settle' : 'release',
            ))
          )
            continue;
          if (SETTLEABLE_STATUSES.includes(row.status)) {
            await this.byok.settle(row.id, row.organizationId);
          } else if (receipt.submissionIntentProvider) {
            if (
              receipt.confirmedFailure?.ingredientId === row.id &&
              receipt.confirmedFailure.provider ===
                receipt.submissionIntentProvider
            ) {
              await this.byok.fail(row.id, row.organizationId);
            } else continue;
          } else if (TERMINAL_FAILURE_STATUSES.includes(row.status)) {
            await this.byok.fail(row.id, row.organizationId);
          } else if (new Date(receipt.expiresAt) <= now) {
            await this.failStuckIngredient(row.id, row.organizationId);
            const latest = await this.byok.readIngredient(
              row.id,
              row.organizationId,
            );
            if (latest && SETTLEABLE_STATUSES.includes(latest.status))
              await this.byok.settle(row.id, row.organizationId);
            else await this.byok.fail(row.id, row.organizationId);
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
      !(await this.crunDispositionAllowed(
        ingredientId,
        organizationId,
        'release',
      ))
    )
      return 'held';
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
      return this.byok.fail(ingredientId, organizationId);
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
    const stats: HoldReconcileStats = {
      awaitingIntentProof: 0,
      pollsRemaining: 5,
      expiredIntentHolds: 0,
      recoveredIntentHolds: 0,
    };
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
      acted += await this.reconcileHolds(holds, now, stats);
      if (holds.length < RECONCILE_BATCH) break;
      cursor = holds[holds.length - 1].id;
    }
    acted += await this.reconcileByok(now);
    acted += await this.quoteGroups.reconcile(now);
    // The counts are the stuck-hold metric: intent holds still waiting for
    // proof and intent holds this sweep expired.
    this.logger.log('Generation hold reconciliation completed', {
      acted,
      awaitingIntentProof: stats.awaitingIntentProof,
      candidates,
      expiredIntentHolds: stats.expiredIntentHolds,
      recoveredIntentHolds: stats.recoveredIntentHolds,
    });
    return acted;
  }

  /**
   * Charge outputs that completed after their hold ended when the completion
   * hook missed or failed, so a lost signal cannot leave a delivered output
   * unbilled (#5886). Each charge is keyed by its hold, so re-running is safe.
   * Returns how many late charges it queued.
   */
  async reconcileLateCompletions(now = new Date()): Promise<number> {
    let cursor: string | undefined;
    let charged = 0;
    for (;;) {
      // tenant-scope-ignore: platform sweep; each hold carries its organizationId
      const holds = await this.prisma.creditReservation.findMany({
        orderBy: { id: 'asc' },
        take: RECONCILE_BATCH,
        where: {
          ...(cursor ? { id: { gt: cursor } } : {}),
          isDeleted: false,
          status: {
            in: [
              CreditReservationStatus.EXPIRED,
              CreditReservationStatus.RELEASED,
            ],
          },
          updatedAt: {
            gte: new Date(
              now.getTime() - MEDIA_GENERATION_LATE_SETTLEMENT_WINDOW_MS,
            ),
          },
          workloadId: { not: null },
          workloadType: MEDIA_GENERATION_WORKLOAD_TYPE,
        },
      });
      if (holds.length === 0) break;
      charged += await this.chargeLateHolds(holds);
      if (holds.length < RECONCILE_BATCH) break;
      cursor = holds[holds.length - 1].id;
    }
    this.logger.log('Generation late charge reconciliation completed', {
      lateCharges: charged,
    });
    return charged;
  }

  private async chargeLateHolds(
    holds: Array<{
      id: string;
      organizationId: string;
      workloadId: string | null;
    }>,
  ): Promise<number> {
    // tenant-scope-ignore: ids come from the holds above, matched by org below
    const ingredients = await this.prisma.ingredient.findMany({
      select: { id: true, organizationId: true, status: true },
      where: {
        id: {
          in: holds.flatMap((hold) =>
            hold.workloadId ? [hold.workloadId] : [],
          ),
        },
        isDeleted: false,
        status: {
          in: [IngredientStatus.GENERATED, IngredientStatus.VALIDATED],
        },
      },
    });
    const completed = new Set(
      ingredients.map((row) => `${row.organizationId}:${row.id}`),
    );
    const candidates = holds.filter(
      (hold) =>
        hold.workloadId &&
        completed.has(`${hold.organizationId}:${hold.workloadId}`),
    );
    if (candidates.length === 0) return 0;
    // tenant-scope-ignore: keys embed the hold id; rows are matched by org below
    const recorded = await this.prisma.creditTransaction.findMany({
      select: { idempotencyKey: true, organizationId: true },
      where: {
        idempotencyKey: {
          in: candidates.map((hold) => this.lateSettlementKey(hold.id)),
        },
        isDeleted: false,
      },
    });
    const charged = new Set(
      recorded.map((row) => `${row.organizationId}:${row.idempotencyKey}`),
    );

    let queued = 0;
    for (const hold of candidates) {
      const ingredientId = hold.workloadId;
      if (
        !ingredientId ||
        charged.has(`${hold.organizationId}:${this.lateSettlementKey(hold.id)}`)
      )
        continue;
      try {
        if (
          (await this.settleOutput(ingredientId, hold.organizationId)) ===
          'late-queued'
        )
          queued += 1;
      } catch (error: unknown) {
        this.logger.error(
          'Generation late charge reconciliation failed',
          error,
          {
            ingredientId,
            organizationId: hold.organizationId,
            reservationId: hold.id,
          },
        );
      }
    }
    return queued;
  }

  private async reconcileHolds(
    holds: Array<{
      expiresAt: Date;
      id: string;
      organizationId: string;
      workloadId: string | null;
      metadata?: unknown;
      recoveryAttempts?: number;
      recoveryNextAttemptAt?: Date | null;
    }>,
    now: Date,
    stats: HoldReconcileStats,
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
        if (
          !(await this.crunDispositionAllowed(
            ingredientId,
            hold.organizationId,
            ingredient &&
              SETTLEABLE_STATUSES.includes(String(ingredient.status))
              ? 'settle'
              : 'release',
          ))
        )
          continue;
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
          const isFailureConfirmed =
            evidence?.assetId === ingredientId &&
            evidence.confirmedFailure?.ingredientId === ingredientId &&
            evidence.confirmedFailure.provider ===
              evidence.submissionIntent.provider;
          const intent = generationSubmissionIntentSchema.parse(hold.metadata);
          const isPastCeiling =
            intent.submissionIntent.provider !== 'crun' &&
            hold.expiresAt.getTime() +
              MEDIA_GENERATION_INTENT_HOLD_CEILING_MS <=
              now.getTime();
          // A bound submission may have reached the provider, so library
          // deletion, generic failure and elapsed time are not negative proof.
          // Crun resolves through its own task receipts. For any other
          // provider, a hold still unproven at the ceiling stops locking the
          // wallet: an output that completes afterwards is charged late
          // (#5886), so expiry cannot give it away.
          if (isPastCeiling && !isFailureConfirmed) {
            const polled = await pollHoldAtCeiling(
              {
                holdRecovery: this.holdRecovery,
                logger: this.logger,
                prisma: this.prisma,
              },
              hold,
              now,
              stats,
            );
            if (polled === undefined) continue;
            acted += polled;
          } else if (isFailureConfirmed) {
            await this.credits.releaseReservation({
              organizationId: hold.organizationId,

              reservationId: hold.id,
              expectedReservationMetadata: z
                .record(z.string(), z.unknown())
                .parse(hold.metadata),
            });
            acted += 1;
          } else if (hold.expiresAt <= now) {
            stats.awaitingIntentProof += 1;
          }
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
            const latest = await this.byok.readIngredient(
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
    const crun = await this.crunMutation(
      ingredientId,
      organizationId,
      'release',
      async (tx) => {
        const result = await tx.ingredient.updateMany({
          where: {
            id: ingredientId,
            organizationId,
            isDeleted: false,
            status: IngredientStatus.PROCESSING,
          },
          data: { status: IngredientStatus.FAILED },
        });
        return result.count === 1;
      },
    );
    if (crun !== undefined) return crun === true;
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
