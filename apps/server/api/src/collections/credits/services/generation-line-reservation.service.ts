import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { GenerationBillingRequest } from '@api/collections/credits/services/generation-billing.service';
import { ReservationEvidenceChangedException } from '@api/collections/credits/services/reservation-evidence-changed.exception';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import type {
  GenerationLineReservationIntent,
  GenerationLineReservationResult,
} from '@api/helpers/utils/credits/generation-line-reservation.schema';
import {
  generationLineReservationKey,
  initialGenerationLineMetadata,
  validateGenerationLineReservationIntent,
} from '@api/helpers/utils/credits/generation-line-reservation.util';
import { generationQuoteGroupMetadataSchema } from '@api/helpers/utils/credits/generation-quote-group.schema';
import { quoteSnapshotHash } from '@api/helpers/utils/credits/quote-snapshot.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { usesMeteredCredits } from '@genfeedai/config';
import { CreditReservationStatus } from '@genfeedai/contracts';
import { MEDIA_GENERATION_GROUP_WORKLOAD_TYPE } from '@genfeedai/contracts/constants';
import {
  type CreditReservation,
  Prisma,
  toPrismaJson,
} from '@genfeedai/prisma';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';

type LineReservationEvidence = Pick<
  CreditReservation,
  | 'id'
  | 'organizationId'
  | 'actorUserId'
  | 'workloadType'
  | 'workloadId'
  | 'idempotencyKey'
  | 'amount'
  | 'source'
  | 'description'
> & { expiresAt: Date | string; metadata: unknown };

/** Stable real-ledger admission only; owner-store attachment and submission must be composed by the caller. */
@Injectable()
export class GenerationLineReservationService {
  constructor(
    private readonly credits: CreditsUtilsService,
    private readonly prisma: PrismaService,
  ) {}

  async reserveOrRecover(
    value: GenerationLineReservationIntent,
  ): Promise<GenerationLineReservationResult> {
    const intent = validateGenerationLineReservationIntent(value);
    this.assertMetering();
    const existing = await this.find(intent);
    if (existing) return this.classify(existing, intent);
    if (new Date(intent.expiresAt) <= new Date())
      throw new BusinessLogicException('Frozen line admission expired');
    const reservation = await this.credits.reserveCredits({
      actorUserId: intent.owner.actorUserId,
      amount: intent.modelQuote.credits,
      organizationId: intent.owner.organizationId,
      description: intent.description,
      source: intent.source,
      expiresAt: new Date(intent.expiresAt),
      idempotencyKey: generationLineReservationKey(intent),
      workloadType: MEDIA_GENERATION_GROUP_WORKLOAD_TYPE,
      workloadId: intent.owner.sourceActionId,
      metadata: initialGenerationLineMetadata(intent),
    });
    const persisted = await this.find(intent);
    if (!persisted || persisted.id !== reservation.id)
      throw new BusinessLogicException(
        'Real line reservation evidence is missing',
      );
    this.validateRow(reservation, intent);
    return this.classify(persisted, intent);
  }

  async readRecovery(
    value: GenerationLineReservationIntent,
  ): Promise<GenerationLineReservationResult> {
    const intent = validateGenerationLineReservationIntent(value);
    this.assertMetering();
    const row = await this.find(intent);
    return row ? this.classify(row, intent) : { status: 'missing' };
  }

