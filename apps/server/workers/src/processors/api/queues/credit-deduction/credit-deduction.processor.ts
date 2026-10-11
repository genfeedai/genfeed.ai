import { isCreditTransactionConflict } from '@api/collections/credits/services/credit-transaction-conflict';
import { CreditTransactionsService } from '@api/collections/credits/services/credit-transactions.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { runWithWorkflowAccounting } from '@api/collections/workflow-executions/services/workflow-accounting.context';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import { crunReceiptAllowsDisposition } from '@api/helpers/utils/credits/generation-quote-group.schema';
import { generationUsageReceiptSchema } from '@api/helpers/utils/credits/generation-submission-evidence.schema';
import { modelBillableQuoteSnapshotSchema } from '@api/helpers/utils/credits/model-billable-quote.schema';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import { getCrunMediaKind } from '@api/services/integrations/crun/crun-media-kind.util';
import { crunFundingBindingSchema } from '@api/services/integrations/crun/crun-task.schema';
import { FreeTrialEmailsService } from '@api/services/lifecycle-emails/free-trial-emails.service';
import { LowCreditThresholdService } from '@api/services/low-credit-threshold/low-credit-threshold.service';
import {
  ActivityKey,
  ActivitySource,
  CreditTransactionCategory,
  IngredientCategory,
} from '@genfeedai/contracts';
import { MEDIA_GENERATION_LATE_SETTLEMENT_KEY_PREFIX } from '@genfeedai/contracts/constants';
import {
  CREDIT_DEDUCTION_QUEUE,
  CreditDeductionJobData,
} from '@genfeedai/contracts/queue';
import {
  type CrunGenerationTask,
  type Ingredient,
  Prisma,
} from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { PrismaService } from '@libs/prisma/prisma.service';
import { RedisService } from '@libs/redis/redis.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';

const LOW_CREDITS_DEBOUNCE_TTL_SECONDS = 86400; // 24 hours

@Processor(CREDIT_DEDUCTION_QUEUE)
export class CreditDeductionProcessor extends WorkerHost {
  private readonly constructorName = 'CreditDeductionProcessor';

  constructor(
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly creditTransactionsService: CreditTransactionsService,
    private readonly activityRecorder: ActivityRecorderService,
    private readonly redisService: RedisService,
    private readonly logger: LoggerService,
    private readonly prisma: PrismaService,
    private readonly lowCreditThreshold: LowCreditThresholdService,
    private readonly freeTrialEmails: FreeTrialEmailsService,
  ) {
    super();
  }

  async process(job: Job<CreditDeductionJobData>): Promise<void> {
    const scope = job.data.workflowAccounting;
    if (!scope) return this.processScoped(job);
    if (scope.organizationId !== job.data.organizationId) {
      throw new UnrecoverableError(
        'Workflow accounting scope does not match credit job',
      );
    }
    const execution = await this.prisma.workflowExecution.findFirst({
      where: {
        id: scope.workflowExecutionId,
        organizationId: job.data.organizationId,
        isDeleted: false,
      },
      select: { id: true },
    });
    if (!execution) return this.processScoped(job);
    return runWithWorkflowAccounting(scope, () => this.processScoped(job));
  }

