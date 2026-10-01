import { GenerationBillingService } from '@api/collections/credits/services/generation-billing.service';
import { WebhooksService } from '@api/endpoints/webhooks/webhooks.service';
import { crunReservationCompletion } from '@api/helpers/utils/credits/generation-quote-group.schema';
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
    claimed: CrunGenerationTask,
    info?: CrunTaskStatusResponse,
    signal?: AbortSignal,
  ): Promise<void> {
    let task = claimed;
    const { organizationId, id: taskId } = task;
    if (signal?.aborted || !(await this.owns(task))) return;
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
      return this.recover(task, signal, 'CRUN_RECEIPT_INVALID');
    if (
      binding.data.kind === 'free' &&
      (task.credentialSource !== 'hosted' ||
        task.reservationId !== null ||
        quote.data.credits !== 0 ||
        !quote.data.pricingProfile.isFree)
    )
      return this.recover(task, signal, 'CRUN_FUNDING_INVALID');
    if (
      binding.data.kind === 'reservation' &&
      (!task.reservationId ||
        task.credentialSource !== 'hosted' ||
        quote.data.credits <= 0)
    )
      return this.recover(task, signal, 'CRUN_FUNDING_INVALID');
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
      return this.recover(task, signal, 'CRUN_FUNDING_INVALID');
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
      return this.recover(task, signal, 'CRUN_OWNED_INGREDIENT_UNAVAILABLE');
    const refused =
      receipt.data.isAccepted === false && task.state === 'provider-failed';
    const succeeded =
      receipt.data.status === 'success' && task.state === 'provider-success';
    if (!refused && receipt.data.status !== (succeeded ? 'success' : 'failed'))
      return this.recover(task, signal, 'CRUN_RECEIPT_INVALID');
    const credits = receipt.data.credits;
    const missingCredits =
      !refused && (credits == null || normalizeCrunCredits(credits) === null);
    const now = new Date();
    const accountingDue =
      task.nextAccountingAttemptAt !== null &&
      task.nextAccountingAttemptAt <= now;
    const mediaDue =
      task.nextMediaAttemptAt !== null && task.nextMediaAttemptAt <= now;
    let ledgerFailed = false;
    const mismatch =
      succeeded &&
      !missingCredits &&
      !crunCreditsEqual(
        credits ?? '',
        quote.data.providerQuote.providerCreditsPerTask,
      );
    const exceeded =
      !succeeded &&
      !refused &&
      !missingCredits &&
      Number(credits) > Number(quote.data.providerQuote.providerCreditsPerTask);
    if (
      missingCredits ||
      mismatch ||
      exceeded ||
      task.recoveryCode === 'CRUN_TERMINAL_RECEIPT_CONFLICT'
    )
      await this.disableAndAlert(
        task,
        signal,
        missingCredits
          ? 'CRUN_FINAL_CREDITS_UNAVAILABLE'
          : mismatch
            ? 'CRUN_FINAL_CREDITS_MISMATCH'
            : exceeded
              ? 'CRUN_FAILED_CREDITS_EXCEED_QUOTE'
              : 'CRUN_TERMINAL_RECEIPT_CONFLICT',
      );
    const provider = quote.data.providerQuote;
    if (!provider) return this.recover(task, signal, 'CRUN_RECEIPT_INVALID');
    if (accountingDue && !task.vendorCostRecordedAt && !missingCredits) {
      try {
        if (!refused) {
          const micros =
            task.credentialSource === 'byok'
              ? 0
              : crunCreditsToMicros(
                  credits ?? '',
                  provider.creditsPerUsd ?? '',
                );
          if (micros === null)
            return this.recover(task, signal, 'CRUN_RATE_INVALID');
          await this.assertOwned(task, signal);
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
            costEvidence:
              task.credentialSource === 'byok' ? 'byok' : 'observed',
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
        await this.assertOwned(task, signal);
        task = await this.update(task, signal, {
          vendorCostRecordedAt: new Date(),
        });
      } catch {
        await this.assertOwned(task, signal);
        ledgerFailed = true;
        task = await this.update(task, signal, {
          nextAccountingAttemptAt: new Date(Date.now() + 30000),
        });
      }
    }
    if (
      task.recoveryCode === 'CRUN_TERMINAL_RECEIPT_CONFLICT' ||
      (task.recoveryCode === 'CRUN_ORIGINAL_CREDENTIAL_UNAVAILABLE' &&
        !task.mediaPersistedAt &&
        !ingredient.s3Key)
    )
      return this.recover(task, signal, task.recoveryCode);
    // Owned storage is independent of billing proof: preserve a completed output even if credits are missing/mismatched.
    if (mediaDue && succeeded && !task.mediaPersistedAt) {
      if (!ingredient.s3Key) {
        if (
          !info ||
          info.taskId !== task.providerTaskId ||
          info.status !== 'success' ||
          info.mediaCount !== 1 ||
          info.mediaUrls.length !== 1
        ) {
          if (info) return this.recover(task, signal, 'CRUN_MEDIA_INVALID');
          task = await this.update(task, signal, {
            nextMediaAttemptAt: new Date(Date.now() + 30000),
          });
          return this.finishPhases(task, signal);
        }
        try {
          await this.assertOwned(task, signal);
          await this.media.processMediaForIngredient(
            task.ingredientId,
            'image',
            info.mediaUrls[0],
            task.providerTaskId ?? undefined,
          );
          await this.assertOwned(task, signal);
        } catch {
          await this.assertOwned(task, signal);
          const delays = [60000, 300000, 900000];
          if (task.copyAttemptCount >= delays.length)
            return this.recover(task, signal, 'CRUN_MEDIA_COPY_EXHAUSTED');
          task = await this.update(task, signal, {
            copyAttemptCount: { increment: 1 },
            nextMediaAttemptAt: new Date(
              Date.now() + delays[task.copyAttemptCount],
            ),
          });
          return this.finishPhases(task, signal);
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
        return this.recover(task, signal, 'CRUN_OWNED_MEDIA_UNAVAILABLE');
      task = await this.update(task, signal, {
        mediaPersistedAt: new Date(),
        nextMediaAttemptAt: null,
        nextAccountingAttemptAt: ledgerFailed
          ? task.nextAccountingAttemptAt
          : new Date(),
      });
    }
    if (
      missingCredits ||
      task.recoveryCode === 'CRUN_TERMINAL_RECEIPT_CONFLICT'
    ) {
      await this.disableAndAlert(
        task,
        signal,
        missingCredits
          ? 'CRUN_FINAL_CREDITS_UNAVAILABLE'
          : 'CRUN_TERMINAL_RECEIPT_CONFLICT',
      );
      return this.recover(
        task,
        signal,
        missingCredits
          ? 'CRUN_FINAL_CREDITS_UNAVAILABLE'
          : 'CRUN_TERMINAL_RECEIPT_CONFLICT',
      );
    }
    if (ledgerFailed) return this.finishPhases(task, signal);

    if (
      succeeded &&
      !crunCreditsEqual(credits ?? '', provider.providerCreditsPerTask)
    ) {
      await this.assertOwned(task, signal);
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
      return this.recover(task, signal, 'CRUN_FINAL_CREDITS_MISMATCH');
    }
    if (
      !succeeded &&
      !refused &&
      Number(credits) > Number(provider.providerCreditsPerTask)
    ) {
      await this.disableAndAlert(
        task,
        signal,
        'CRUN_FAILED_CREDITS_EXCEED_QUOTE',
      );
      this.logger.warn('Crun failed task expense exceeds frozen quote', {
        organizationId,
        taskId,
        modelKey: task.modelKey,
        contractVersion: provider.contractVersion,
      });
    }
    if (succeeded && !task.mediaPersistedAt) {
      task = await this.update(task, signal, { nextAccountingAttemptAt: null });
      return this.finishPhases(task, signal);
    }
    if (!accountingDue && !mediaDue) return this.finishPhases(task, signal);
    try {
      if (!task.billingRecordedAt) {
        await this.assertOwned(task, signal);
        if (!succeeded) {
          await this.billing.recordProviderFailure(
            task.ingredientId,
            organizationId,
          );
          await this.assertOwned(task, signal);
          await this.billing.releaseOutput(task.ingredientId, organizationId);
        } else if (binding.data.kind !== 'free')
          await this.billing.settleOutput(task.ingredientId, organizationId);
        await this.assertOwned(task, signal);
        let confirmed = binding.data.kind === 'free';
        if (binding.data.kind === 'reservation') {
          const hold = await this.prisma.creditReservation.findFirst({
            where: {
              id: task.reservationId ?? '',
              organizationId,
              isDeleted: false,
            },
          });
          if (hold) {
            const members = await this.prisma.crunGenerationTask.findMany({
              where: {
                reservationId: hold.id,
                organizationId,
                isDeleted: false,
              },
            });
            const owned = await this.prisma.ingredient.findMany({
              where: {
                id: { in: members.map((member) => member.ingredientId) },
                organizationId,
                isDeleted: false,
              },
              select: { id: true, s3Key: true },
            });
            const amount = crunReservationCompletion(hold, members, owned);
            confirmed =
              amount !== null &&
              amount !== undefined &&
              (amount > 0
                ? hold.status === 'SETTLED' && hold.settledAmount === amount
                : hold.status === 'RELEASED');
          }
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
          task = await this.update(task, signal, {
            nextAccountingAttemptAt: new Date(Date.now() + 30000),
          });
          return this.finishPhases(task, signal);
        }
        task = await this.update(task, signal, {
          billingRecordedAt: new Date(),
          nextAccountingAttemptAt: null,
        });
      }
    } catch {
      await this.assertOwned(task, signal);
      task = await this.update(task, signal, {
        nextAccountingAttemptAt: new Date(Date.now() + 30000),
      });
      return this.finishPhases(task, signal);
    }
    await this.update(task, signal, {
      state: 'finalized',
      nextPollAt: null,
      nextMediaAttemptAt: null,
      nextAccountingAttemptAt: null,
      leaseUntil: null,
      recoveryCode: null,
    });
  }

  private async update(
    task: CrunGenerationTask,
    signal: AbortSignal | undefined,
    data: Prisma.CrunGenerationTaskUpdateManyMutationInput,
  ): Promise<CrunGenerationTask> {
    if (signal?.aborted) throw new Error('CRUN_LEASE_LOST');
    const result = await this.prisma.crunGenerationTask.updateMany({
      where: {
        id: task.id,
        organizationId: task.organizationId,
        isDeleted: false,
        version: task.version,
        state: task.state,
        leaseUntil: { gt: new Date() },
      },
      data: {
        ...data,
        ...(data.leaseUntil === null ? { version: { increment: 1 } } : {}),
      },
    });
    if (result.count !== 1) throw new Error('CRUN_LEASE_LOST');
    const current = await this.prisma.crunGenerationTask.findFirstOrThrow({
      where: {
        id: task.id,
        organizationId: task.organizationId,
        isDeleted: false,
        version: task.version + (data.leaseUntil === null ? 1 : 0),
        state: typeof data.state === 'string' ? data.state : task.state,
        ...(data.leaseUntil === null ? {} : { leaseUntil: { gt: new Date() } }),
      },
    });
    if (signal?.aborted) throw new Error('CRUN_LEASE_LOST');
    return current;
  }
  private async owns(task: CrunGenerationTask): Promise<boolean> {
    return Boolean(
      await this.prisma.crunGenerationTask.findFirst({
        where: {
          id: task.id,
          organizationId: task.organizationId,
          isDeleted: false,
          version: task.version,
          state: task.state,
          leaseUntil: { gt: new Date() },
        },
        select: { id: true },
      }),
    );
  }
  private async assertOwned(
    task: CrunGenerationTask,
    signal?: AbortSignal,
  ): Promise<void> {
    if (signal?.aborted || !(await this.owns(task)) || signal?.aborted)
      throw new Error('CRUN_LEASE_LOST');
  }
  private async disableAndAlert(
    task: CrunGenerationTask,
    signal: AbortSignal | undefined,
    code: string,
  ): Promise<void> {
    await this.assertOwned(task, signal);
    await this.prisma.model.updateMany({
      where: {
        key: task.modelKey,
        isDeleted: false,
        OR: [{ organizationId: null }, { organizationId: task.organizationId }],
      },
      data: { isActive: false },
    });
    await this.assertOwned(task, signal);
    this.logger.warn('Crun terminal receipt requires review', {
      code,
      taskId: task.id,
      organizationId: task.organizationId,
      modelKey: task.modelKey,
      contractVersion: task.contractVersion,
    });
  }
  private async finishPhases(
    task: CrunGenerationTask,
    signal?: AbortSignal,
  ): Promise<void> {
    if (
      task.vendorCostRecordedAt &&
      task.state === 'provider-success' &&
      !task.mediaPersistedAt
    )
      task = await this.update(task, signal, { nextAccountingAttemptAt: null });
    const dates = [
      task.nextMediaAttemptAt,
      task.nextAccountingAttemptAt,
    ].filter((date): date is Date => date !== null);
    await this.update(task, signal, {
      nextPollAt: dates.length
        ? new Date(Math.min(...dates.map((date) => date.getTime())))
        : null,
      ...(dates.length === 0 && task.recoveryCode
        ? { state: 'recovery-required' }
        : {}),
      leaseUntil: null,
    });
  }

  private async recover(
    task: CrunGenerationTask,
    signal: AbortSignal | undefined,
    recoveryCode: string,
  ): Promise<void> {
    const fatal = [
      'CRUN_RECEIPT_INVALID',
      'CRUN_FUNDING_INVALID',
      'CRUN_OWNED_INGREDIENT_UNAVAILABLE',
      'CRUN_RATE_INVALID',
    ].includes(recoveryCode);
    const mediaBlocked =
      fatal ||
      [
        'CRUN_MEDIA_INVALID',
        'CRUN_MEDIA_COPY_EXHAUSTED',
        'CRUN_OWNED_MEDIA_UNAVAILABLE',
        'CRUN_ORIGINAL_CREDENTIAL_UNAVAILABLE',
        'CRUN_TERMINAL_RECEIPT_CONFLICT',
      ].includes(recoveryCode);
    const retained = receiptSchema.safeParse(task.terminalReceipt);
    const expenseRetry =
      !task.vendorCostRecordedAt &&
      retained.success &&
      retained.data.credits !== null &&
      retained.data.credits !== undefined &&
      normalizeCrunCredits(retained.data.credits) !== null;
    const accountingBlocked =
      fatal ||
      (!expenseRetry &&
        ![
          'CRUN_MEDIA_INVALID',
          'CRUN_MEDIA_COPY_EXHAUSTED',
          'CRUN_OWNED_MEDIA_UNAVAILABLE',
          'CRUN_ORIGINAL_CREDENTIAL_UNAVAILABLE',
        ].includes(recoveryCode));
    const current = await this.update(task, signal, {
      recoveryCode,
      ...(mediaBlocked ? { nextMediaAttemptAt: null } : {}),
      ...(accountingBlocked ? { nextAccountingAttemptAt: null } : {}),
    });
    await this.finishPhases(current, signal);
  }
}
