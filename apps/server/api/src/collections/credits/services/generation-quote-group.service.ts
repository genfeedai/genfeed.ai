import { isCreditTransactionConflict } from '@api/collections/credits/services/credit-transaction-conflict';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { ReservationEvidenceChangedException } from '@api/collections/credits/services/reservation-evidence-changed.exception';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import type { GenerationCreditReservationRequest } from '@api/helpers/utils/credits/generation-credit-reservation.util';
import { hasGenerationLineProtocol } from '@api/helpers/utils/credits/generation-line-reservation.util';
import {
  crunGroupManifestMatches,
  crunReceiptAllowsDisposition,
  generationNativeCompletionSchema,
  generationQuoteGroupMetadataSchema as metadataSchema,
  generationQuoteGroupReceiptSchema as receiptSchema,
} from '@api/helpers/utils/credits/generation-quote-group.schema';
import { persistQuoteGroupFailure } from '@api/helpers/utils/credits/persist-quote-group-failure.util';
import {
  abortUnsubmittedCrunOutput,
  sweepAbortedCrunDispatches,
} from '@api/helpers/utils/credits/persist-unsubmitted-crun-abort.util';
import { quoteSnapshotHash } from '@api/helpers/utils/credits/quote-snapshot.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ActivitySource,
  CreditReservationStatus,
  IngredientCategory,
} from '@genfeedai/contracts';
import { MEDIA_GENERATION_GROUP_WORKLOAD_TYPE } from '@genfeedai/contracts/constants';
import type { ModelBillableCompletionInput } from '@genfeedai/contracts/interfaces';
import { quoteModelBillableCompletion } from '@genfeedai/pricing';
import { Prisma, toPrismaJson } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';

export interface FalGenerationCompletionInput {
  ingredientId: string;
  organizationId: string;
  externalId: string;
  provider: 'fal';
  modelKey: string;
  quantities: { width?: number; height?: number; duration?: number };
}

