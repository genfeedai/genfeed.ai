import { GenerationBillingService } from '@api/collections/credits/services/generation-billing.service';
import { WebhooksService } from '@api/endpoints/webhooks/webhooks.service';
import { generationUsageReceiptSchema } from '@api/helpers/utils/credits/generation-submission-evidence.schema';
import { modelBillableQuoteSnapshotSchema } from '@api/helpers/utils/credits/model-billable-quote.schema';
import type { CrunTaskStatusResponse } from '@api/services/integrations/crun/crun-response.schema';
import { crunFundingBindingSchema } from '@api/services/integrations/crun/crun-task.schema';
import { MediaVendorCostLedgerService } from '@api/services/media-vendor-cost/media-vendor-cost-ledger.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  CreditTransactionCategory,
  IngredientStatus,
} from '@genfeedai/contracts';
import {
  crunCreditsEqual,
  crunCreditsToMicros,
  normalizeCrunCredits,
} from '@genfeedai/pricing';
import type { CrunGenerationTask, Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';

const receiptSchema = z.object({
  status: z.enum(['success', 'failed']).optional(),
  credits: z.string().nullable().optional(),
  isAccepted: z.literal(false).optional(),
});

@Injectable()
export class CrunTaskFinalizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: WebhooksService,
    private readonly billing: GenerationBillingService,
    private readonly ledger: MediaVendorCostLedgerService,
    private readonly logger: LoggerService,
  ) {}

  async finalize(
    organizationId: string,
    taskId: string,
    info?: CrunTaskStatusResponse,
  ): Promise<void> {
    let task = await this.prisma.crunGenerationTask.findFirst({
      where: { id: taskId, organizationId, isDeleted: false },
    });
    if (
      !task ||
      task.state === 'finalized' ||
      !['provider-success', 'provider-failed'].includes(task.state)
    )
      return;
    const quote = modelBillableQuoteSnapshotSchema.safeParse(
      task.quoteSnapshot,
    );
    const binding = crunFundingBindingSchema.safeParse(task.fundingBinding);
    const receipt = receiptSchema.safeParse(task.terminalReceipt);
    if (
      !quote.success ||
      !binding.success ||
      !receipt.success ||
      !quote.data.providerQuote
    )
      return this.recover(task, 'CRUN_RECEIPT_INVALID');
    if (
      binding.data.kind === 'free' &&
      (task.credentialSource !== 'hosted' ||
        task.reservationId !== null ||
        quote.data.credits !== 0 ||
        !quote.data.pricingProfile.isFree)
    )
      return this.recover(task, 'CRUN_FUNDING_INVALID');
    if (
      binding.data.kind === 'reservation' &&
      (!task.reservationId ||
        task.credentialSource !== 'hosted' ||
        quote.data.credits <= 0)
    )
      return this.recover(task, 'CRUN_FUNDING_INVALID');
    if (
      binding.data.kind === 'byok' &&
      (task.reservationId !== null ||
        task.credentialSource !== 'byok' ||
        binding.data.receipt.userId !== task.userId ||
        binding.data.receipt.amount !==
          quote.data.credits /
            (quote.data.quantities.outputs ??
              quote.data.quantities.requests ??
              1))
    )
      return this.recover(task, 'CRUN_FUNDING_INVALID');
    const ingredient = await this.prisma.ingredient.findFirst({
      where: {
        id: task.ingredientId,
        organizationId,
        userId: task.userId,
        isDeleted: false,
      },
      select: { id: true, s3Key: true, status: true, generationBilling: true },
    });
    if (!ingredient)
      return this.recover(task, 'CRUN_OWNED_INGREDIENT_UNAVAILABLE');
    const refused =
      receipt.data.isAccepted === false && task.state === 'provider-failed';
    const succeeded =
      receipt.data.status === 'success' && task.state === 'provider-success';
    if (!refused && receipt.data.status !== (succeeded ? 'success' : 'failed'))
      return this.recover(task, 'CRUN_RECEIPT_INVALID');
    // Owned storage is independent of billing proof: preserve a completed output even if credits are missing/mismatched.
    if (succeeded && !task.mediaPersistedAt) {
      if (!ingredient.s3Key) {
        if (
          !info ||
          info.taskId !== task.providerTaskId ||
          info.status !== 'success' ||
          info.mediaCount !== 1 ||
          info.mediaUrls.length !== 1
        )
          return this.recover(task, 'CRUN_MEDIA_INVALID');
        try {
          await this.media.processMediaForIngredient(
            task.ingredientId,
            'image',
            info.mediaUrls[0],
            task.providerTaskId ?? undefined,
          );
        } catch {
          const delays = [60000, 300000, 900000];
          if (task.copyAttemptCount >= delays.length)
            return this.recover(task, 'CRUN_MEDIA_COPY_EXHAUSTED');
          await this.update(task, {
            copyAttemptCount: { increment: 1 },
            nextPollAt: new Date(Date.now() + delays[task.copyAttemptCount]),
            leaseUntil: null,
          });
          return;
        }
      }
      const owned = await this.prisma.ingredient.findFirst({
        where: {
          id: task.ingredientId,
          organizationId,
          isDeleted: false,
          s3Key: { not: null },
          status: {
            in: [IngredientStatus.GENERATED, IngredientStatus.VALIDATED],
          },
        },
        select: { s3Key: true },
      });
      if (!owned?.s3Key)
        return this.recover(task, 'CRUN_OWNED_MEDIA_UNAVAILABLE');
      task = await this.update(task, { mediaPersistedAt: new Date() });
    }
    const credits = receipt.data.credits;
    if (!refused && (!credits || normalizeCrunCredits(credits) === null))
      return this.recover(task, 'CRUN_FINAL_CREDITS_UNAVAILABLE');
    const provider = quote.data.providerQuote;
    if (!provider) return this.recover(task, 'CRUN_RECEIPT_INVALID');
    if (!task.vendorCostRecordedAt) {
      if (!refused) {
        const micros =
          task.credentialSource === 'byok'
            ? 0
            : crunCreditsToMicros(credits ?? '', provider.creditsPerUsd ?? '');
        if (micros === null) return this.recover(task, 'CRUN_RATE_INVALID');
        await this.ledger.record({
          organizationId,
          ingredientId: task.ingredientId,
          brandId: task.brandId,
          category: 'image',
          model: task.modelKey,
          provider: 'crun',
          isByok: task.credentialSource === 'byok',
          pricingType: 'per-request',
          units: 1,
          vendorCostMicros: micros,
          costEvidence: task.credentialSource === 'byok' ? 'byok' : 'observed',
          pricingSnapshot: {
            providerCredits: credits ?? '',
            creditsPerUsd: provider.creditsPerUsd,
            acquisitionRateVersion: provider.acquisitionRateVersion,
            credentialSource: provider.credentialSource,
            credentialId: provider.credentialId,
            credentialFingerprint: provider.credentialFingerprint,
            contractVersion: provider.contractVersion,
            quoteHash: provider.quoteHash,
          },
        });
      }
      task = await this.update(task, { vendorCostRecordedAt: new Date() });
    }
    if (
      succeeded &&
      !crunCreditsEqual(credits ?? '', provider.providerCreditsPerTask)
    ) {
      await this.prisma.model.updateMany({
        where: {
          key: task.modelKey,
          isDeleted: false,
          OR: [{ organizationId: null }, { organizationId }],
        },
        data: { isActive: false },
      });
      this.logger.warn('Crun final credit discrepancy requires review', {
        organizationId,
        taskId,
        modelKey: task.modelKey,
        contractVersion: task.contractVersion,
      });
      return this.recover(task, 'CRUN_FINAL_CREDITS_MISMATCH');
    }
    if (
      !succeeded &&
      !refused &&
      Number(credits) > Number(provider.providerCreditsPerTask)
    )
      this.logger.warn('Crun failed task expense exceeds frozen quote', {
        organizationId,
        taskId,
        modelKey: task.modelKey,
        contractVersion: provider.contractVersion,
      });
    if (!task.billingRecordedAt) {
      if (!succeeded) {
        await this.prisma.ingredient.updateMany({
          where: {
            id: task.ingredientId,
            organizationId,
            isDeleted: false,
            status: {
              notIn: [IngredientStatus.GENERATED, IngredientStatus.VALIDATED],
            },
          },
          data: { status: IngredientStatus.FAILED },
        });
        await this.billing.recordProviderFailure(
          task.ingredientId,
          organizationId,
        );
        await this.billing.releaseOutput(task.ingredientId, organizationId);
      } else if (binding.data.kind !== 'free')
        await this.billing.settleOutput(task.ingredientId, organizationId);
      let confirmed = binding.data.kind === 'free';
      if (binding.data.kind === 'reservation') {
        const hold = await this.prisma.creditReservation.findFirst({
          where: {
            id: task.reservationId ?? '',
            organizationId,
            isDeleted: false,
          },
          select: { status: true },
        });
        confirmed = hold?.status === (succeeded ? 'SETTLED' : 'RELEASED');
      } else if (binding.data.kind === 'byok') {
        const current = await this.prisma.ingredient.findFirst({
          where: { id: task.ingredientId, organizationId, isDeleted: false },
          select: { generationBilling: true },
        });
        const usage = generationUsageReceiptSchema.safeParse(
          current?.generationBilling,
        );
        if (succeeded) {
          const frozen = binding.data.receipt;
          const transaction = await this.prisma.creditTransaction.findFirst({
            where: {
              organizationId,
              isDeleted: false,
              idempotencyKey: `byok:${organizationId}:media-generation-usage:${task.ingredientId}`,
              category: CreditTransactionCategory.BYOK_USAGE,
              actorUserId: frozen.userId,
              amount: frozen.amount,
              source: frozen.source,
              metadata: { path: ['assetId'], equals: task.ingredientId },
            },
            select: { id: true },
          });
          confirmed = Boolean(
            transaction && usage.success && usage.data.state === 'recorded',
          );
        } else confirmed = usage.success && usage.data.state === 'failed';
      }
      if (!confirmed) {
        await this.update(task, {
          nextPollAt: new Date(Date.now() + 30000),
          leaseUntil: null,
        });
        return;
      }
      task = await this.update(task, { billingRecordedAt: new Date() });
    }
    await this.update(task, {
      state: 'finalized',
      nextPollAt: null,
      leaseUntil: null,
      recoveryCode: null,
    });
  }

  private async update(
    task: CrunGenerationTask,
    data: Prisma.CrunGenerationTaskUpdateManyMutationInput,
  ): Promise<CrunGenerationTask> {
    await this.prisma.crunGenerationTask.updateMany({
      where: {
        id: task.id,
        organizationId: task.organizationId,
        isDeleted: false,
      },
      data,
    });
    const current = await this.prisma.crunGenerationTask.findFirstOrThrow({
      where: {
        id: task.id,
        organizationId: task.organizationId,
        isDeleted: false,
      },
    });
    return current;
  }
  private async recover(
    task: CrunGenerationTask,
    recoveryCode: string,
  ): Promise<void> {
    await this.update(task, {
      state: 'recovery-required',
      recoveryCode,
      nextPollAt: null,
      leaseUntil: null,
    });
  }
}
