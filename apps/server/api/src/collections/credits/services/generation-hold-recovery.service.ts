import { CreditReservationService } from '@api/collections/credits/services/credit-reservation.service';
import { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { generationSubmissionIntentSchema } from '@api/helpers/utils/credits/persist-submission-failure.util';
import type { PrismaTransactionClient } from '@api/helpers/utils/transaction/transaction.util';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import { ApiKeyHelperService } from '@api/services/api-key/api-key-helper.service';
import { ByokService } from '@api/services/byok/byok.service';
import { readHeygenVideoStatus } from '@api/services/integrations/heygen/heygen-video-status';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { usesMeteredCredits } from '@genfeedai/config';
import {
  ActivityKey,
  ActivitySource,
  CreditHoldRecoveryAction,
  CreditReservationStatus,
  IngredientStatus,
  parseCreditReservationStatus,
} from '@genfeedai/contracts';
import {
  MEDIA_GENERATION_LATE_SETTLEMENT_KEY_PREFIX,
  MEDIA_GENERATION_WORKLOAD_TYPE,
} from '@genfeedai/contracts/constants';
import type {
  AdminCreditHoldReport,
  AdminCreditHoldRow,
  CreditHoldRecoveryInput,
} from '@genfeedai/contracts/interfaces';
import type { CreditReservation } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { z } from 'zod';

const PAGE_SIZE = 50;
/** An unreadable provider status at the ceiling stays reserved for an operator this long. */
export const UNKNOWN_PROVIDER_STATUS_RELEASE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const COMPLETED = [IngredientStatus.GENERATED, IngredientStatus.VALIDATED];

@Injectable()
export class GenerationHoldRecoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reservations: CreditReservationService,
    private readonly activities: ActivityRecorderService,
    private readonly byok: ByokService,
    private readonly apiKeys: ApiKeyHelperService,
    private readonly http: HttpService,
    private readonly logger: LoggerService,
    private readonly bootstrapCache: AccessBootstrapCacheService,
  ) {}

  /** Five calls per sweep are budgeted by the caller. Never hold DB locks while polling. */
  async recoverAtCeiling(
    organizationId: string,
    reservationId: string,
  ): Promise<CreditHoldRecoveryAction | undefined> {
    const hold = await this.prisma.creditReservation.findFirst({
      where: { id: reservationId, organizationId, isDeleted: false },
    });
    if (!hold || hold.status !== CreditReservationStatus.RESERVED) return;
    await this.assertEligible(hold, this.prisma);
    const ingredient = await this.prisma.ingredient.findFirst({
      where: { id: hold.workloadId ?? '', organizationId, isDeleted: false },
      select: {
        id: true,
        status: true,
        generationProvider: true,
        metadata: { select: { externalId: true } },
      },
    });
    const intent = generationSubmissionIntentSchema.safeParse(hold.metadata);
    const externalId = ingredient?.metadata?.externalId;
    const status =
      intent.success &&
      intent.data.submissionIntent.provider === 'heygen' &&
      externalId
        ? await readHeygenVideoStatus(
            externalId,
            organizationId,
            this.byok,
            this.apiKeys,
            this.http,
            this.logger,
            10_000,
            ingredient?.generationProvider,
          )
        : null;
    const isCompleted =
      (ingredient &&
        COMPLETED.includes(ingredient.status as IngredientStatus)) ||
      status?.status === 'completed';
    // Release only on positive provider failure, or when nothing was ever
    // submitted. A provider we could not read may still have a finished video,
    // so the hold stays reserved for an operator (admin credit-holds control).
    const isReleasable = status ? status.status === 'failed' : true;
    const isUnknownExpired =
      !isCompleted &&
      !isReleasable &&
      hold.expiresAt.getTime() + UNKNOWN_PROVIDER_STATUS_RELEASE_AFTER_MS <=
        Date.now();
    if (!isCompleted && !isReleasable && !isUnknownExpired) {
      this.logger.warn(
        'Credit hold held for operator review: provider status unknown at ceiling',
        { organizationId, reservationId, providerStatus: status?.status },
      );
      return;
    }
    const action = isCompleted
      ? CreditHoldRecoveryAction.CHARGE
      : CreditHoldRecoveryAction.RELEASE;
    await this.apply({
      organizationId,
      reservationId,
      action,
      reason: isCompleted
        ? 'Provider completed at credit-hold ceiling'
        : isUnknownExpired
          ? 'Unknown provider status after 7d at credit-hold ceiling'
          : status
            ? 'Provider confirmed failure at credit-hold ceiling'
            : 'No provider submission at credit-hold ceiling',
      expectedProviderExternalId: externalId ?? null,
      expectedReservationMetadata: z
        .record(z.string(), z.unknown())
        .parse(hold.metadata),
      expiry: true,
    });
    return action;
  }

  async list(
    organizationId: string,
    cursor?: string,
  ): Promise<AdminCreditHoldReport> {
    const now = new Date();
    const holds = await this.prisma.creditReservation.findMany({
      where: {
        organizationId,
        isDeleted: false,
        workloadType: MEDIA_GENERATION_WORKLOAD_TYPE,
        expiresAt: { lte: now },
        status: {
          in: [
            CreditReservationStatus.RESERVED,
            CreditReservationStatus.EXPIRED,
            CreditReservationStatus.RELEASED,
          ],
        },
        id: cursor ? { gt: cursor } : undefined,
      },
      orderBy: { id: 'asc' },
      take: PAGE_SIZE + 1,
    });
    const rows: AdminCreditHoldRow[] = [];
    for (const hold of holds.slice(0, PAGE_SIZE)) {
      let blockedReason: string | null = null;
      try {
        await this.assertEligible(hold, this.prisma);
      } catch (error: unknown) {
        if (!(error instanceof BusinessLogicException)) throw error;
        blockedReason = error.message;
      }
      const ingredient = await this.prisma.ingredient.findFirst({
        where: { id: hold.workloadId ?? '', organizationId, isDeleted: false },
        select: { status: true, userId: true },
      });
      const completed =
        !!ingredient &&
        COMPLETED.includes(ingredient.status as IngredientStatus);
      const intent = generationSubmissionIntentSchema.safeParse(hold.metadata);
      rows.push({
        id: hold.id,
        amount: hold.amount,
        status: parseCreditReservationStatus(hold.status),
        ingredientId: hold.workloadId,
        provider: intent.success ? intent.data.submissionIntent.provider : null,
        expiresAt: hold.expiresAt.toISOString(),
        canRelease:
          !blockedReason &&
          !completed &&
          hold.status === CreditReservationStatus.RESERVED,
        canCharge: !blockedReason && !!(hold.actorUserId ?? ingredient?.userId),
        blockedReason:
          blockedReason ??
          (completed
            ? 'Completed output must be charged'
            : !(hold.actorUserId ?? ingredient?.userId)
              ? 'Missing original payer'
              : null),
      });
    }
    return {
      id: `credit-holds:${organizationId}`,
      organizationId,
      retrievedAt: now.toISOString(),
      rows,
      nextCursor: holds.length > PAGE_SIZE ? rows[rows.length - 1].id : null,
    };
  }

  /** Money, reservation CAS and operator audit commit or roll back together. */
  async apply(input: CreditHoldRecoveryInput): Promise<void> {
    if (!usesMeteredCredits())
      throw new ServiceUnavailableException(
        'Credit holds are unavailable in this edition',
      );
    const reason = input.reason.trim();
    if (reason.length < 8 || reason.length > 500)
      throw new BusinessLogicException(
        'Provide a recovery reason between 8 and 500 characters',
      );
    const recorded = await this.reservations.runSerializable(async (tx) => {
      const hold = await tx.creditReservation.findFirst({
        where: {
          id: input.reservationId,
          organizationId: input.organizationId,
          isDeleted: false,
        },
      });
      if (!hold) throw new NotFoundException('Credit hold');
      await this.assertEligible(hold, tx);
      if (hold.expiresAt > new Date())
        throw new BusinessLogicException('Credit hold is not stuck yet');
      const ingredient = await tx.ingredient.findFirst({
        where: {
          id: hold.workloadId ?? '',
          organizationId: input.organizationId,
          isDeleted: false,
        },
        select: {
          status: true,
          userId: true,
          metadata: { select: { externalId: true } },
        },
      });
      if (
        input.expectedProviderExternalId !== undefined &&
        input.expectedProviderExternalId !==
          (ingredient?.metadata?.externalId ?? null)
      )
        throw new BusinessLogicException(
          'Provider identity changed during recovery',
        );
      if (
        input.action === CreditHoldRecoveryAction.RELEASE &&
        ingredient &&
        COMPLETED.includes(ingredient.status as IngredientStatus)
      )
        throw new BusinessLogicException('Completed output must be charged');
      const snapshot =
        input.action === CreditHoldRecoveryAction.CHARGE
          ? await this.reservations.settleInTransaction(
              {
                organizationId: input.organizationId,
                reservationId: hold.id,
                actualAmount: hold.amount,
                actorUserId: this.payer(hold, ingredient?.userId),
                description: hold.description ?? 'Recovered media generation',
                source:
                  Object.values(ActivitySource).find(
                    (source) => source === hold.source,
                  ) ?? ActivitySource.SCRIPT,
                metadata: { recoveredReservationId: hold.id },
                expectedReservationMetadata: input.expectedReservationMetadata,
                settlementIdempotencyKey: `${MEDIA_GENERATION_LATE_SETTLEMENT_KEY_PREFIX}:${hold.id}`,
              },
              tx,
              true,
            )
          : await this.reservations.releaseInTransaction(
              {
                organizationId: input.organizationId,
                reservationId: hold.id,
                reason: input.expiry ? 'expiry' : 'release',
                expectedReservationMetadata: input.expectedReservationMetadata,
              },
              tx,
            );
      const after = await tx.creditReservation.findFirst({
        where: {
          id: hold.id,
          organizationId: input.organizationId,
          isDeleted: false,
        },
      });
      return this.activities.recordInTransaction(tx, {
        key:
          input.action === CreditHoldRecoveryAction.CHARGE
            ? ActivityKey.CREDITS_REMOVE
            : ActivityKey.CREDITS_ADD,
        organizationId: input.organizationId,
        userId: input.operatorUserId ?? hold.actorUserId ?? undefined,
        source: ActivitySource.SCRIPT,
        // The ledger emits the monetary activity; this records the operator action.
        value: JSON.stringify({
          description: `Credit hold ${input.action}: ${reason}`,
          value: 0,
        }),
        data: {
          operation: 'media-credit-hold-recovery',
          action: input.action,
          reason,
          reservationId: hold.id,
          operatorUserId: input.operatorUserId ?? null,
          payerUserId: hold.actorUserId ?? ingredient?.userId ?? null,
          billingAccountId: hold.billingAccountId,
          amount: hold.amount,
          beforeStatus: hold.status,
          afterStatus: after?.status,
          wallet: snapshot,
        },
      });
    });
    await this.bootstrapCache.invalidateForOrganization(input.organizationId);
    await this.activities.afterCommit(recorded.commit);
  }

  private payer(
    hold: CreditReservation,
    ingredientUserId?: string | null,
  ): string {
    const payer = hold.actorUserId ?? ingredientUserId;
    if (!payer)
      throw new BusinessLogicException(
        'Credit hold is missing its original payer',
      );
    return payer;
  }

  private async assertEligible(
    hold: CreditReservation,
    tx: PrismaTransactionClient,
  ): Promise<void> {
    const metadata = z.record(z.string(), z.unknown()).safeParse(hold.metadata);
    const crunIntent = z
      .object({ provider: z.literal('crun') })
      .safeParse(
        metadata.success ? metadata.data.submissionIntent : undefined,
      ).success;
    if (
      hold.workloadType !== MEDIA_GENERATION_WORKLOAD_TYPE ||
      !hold.workloadId ||
      !metadata.success ||
      metadata.data.assetId !== hold.workloadId ||
      crunIntent ||
      (metadata.success &&
        (metadata.data.modelQuote || metadata.data.quoteGroupReservationId))
    )
      throw new BusinessLogicException(
        'This hold requires its provider or quote-group recovery',
      );
    const task = await tx.crunGenerationTask.findFirst({
      where: {
        organizationId: hold.organizationId,
        isDeleted: false,
        OR: [{ reservationId: hold.id }, { ingredientId: hold.workloadId }],
      },
      select: { id: true },
    });
    if (task)
      throw new BusinessLogicException('Crun holds require Crun recovery');
  }
}