/** One frozen quote/hold for a generation group. Output positions never determine charges. */
@Injectable()
export class GenerationQuoteGroupService {
  constructor(
    private readonly credits: CreditsUtilsService,
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  /** Internal adapter receipt only; caller/UI dimensions never enter this ledger. */
  async recordProviderCompletion(
    input: FalGenerationCompletionInput,
  ): Promise<void> {
    await this.serializable(async (tx) => {
      const output = await tx.ingredient.findFirst({
        where: {
          id: input.ingredientId,
          organizationId: input.organizationId,
          isDeleted: false,
          category: IngredientCategory.VIDEO,
        },
        select: {
          generationBilling: true,
          metadata: { select: { externalId: true, externalProvider: true } },
        },
      });
      const receipt = receiptSchema.safeParse(output?.generationBilling);
      if (!receipt.success) return; // Legacy and BYOK retain their existing owner.
      const hold = await tx.creditReservation.findFirst({
        where: {
          id: receipt.data.reservationId,
          organizationId: input.organizationId,
          isDeleted: false,
          workloadType: MEDIA_GENERATION_GROUP_WORKLOAD_TYPE,
        },
      });
      if (!hold || hold.status !== CreditReservationStatus.RESERVED) return;
      const expectedMetadata = z
        .record(z.string(), z.unknown())
        .parse(hold.metadata);
      const metadata = metadataSchema.parse(expectedMetadata);
      const quote = metadata.modelQuote;
      if (
        !quote.pricingProfile.reviewedPricing?.rates.some(
          (rate) =>
            rate.unit === 'video-token' || rate.unit === 'input-video-token',
        )
      )
        return;
      if (
        quote.provider !== 'fal' ||
        quote.providerQuote ||
        input.modelKey !== quote.modelKey ||
        input.provider !== 'fal' ||
        !input.externalId ||
        output?.metadata?.externalProvider !== 'fal' ||
        output.metadata.externalId !== input.externalId ||
        metadata.boundOutputIds[receipt.data.outputIndex] !== input.ingredientId
      )
        throw new BusinessLogicException(
          'Native completion differs from its bound provider output',
        );
      const proof = generationNativeCompletionSchema.parse({
        ingredientId: input.ingredientId,
        outputIndex: receipt.data.outputIndex,
        provider: input.provider,
        externalIdHash: quoteSnapshotHash(input.externalId),
        modelKey: quote.modelKey,
        quoteHash: quoteSnapshotHash(quote),
        width: input.quantities.width,
        height: input.quantities.height,
        duration: input.quantities.duration,
      });
      const previous = metadata.providerCompletions.filter(
        (entry) => entry.ingredientId === input.ingredientId,
      );
      const conflict =
        previous.length > 1 ||
        (previous.length === 1 &&
          quoteSnapshotHash(previous[0]) !== quoteSnapshotHash(proof));
      if (previous.length === 1 && !conflict) return;
      const updated = await tx.creditReservation.updateMany({
        where: {
          id: hold.id,
          organizationId: input.organizationId,
          isDeleted: false,
          status: CreditReservationStatus.RESERVED,
          metadata: { equals: toPrismaJson(expectedMetadata) },
        },
        data: {
          metadata: toPrismaJson({
            ...metadata,
            providerCompletions: previous.length
              ? metadata.providerCompletions
              : [...metadata.providerCompletions, proof],
            providerCompletionConflicts: conflict
              ? [
                  ...new Set([
                    ...metadata.providerCompletionConflicts,
                    input.ingredientId,
                  ]),
                ]
              : metadata.providerCompletionConflicts,
          }),
        },
      });
      if (updated.count !== 1) throw new ReservationEvidenceChangedException();
    });
  }

  async bindOutput(
    request: GenerationCreditReservationRequest,
    ingredientId: string,
  ): Promise<void> {
    await this.serializable((tx) =>
      this.bindOutputInTransaction(tx, request, ingredientId),
    );
  }

  /** Caller must hold its operation admission fence in this same serializable transaction. */
  async bindOutputInTransaction(
    tx: Prisma.TransactionClient,
    request: GenerationCreditReservationRequest,
    ingredientId: string,
  ): Promise<void> {
    const reservationId = request.creditsConfig?.reservationId;
    const organizationId = request.user?.organizationId;
    if (!reservationId || !organizationId)
      throw new BusinessLogicException(
        'Generation quote group identity is missing',
      );
    const hold = await tx.creditReservation.findFirst({
      where: {
        id: reservationId,
        organizationId,
        isDeleted: false,
        workloadType: MEDIA_GENERATION_GROUP_WORKLOAD_TYPE,
      },
    });
    if (!hold || hold.status !== CreditReservationStatus.RESERVED)
      throw new BusinessLogicException('Generation quote hold has ended');
    if (hasGenerationLineProtocol(hold.metadata))
      throw new BusinessLogicException(
        'Fenced Storyboard submission is unavailable',
      );
    const metadata = metadataSchema.parse(hold.metadata);
    if (hold.expiresAt <= new Date())
      throw new BusinessLogicException(
        'Generation quote admission has expired',
      );
    if (metadata.dispatchClosed)
      throw new BusinessLogicException('Generation dispatch is closed');
    if (metadata.boundOutputIds.includes(ingredientId)) return;
    if (
      metadata.boundOutputIds.length >=
      (metadata.modelQuote.quantities.outputs ?? 1)
    )
      throw new BusinessLogicException(
        'Generation output exceeds its frozen authorization',
      );
    const receipt = {
      kind: 'quote-group' as const,
      reservationId,
      outputIndex: metadata.boundOutputIds.length,
    };
    const bound = await tx.ingredient.updateMany({
      data: { generationBilling: toPrismaJson(receipt) },
      where: {
        id: ingredientId,
        organizationId,
        isDeleted: false,
        generationBilling: { equals: Prisma.DbNull },
      },
    });
    if (bound.count !== 1)
      throw new BusinessLogicException(
        'Generation output already has another billing owner',
      );
    await tx.creditReservation.updateMany({
      where: {
        id: reservationId,
        organizationId,
        isDeleted: false,
        status: CreditReservationStatus.RESERVED,
      },
      data: {
        metadata: toPrismaJson({
          ...metadata,
          boundOutputIds: [...metadata.boundOutputIds, ingredientId],
        }),
      },
    });
  }

  /** Pre-submission abort of a taskless Crun output: hold evidence, release, failure. */
  abortUnsubmittedOutput(
    ingredientId: string,
    organizationId: string,
  ): Promise<void> {
    return abortUnsubmittedCrunOutput(
      this.prisma,
      ingredientId,
      organizationId,
      this.credits,
    );
  }

  /** Retry aborts whose cleanup failed; returns how many it completed. */
  reconcileAbortedCrunDispatches(now = new Date()): Promise<number> {
    return sweepAbortedCrunDispatches(
      this.prisma,
      this.logger,
      this.credits,
      now,
    );
  }

  async closeDispatch(
    reservationId: string,
    organizationId: string,
  ): Promise<void> {
    await this.serializable(async (tx) => {
      const hold = await tx.creditReservation.findFirst({
        where: {
          id: reservationId,
          organizationId,
          isDeleted: false,
          workloadType: MEDIA_GENERATION_GROUP_WORKLOAD_TYPE,
        },
      });
      if (!hold || hold.status !== CreditReservationStatus.RESERVED) return;
      const tasks = await tx.crunGenerationTask.findMany({
        where: { reservationId, organizationId, isDeleted: false },
      });
      const metadata = metadataSchema.parse(hold.metadata);
      if (
        metadata.modelQuote.providerQuote &&
        (tasks.length > 0 || metadata.boundOutputIds.length > 0) &&
        !crunGroupManifestMatches(hold, tasks)
      )
        return;
      await tx.creditReservation.updateMany({
        where: {
          id: reservationId,
          organizationId,
          isDeleted: false,
          status: CreditReservationStatus.RESERVED,
        },
        data: { metadata: toPrismaJson({ ...metadata, dispatchClosed: true }) },
      });
    });
    await this.settleGroup(reservationId, organizationId);
  }

  async reconcileOutput(
    ingredientId: string,
    organizationId: string,
    confirmedFailure = false,
  ): Promise<boolean> {
    const task = await this.prisma.crunGenerationTask.findFirst({
      where: { ingredientId, organizationId, isDeleted: false },
    });
    if (
      !crunReceiptAllowsDisposition(
        task,
        confirmedFailure ? 'release' : 'settle',
      )
    )
      return true;
    const ingredient = await this.prisma.ingredient.findFirst({
      where: { id: ingredientId, organizationId, isDeleted: false },
      select: { generationBilling: true },
    });
    const receipt = receiptSchema.safeParse(ingredient?.generationBilling);
    if (!receipt.success) return false;
    if (confirmedFailure)
      await persistQuoteGroupFailure(this.prisma, ingredientId, organizationId);
    await this.settleGroup(receipt.data.reservationId, organizationId);
    return true;
  }

  async settleGroup(
    reservationId: string,
    organizationId: string,
  ): Promise<void> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        await this.settleGroupSnapshot(reservationId, organizationId);
        return;
      } catch (error: unknown) {
        if (
          attempt >= 2 ||
          !(error instanceof ReservationEvidenceChangedException)
        )
          throw error;
      }
    }
  }

  private async settleGroupSnapshot(
    reservationId: string,
    organizationId: string,
  ): Promise<void> {
    const hold = await this.prisma.creditReservation.findFirst({
      where: {
        id: reservationId,
        organizationId,
        isDeleted: false,
        workloadType: MEDIA_GENERATION_GROUP_WORKLOAD_TYPE,
      },
    });
    if (!hold || hold.status !== CreditReservationStatus.RESERVED) return;
    const expectedMetadata = z
      .record(z.string(), z.unknown())
      .parse(hold.metadata);
    const metadata = metadataSchema.parse(expectedMetadata);
    if (!metadata.dispatchClosed) return;
    // This checkpoint cannot prove a Storyboard line was never submitted.
    // Retain every empty protocol group until the owner-fenced proof/release API exists.
    if (
      hasGenerationLineProtocol(expectedMetadata) &&
      metadata.boundOutputIds.length === 0
    )
      return;
    const completedIds = new Set(
      metadata.completedArtifacts.map((artifact) => artifact.ingredientId),
    );
    const terminalIds = new Set([...completedIds, ...metadata.failedOutputIds]);
    if ([...terminalIds].some((id) => !metadata.boundOutputIds.includes(id)))
      throw new BusinessLogicException(
        'Terminal evidence exceeds its funded manifest',
      );
    // Library status, rejection, deletion and transport errors are not financial
    // disposition. Only durable completion or confirmed provider-negative evidence
    // can close admitted work; unresolved submissions retain their funding.
    if (metadata.boundOutputIds.some((id) => !terminalIds.has(id))) return;
    const completedCount = completedIds.size;
    const reservedRequests = metadata.modelQuote.quantities.requests ?? 1;
    const reservedOutputs = metadata.modelQuote.quantities.outputs ?? 1;
    if (reservedRequests !== 1 && reservedRequests !== reservedOutputs)
      throw new BusinessLogicException(
        'Generation request grouping is unsupported',
      );
    const hasRequestFee =
      metadata.modelQuote.pricingProfile.pricingType === 'per-request' ||
      metadata.modelQuote.pricingProfile.reviewedPricing?.rates.some(
        (rate) => rate.unit === 'request',
      );
    if (
      hasRequestFee &&
      completedCount !== reservedOutputs &&
      metadata.modelQuote.pricingProfile.requestCompletionPolicy !==
        'successful-request'
    ) {
      this.logger.warn(
        'Generation request fee disposition is unresolved; retain funding',
        { reservationId, organizationId },
      );
      return;
    }
    const completionInput: ModelBillableCompletionInput = {
      completedOutputs: completedCount,
      successfulRequests:
        reservedRequests === 1 ? Number(completedCount > 0) : completedCount,
    };
    const native =
      metadata.modelQuote.pricingProfile.reviewedPricing?.rates.some(
        (rate) =>
          rate.unit === 'video-token' || rate.unit === 'input-video-token',
      );
    if (native && completedCount > 0) {
      const proofs = [...completedIds].map((id) =>
        metadata.providerCompletions.filter(
          (proof) => proof.ingredientId === id,
        ),
      );
      if (
        metadata.modelQuote.provider !== 'fal' ||
        metadata.modelQuote.providerQuote ||
        metadata.providerCompletionConflicts.length ||
        proofs.some((entries) => entries.length !== 1)
      ) {
        this.logger.warn(
          'Native completion proof is unresolved; retain funding',
          { reservationId, organizationId },
        );
        return;
      }
      const values = proofs.map(([proof]) => proof);
      const first = values[0];
      if (
        new Set(values.map((proof) => proof.externalIdHash)).size !==
          values.length ||
        values.some(
          (proof) =>
            metadata.boundOutputIds[proof.outputIndex] !== proof.ingredientId ||
            proof.modelKey !== metadata.modelQuote.modelKey ||
            proof.quoteHash !== quoteSnapshotHash(metadata.modelQuote) ||
            proof.width !== first.width ||
            proof.height !== first.height ||
            proof.duration !== first.duration,
        )
      ) {
        // The existing aggregate calculator requires homogeneous output quantities.
        // A heterogeneous aggregate needs an approved contract, never per-slot rounding.
        this.logger.warn(
          'Native aggregate completion differs from its frozen contract; retain funding',
          { reservationId, organizationId },
        );
        return;
      }
      Object.assign(completionInput, {
        width: first.width,
        height: first.height,
        duration: first.duration,
        inputDuration: metadata.modelQuote.quantities.inputDuration,
        referenceEvidenceHash:
          metadata.modelQuote.quantities.referenceEvidenceHash,
      });
    }
    const completion = quoteModelBillableCompletion(
      metadata.modelQuote,
      completionInput,
    );
    if (completion.status === 'unresolved') {
      this.logger.warn(
        'Generation completion quantity is unresolved; retain funding',
        { reservationId, organizationId, reason: completion.reason },
      );
      return;
    }
    if (completion.credits === 0)
      await this.credits.releaseReservation({
        organizationId,
        reservationId,
        expectedReservationMetadata: expectedMetadata,
      });
    else {
      if (!hold.actorUserId)
        throw new BusinessLogicException(
          'Generation quote settlement actor is missing',
        );
      await this.credits.settleReservation({
        actualAmount: completion.credits,
        expectedReservationMetadata: expectedMetadata,
        actorUserId: hold.actorUserId,
        organizationId,
        reservationId,
        description: hold.description ?? 'Media generation',
        source: z
          .enum(ActivitySource)
          .parse(hold.source ?? ActivitySource.SCRIPT),
        metadata: {
          ...metadata,
          completedOutputs: completedCount,
          billableProviderCostUsd: completion.billableProviderCostUsd,
        },
      });
    }
  }

  async reconcile(now = new Date()): Promise<number> {
    let cursor: string | undefined;
    let count = 0;
    for (;;) {
      // tenant-scope-ignore: platform sweep; all output/wallet operations are scoped by each hold's tenant below
      const holds = await this.prisma.creditReservation.findMany({
        where: {
          ...(cursor ? { id: { gt: cursor } } : {}),
          isDeleted: false,
          status: CreditReservationStatus.RESERVED,
          workloadType: MEDIA_GENERATION_GROUP_WORKLOAD_TYPE,
        },
        orderBy: { id: 'asc' },
        take: 200,
      });
      for (const hold of holds) {
        try {
          if (hold.expiresAt <= now)
            await this.expireDispatch(hold.id, hold.organizationId);
          else await this.settleGroup(hold.id, hold.organizationId);
          count += 1;
        } catch (error: unknown) {
          this.logger.error(
            'Generation quote group reconciliation failed',
            error,
            { reservationId: hold.id, organizationId: hold.organizationId },
          );
        }
      }
      if (holds.length < 200) break;
      cursor = holds[holds.length - 1].id;
    }
    return count;
  }

  private async expireDispatch(
    reservationId: string,
    organizationId: string,
  ): Promise<void> {
    await this.closeDispatch(reservationId, organizationId);
    // Binding records durable submission intent before the remote call. An expired
    // lease cannot prove that the provider did not accept it. Keep unresolved
    // outputs funded; callbacks/reconciliation establish their actual disposition.
  }

  private async serializable<T>(
    run: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.prisma.$transaction(run, {
          isolationLevel: 'Serializable',
        });
      } catch (error: unknown) {
        if (attempt >= 2 || !isCreditTransactionConflict(error)) throw error;
      }
    }
  }
}