  /** Caller holds the authoritative accepted-line lock in this same serializable transaction. */
  async attachInTransaction(
    tx: Prisma.TransactionClient,
    input: {
      intent: GenerationLineReservationIntent;
      reservationId: string;
    },
  ): Promise<GenerationBillingRequest> {
    const intent = validateGenerationLineReservationIntent(input.intent);
    this.assertMetering();
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "credit_reservations" WHERE "id" = ${input.reservationId} AND "organizationId" = ${intent.owner.organizationId} AND "isDeleted" = false FOR UPDATE`,
    );
    const row = await tx.creditReservation.findFirst({
      where: {
        id: input.reservationId,
        organizationId: intent.owner.organizationId,
        isDeleted: false,
      },
    });
    if (!row)
      throw new BusinessLogicException('Line reservation is unavailable');
    const metadata = this.validateRow(row, intent);
    if (
      row.status !== CreditReservationStatus.RESERVED ||
      row.expiresAt <= new Date() ||
      metadata.dispatchClosed ||
      metadata.storyboardSubmission?.noSubmissionProof !== null ||
      metadata.storyboardSubmission?.submissionState !== 'never-started'
    )
      throw new BusinessLogicException('Line reservation cannot attach');
    if (metadata.lineFunding?.attachment === 'preparing') {
      const updated = await tx.creditReservation.updateMany({
        where: {
          id: row.id,
          organizationId: row.organizationId,
          isDeleted: false,
          status: CreditReservationStatus.RESERVED,
          metadata: { equals: toPrismaJson(row.metadata) },
        },
        data: {
          metadata: toPrismaJson({
            ...metadata,
            lineFunding: { ...metadata.lineFunding, attachment: 'attached' },
          }),
        },
      });
      if (updated.count !== 1) throw new ReservationEvidenceChangedException();
    }
    return {
      creditsConfig: {
        amount: row.amount,
        modelQuote: intent.modelQuote,
        reservationId: row.id,
        settlement: 'completion',
        deferred: false,
        isByokBypass: false,
        source: intent.source,
        description: intent.description,
      },
      user: {
        id: intent.owner.actorUserId,
        userId: intent.owner.actorUserId,
        organizationId: intent.owner.organizationId,
        brandId: intent.owner.brandId,
      },
    };
  }

  private assertMetering(): void {
    if (!usesMeteredCredits())
      throw new BusinessLogicException(
        'Real metered line funding is unavailable',
      );
  }
  private find(
    intent: GenerationLineReservationIntent,
  ): Promise<CreditReservation | null> {
    return this.prisma.creditReservation.findFirst({
      where: {
        organizationId: intent.owner.organizationId,
        isDeleted: false,
        idempotencyKey: generationLineReservationKey(intent),
      },
    });
  }
  private validateRow(
    row: LineReservationEvidence,
    intent: GenerationLineReservationIntent,
  ) {
    const raw = z.record(z.string(), z.unknown()).parse(row.metadata);
    for (const key of [
      'boundOutputIds',
      'failedOutputIds',
      'completedArtifacts',
    ])
      if (!Object.hasOwn(raw, key) || !Array.isArray(raw[key]))
        throw new BusinessLogicException(
          'Explicit line group evidence is missing',
        );
    if (!Object.hasOwn(raw, 'dispatchClosed'))
      throw new BusinessLogicException(
        'Explicit line closure evidence is missing',
      );
    const rawFunding = z.record(z.string(), z.unknown()).parse(raw.lineFunding);
    const metadata = generationQuoteGroupMetadataSchema.parse(raw);
    const funding = metadata.lineFunding;
    const submission = metadata.storyboardSubmission;
    if (
      row.organizationId !== intent.owner.organizationId ||
      row.actorUserId !== intent.owner.actorUserId ||
      row.workloadType !== MEDIA_GENERATION_GROUP_WORKLOAD_TYPE ||
      row.workloadId !== intent.owner.sourceActionId ||
      row.idempotencyKey !== generationLineReservationKey(intent) ||
      row.amount !== intent.modelQuote.credits ||
      (row.expiresAt instanceof Date
        ? row.expiresAt.getTime()
        : Date.parse(row.expiresAt)) !== Date.parse(intent.expiresAt) ||
      row.source !== intent.source ||
      row.description !== intent.description ||
      !funding ||
      !submission ||
      funding.intentHash !== intent.intentHash ||
      validateGenerationLineReservationIntent(rawFunding.intent).intentHash !==
        intent.intentHash ||
      quoteSnapshotHash(raw.modelQuote) !==
        quoteSnapshotHash(intent.modelQuote) ||
      submission.ownerHash !== quoteSnapshotHash(intent.owner) ||
      submission.fundingIntentHash !== intent.intentHash
    )
      throw new BusinessLogicException(
        'Line reservation differs from frozen intent',
      );
    return metadata;
  }
  private classify(
    row: CreditReservation,
    intent: GenerationLineReservationIntent,
  ): GenerationLineReservationResult {
    const metadata = this.validateRow(row, intent);
    if (
      row.status === CreditReservationStatus.RELEASED ||
      row.status === CreditReservationStatus.EXPIRED
    )
      return {
        status: 'ended',
        reservationId: row.id,
        reason:
          row.status === CreditReservationStatus.RELEASED
            ? 'released'
            : 'expired',
      };
    if (row.status === CreditReservationStatus.SETTLED) {
      if (
        row.settledAmount === null ||
        !Number.isFinite(row.settledAmount) ||
        row.settledAmount < 0
      )
        throw new BusinessLogicException('Settled line amount is unavailable');
      return {
        status: 'settled',
        reservationId: row.id,
        actualCredits: row.settledAmount,
      };
    }
    if (
      row.status !== CreditReservationStatus.RESERVED ||
      !metadata.lineFunding
    )
      throw new BusinessLogicException(
        'Line reservation status is unsupported',
      );
    return {
      status: 'reserved',
      reservationId: row.id,
      intentHash: intent.intentHash,
      attachment: metadata.lineFunding.attachment,
      expiresAt: row.expiresAt.toISOString(),
      dispatchClosed: metadata.dispatchClosed,
    };
  }
}