  private async processScoped(job: Job<CreditDeductionJobData>): Promise<void> {
    const { type, organizationId, userId, amount, description, source } =
      job.data;

    this.logger.log(`${this.constructorName} processing job`, {
      attempt: job.attemptsMade + 1,
      jobId: job.id,
      organizationId,
      type,
    });

    try {
      if (job.data.acceptedGeneration) {
        await this.attachAcceptedGeneration(job.data);
        if (amount === 0 && type === 'deduct-credits') return;
      }
      if (type === 'deduct-credits') {
        if (!userId) {
          throw new UnrecoverableError('Credit deduction job missing userId');
        }

        if (
          job.data.settlementAssetId &&
          !(await this.isLegacyMediaBillable(job))
        ) {
          if (job.data.reservationId)
            await this.creditsUtilsService.releaseReservation({
              organizationId,
              reservationId: job.data.reservationId,
            });
          return;
        }
        if (job.data.reservationId) {
          await this.creditsUtilsService.settleReservation({
            settlementIdempotencyKey: job.data.idempotencyKey,
            actualAmount: amount,
            actorUserId: userId,
            brandId: job.data.brandId,
            description,
            metadata: job.data.metadata,
            organizationId,
            reservationId: job.data.reservationId,
            source,
          });
        } else {
          await this.creditsUtilsService.deductCreditsFromOrganization(
            organizationId,
            userId,
            amount,
            description,
            source,
            {
              brandId: job.data.brandId,
              // Payloads queued before keys were required carry none; their
              // stable job id still names the charge across retries.
              idempotencyKey:
                job.data.idempotencyKey ??
                (job.id ? `credit-job:${job.id}` : undefined),
              maxOverdraftCredits: job.data.maxOverdraftCredits,
              metadata: job.data.metadata,
              referenceId:
                job.data.referenceId ??
                (job.data.idempotencyKey?.startsWith(
                  `${MEDIA_GENERATION_LATE_SETTLEMENT_KEY_PREFIX}:`,
                )
                  ? job.data.idempotencyKey.slice(
                      `${MEDIA_GENERATION_LATE_SETTLEMENT_KEY_PREFIX}:`.length,
                    )
                  : undefined),
              referenceType:
                job.data.referenceType ??
                (job.data.idempotencyKey?.startsWith(
                  `${MEDIA_GENERATION_LATE_SETTLEMENT_KEY_PREFIX}:`,
                )
                  ? 'credit_reservation'
                  : undefined),
            },
          );
        }

        await this.checkLowCredits(organizationId);
      } else if (type === 'record-byok-usage') {
        if (await this.recordCrunByokUsage(job.data)) return;
        const currentBalance =
          await this.creditsUtilsService.getOrganizationCreditsBalance(
            organizationId,
          );

        await this.creditTransactionsService.createTransactionEntry(
          organizationId,
          CreditTransactionCategory.BYOK_USAGE,
          amount,
          currentBalance,
          currentBalance,
          source,
          `[BYOK] ${description}`,
          undefined,
          undefined,
          {
            idempotencyKey: `byok:${organizationId}:${job.data.idempotencyKey ?? job.id}`,
            actorUserId: userId,
            brandId: job.data.brandId,
            metadata: job.data.metadata,
          },
        );
      }

      this.logger.log(`${this.constructorName} job completed`, {
        jobId: job.id,
        organizationId,
        type,
      });
    } catch (error: unknown) {
      this.logger.error(`${this.constructorName} job failed`, {
        attempt: job.attemptsMade + 1,
        error: getErrorMessage(error, { fallback: () => undefined }),
        jobId: job.id,
        maxAttempts: job.opts.attempts,
        organizationId,
        type,
      });

      // BusinessLogicException = permanent failure (e.g. "insufficient credits"
      // on retry means deduction already committed but side effects failed)
      if (error instanceof BusinessLogicException) {
        throw new UnrecoverableError(
          getErrorMessage(error, {
            fallback: () => '',
            messageSource: 'error-instance',
          }),
        );
      }

      // Transient error — BullMQ retries
      throw error;
    }
  }

  private canonical(value: unknown): string {
    const normalize = (item: unknown): unknown => {
      if (Array.isArray(item)) return item.map(normalize);
      if (item && typeof item === 'object')
        return Object.fromEntries(
          Object.entries(item)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, child]) => [key, normalize(child)]),
        );
      return item;
    };
    return JSON.stringify(normalize(value));
  }

  private async recordCrunByokUsage(
    data: CreditDeductionJobData,
  ): Promise<boolean> {
    const metadata = data.metadata;
    const assetId =
      typeof metadata?.assetId === 'string' ? metadata.assetId : null;
    const marked = metadata?.submissionIntentProvider === 'crun';
    const key = data.idempotencyKey;
    const media =
      typeof key === 'string' && key.startsWith('media-generation-usage:');
    const invalid = () =>
      new UnrecoverableError('CRUN_BYOK_USAGE_IDENTITY_INVALID');
    if (key !== undefined && typeof key !== 'string') throw invalid();
    if (
      (media || marked) &&
      (!assetId ||
        data.idempotencyKey !== `media-generation-usage:${assetId}` ||
        typeof data.organizationId !== 'string' ||
        !data.organizationId ||
        typeof data.userId !== 'string' ||
        !data.userId)
    )
      throw invalid();
    if (!assetId) return false;
    const where = {
      id: assetId,
      organizationId: data.organizationId,
      isDeleted: false,
    };
    const ingredient = await this.prisma.ingredient.findFirst({
      where,
      select: { generationBilling: true },
    });
    if (!ingredient && (media || marked)) throw invalid();
    const task = await this.prisma.crunGenerationTask.findFirst({
      where: {
        ingredientId: assetId,
        organizationId: data.organizationId,
        isDeleted: false,
      },
    });
    const receipt = generationUsageReceiptSchema.safeParse(
      ingredient?.generationBilling,
    );
    const crun =
      marked ||
      Boolean(task) ||
      (receipt.success && receipt.data.submissionIntentProvider === 'crun');
    if (!crun) {
      if (media && !receipt.success) throw new Error('CRUN_BYOK_USAGE_HELD');
      return false;
    }
    if (
      data.idempotencyKey !== `media-generation-usage:${assetId}` ||
      !data.organizationId ||
      !data.userId ||
      !Number.isFinite(data.amount) ||
      data.amount < 0
    )
      throw invalid();
    for (let attempt = 0; ; attempt++) {
      try {
        await this.prisma.$transaction(
          (tx) => this.recordCrunByokUsageInTransaction(tx, data, assetId),
          { isolationLevel: 'Serializable' },
        );
        return true;
      } catch (error: unknown) {
        if (attempt >= 2 || !isCreditTransactionConflict(error)) throw error;
      }
    }
  }

  private async recordCrunByokUsageInTransaction(
    tx: Prisma.TransactionClient,
    data: CreditDeductionJobData,
    assetId: string,
  ): Promise<void> {
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "crun_generation_tasks" WHERE "organizationId" = ${data.organizationId} AND "ingredientId" = ${assetId} AND "isDeleted" = false FOR UPDATE`,
    );
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "ingredients" WHERE "organizationId" = ${data.organizationId} AND "id" = ${assetId} AND "isDeleted" = false FOR UPDATE`,
    );
    const current = await tx.crunGenerationTask.findFirst({
      where: {
        ingredientId: assetId,
        organizationId: data.organizationId,
        isDeleted: false,
      },
    });
    const owned = await tx.ingredient.findFirst({
      where: {
        id: assetId,
        organizationId: data.organizationId,
        isDeleted: false,
      },
      select: {
        userId: true,
        category: true,
        status: true,
        s3Key: true,
        generationBilling: true,
      },
    });
    const binding = this.validateCrunByokProof(data, assetId, current, owned);
    const key = `byok:${data.organizationId}:media-generation-usage:${assetId}`;
    const existing = await tx.creditTransaction.findFirst({
      where: {
        organizationId: data.organizationId,
        isDeleted: false,
        idempotencyKey: key,
      },
    });
    if (existing) {
      const saved = existing.metadata;
      if (
        existing.category !== CreditTransactionCategory.BYOK_USAGE ||
        existing.actorUserId !== data.userId ||
        existing.amount !== data.amount ||
        existing.source !== data.source ||
        !saved ||
        typeof saved !== 'object' ||
        Array.isArray(saved) ||
        saved.assetId !== assetId
      )
        throw new UnrecoverableError('CRUN_BYOK_USAGE_DUPLICATE_CONFLICT');
      return;
    }
    const balance =
      await this.creditsUtilsService.getOrganizationCreditsBalance(
        data.organizationId,
        tx,
      );
    await this.creditTransactionsService.createTransactionEntry(
      data.organizationId,
      CreditTransactionCategory.BYOK_USAGE,
      binding.receipt.amount,
      balance,
      balance,
      binding.receipt.source,
      binding.receipt.description,
      undefined,
      tx,
      {
        actorUserId: data.userId,
        idempotencyKey: key,
        metadata: { assetId, submissionIntentProvider: 'crun' },
      },
    );
  }

  private validateCrunByokProof(
    data: CreditDeductionJobData,
    assetId: string,
    current: CrunGenerationTask | null,
    owned: Pick<
      Ingredient,
      'userId' | 'category' | 'status' | 's3Key' | 'generationBilling'
    > | null,
  ) {
    const invalid = () =>
      new UnrecoverableError('CRUN_BYOK_USAGE_IDENTITY_INVALID');
    if (!owned) throw invalid();
    if (!current) throw new Error('CRUN_BYOK_USAGE_HELD');
    const binding = crunFundingBindingSchema.safeParse(current.fundingBinding);
    const quote = modelBillableQuoteSnapshotSchema.safeParse(
      current.quoteSnapshot,
    );
    const usage = generationUsageReceiptSchema.safeParse(
      owned.generationBilling,
    );
    if (
      !binding.success ||
      binding.data.kind !== 'byok' ||
      !quote.success ||
      !quote.data.providerQuote ||
      !usage.success
    )
      throw invalid();
    const kind = getCrunMediaKind(current.endpoint);
    const frozen = quote.data.providerQuote;
    const outputs =
      quote.data.quantities.outputs ?? quote.data.quantities.requests ?? 1;
    const {
      kind: _kind,
      state: _state,
      confirmedFailure: _failure,
      ...immutable
    } = usage.data;
    if (
      current.organizationId !== data.organizationId ||
      current.ingredientId !== assetId ||
      current.userId !== data.userId ||
      owned.userId !== current.userId ||
      current.credentialSource !== 'byok' ||
      current.reservationId !== null ||
      frozen.credentialSource !== 'byok' ||
      frozen.provider !== 'crun' ||
      quote.data.modelKey !== current.modelKey ||
      quote.data.pricingProfile.key !== current.modelKey ||
      current.modelKey !== `crun/${current.endpoint}` ||
      !kind ||
      owned.category !==
        (kind === 'video'
          ? IngredientCategory.VIDEO
          : IngredientCategory.IMAGE) ||
      frozen.contractVersion !== current.contractVersion ||
      frozen.inputHash !== current.inputHash ||
      frozen.credentialId !== current.credentialId ||
      frozen.credentialFingerprint !== current.credentialFingerprint ||
      current.outputIndex < 0 ||
      current.outputIndex >= outputs ||
      quote.data.credits / outputs !== binding.data.receipt.amount ||
      this.canonical(immutable) !== this.canonical(binding.data.receipt) ||
      data.amount !== binding.data.receipt.amount ||
      data.source !== binding.data.receipt.source ||
      data.description !== binding.data.receipt.description ||
      data.userId !== binding.data.receipt.userId
    )
      throw invalid();
    if (
      usage.data.submissionIntentProvider !== 'crun' ||
      !['pending', 'recorded'].includes(usage.data.state) ||
      usage.data.confirmedFailure ||
      !['GENERATED', 'VALIDATED'].includes(owned.status) ||
      !owned.s3Key ||
      !crunReceiptAllowsDisposition(current, 'settle')
    )
      throw new Error('CRUN_BYOK_USAGE_HELD');
    return binding.data;
  }

  private async attachAcceptedGeneration(
    data: CreditDeductionJobData,
  ): Promise<void> {
    const accepted = data.acceptedGeneration;
    if (!accepted) return;
    const ingredient = await this.prisma.ingredient.findFirst({
      where: {
        id: accepted.ingredientId,
        organizationId: data.organizationId,
        isDeleted: false,
      },
      select: {
        metadata: { select: { id: true, externalId: true, isDeleted: true } },
      },
    });
    const metadata = ingredient?.metadata;
    if (!metadata || metadata.isDeleted) {
      throw new UnrecoverableError(
        'Accepted generation asset or metadata is unavailable in this organization',
      );
    }
    if (metadata.externalId && metadata.externalId !== accepted.externalId) {
      throw new UnrecoverableError(
        'Accepted generation provider identity conflicts with persisted metadata',
      );
    }
    const updated = await this.prisma.metadata.updateMany({
      where: {
        id: metadata.id,
        isDeleted: false,
        ingredients: {
          some: {
            id: accepted.ingredientId,
            organizationId: data.organizationId,
            isDeleted: false,
          },
        },
        OR: [{ externalId: null }, { externalId: accepted.externalId }],
      },
      data: { externalId: accepted.externalId },
    });
    if (updated.count !== 1)
      throw new Error(
        'Accepted generation metadata changed before persistence',
      );
  }

  private async isLegacyMediaBillable(
    job: Job<CreditDeductionJobData>,
  ): Promise<boolean> {
    const asset = await this.prisma.ingredient.findFirst({
      select: {
        id: true,
        s3Key: true,
        status: true,
        metadata: { select: { result: true } },
      },
      where: {
        id: job.data.settlementAssetId,
        organizationId: job.data.organizationId,
        isDeleted: false,
      },
    });
    const status = String(asset?.status ?? '').toUpperCase();
    if (['FAILED', 'REJECTED', 'ARCHIVED'].includes(status)) return false;
    if (status !== 'GENERATED' && status !== 'VALIDATED')
      throw new Error(
        `Media asset ${job.data.settlementAssetId} is not terminal (${status || 'missing'})`,
      );
    return Boolean(asset?.s3Key || asset?.metadata?.result);
  }

  private async checkLowCredits(organizationId: string): Promise<void> {
    try {
      const balance =
        await this.creditsUtilsService.getOrganizationCreditsBalance(
          organizationId,
        );
      // Relative threshold (`LowCreditThresholdService`): one default image
      // for a never-paid organization in its trial, 10% of the latest paid
      // grant (never below one image) for a paying one.
      const { isTrialSubject, threshold } =
        await this.lowCreditThreshold.resolve(organizationId);

      if (threshold === null || balance >= threshold) {
        return;
      }

      // Never-paid organizations also get "You're running low on credits"
      // by email, once per organization (the email service owns that guard).
      if (isTrialSubject) {
        await this.freeTrialEmails.sendTrialCreditsLow(organizationId);
      }

      const publisher = this.redisService.getPublisher();
      if (!publisher) {
        this.logger.warn(
          `${this.constructorName} Redis not available for low-credits debounce`,
        );
        return;
      }

      const debounceKey = `low-credits-notified:${organizationId}`;
      const wasSet = await publisher.set(
        debounceKey,
        '1',
        'EX',
        LOW_CREDITS_DEBOUNCE_TTL_SECONDS,
        'NX',
      );

      if (!wasSet) {
        this.logger.debug(
          `${this.constructorName} low-credits alert already sent for ${organizationId} (debounced)`,
        );
        return;
      }

      // The alert policy puts CREDITS_LOW in the owner's bell and the
      // operator Discord. The debounce window keys the alert, so a lost
      // Redis marker cannot double-alert within one window.
      const window = Math.floor(
        Date.now() / (LOW_CREDITS_DEBOUNCE_TTL_SECONDS * 1000),
      );
      await this.activityRecorder.record({
        alert: {
          deduplicationKey: `${ActivityKey.CREDITS_LOW}/${organizationId}/${window}`,
          operatorMessages: {
            discord: {
              action: 'low_credits_alert',
              payload: { balance, organizationId },
              type: 'discord',
            },
          },
        },
        key: ActivityKey.CREDITS_LOW,
        organizationId,
        source: ActivitySource.SCRIPT,
        value: JSON.stringify({ balance, threshold }),
      });

      this.logger.log(
        `${this.constructorName} low-credits alert sent for ${organizationId}`,
        { balance, threshold },
      );
    } catch (error: unknown) {
      this.logger.error(
        `${this.constructorName} failed to check low credits`,
        error,
      );
    }
  }
}
