import { CreditTransactionsService } from '@api/collections/credits/services/credit-transactions.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { runWithWorkflowAccounting } from '@api/collections/workflow-executions/services/workflow-accounting.context';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import { CreditTransactionCategory } from '@genfeedai/contracts';
import {
  CREDIT_DEDUCTION_QUEUE,
  CreditDeductionJobData,
} from '@genfeedai/contracts/queue';
import { LoggerService } from '@libs/logger/logger.service';
import { PrismaService } from '@libs/prisma/prisma.service';
import { RedisService } from '@libs/redis/redis.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';

const LOW_CREDITS_THRESHOLD = 1000;
const LOW_CREDITS_DEBOUNCE_TTL_SECONDS = 86400; // 24 hours

@Processor(CREDIT_DEDUCTION_QUEUE)
export class CreditDeductionProcessor extends WorkerHost {
  private readonly constructorName = 'CreditDeductionProcessor';

  constructor(
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly creditTransactionsService: CreditTransactionsService,
    private readonly notificationsService: NotificationsService,
    private readonly redisService: RedisService,
    private readonly logger: LoggerService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<CreditDeductionJobData>): Promise<void> {
    const scope = job.data.workflowAccounting;
    if (!scope) return this.processScoped(job);
    if (
      scope.organizationId !== job.data.organizationId ||
      !(await this.prisma.workflowExecution.findFirst({
        where: {
          id: scope.workflowExecutionId,
          organizationId: job.data.organizationId,
          isDeleted: false,
        },
        select: { id: true },
      }))
    )
      throw new UnrecoverableError(
        'Workflow accounting scope does not match credit job',
      );
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
      if (type === 'deduct-credits') {
        if (!userId) {
          throw new UnrecoverableError('Credit deduction job missing userId');
        }

        if (
          job.data.settlementAssetId &&
          !(await this.isMediaSettlementBillable(job))
        ) {
          if (job.data.reservationId) {
            await this.creditsUtilsService.releaseReservation({
              organizationId,
              reservationId: job.data.reservationId,
            });
          }
          return;
        }

        if (job.data.reservationId) {
          await this.creditsUtilsService.settleReservation({
            actualAmount: amount,
            actorUserId: userId,
            description,
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
              idempotencyKey: job.data.idempotencyKey,
              maxOverdraftCredits: job.data.maxOverdraftCredits,
              metadata: job.data.metadata,
              referenceId: job.data.referenceId,
              referenceType: job.data.referenceType,
            },
          );
        }

        await this.checkLowCredits(organizationId);
      } else if (type === 'record-byok-usage') {
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

  private async isMediaSettlementBillable(
    job: Job<CreditDeductionJobData>,
  ): Promise<boolean> {
    const { data } = job;
    const asset = await this.prisma.ingredient.findFirst({
      select: { cdnUrl: true, id: true, s3Key: true, status: true },
      where: {
        id: data.settlementAssetId,
        isDeleted: false,
        organizationId: data.organizationId,
      },
    });
    const status = String(asset?.status ?? '').toUpperCase();
    if (['FAILED', 'REJECTED', 'ARCHIVED'].includes(status)) {
      this.logger.log(
        `${this.constructorName} skipped terminal media settlement`,
        {
          assetId: data.settlementAssetId,
          organizationId: data.organizationId,
          status,
        },
      );
      return false;
    }
    if (status !== 'GENERATED' && status !== 'VALIDATED') {
      const attempts = Number(job.opts.attempts) || 1;
      if (job.attemptsMade + 1 >= attempts) {
        this.logger.error(
          `${this.constructorName} media settlement requires operator reconciliation`,
          {
            assetId: data.settlementAssetId,
            attempts,
            organizationId: data.organizationId,
            status: status || 'missing',
          },
        );
      }
      throw new Error(
        `Media asset ${data.settlementAssetId} is not terminal (${status || 'missing'})`,
      );
    }
    if (!asset?.cdnUrl && !asset?.s3Key) {
      this.logger.log(
        `${this.constructorName} skipped inaccessible media settlement`,
        {
          assetId: data.settlementAssetId,
          organizationId: data.organizationId,
          status,
        },
      );
      return false;
    }
    return true;
  }

  private async checkLowCredits(organizationId: string): Promise<void> {
    try {
      const balance =
        await this.creditsUtilsService.getOrganizationCreditsBalance(
          organizationId,
        );

      if (balance >= LOW_CREDITS_THRESHOLD) {
        return;
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

      await this.notificationsService.sendLowCreditsAlert(
        organizationId,
        balance,
      );

      this.logger.log(
        `${this.constructorName} low-credits alert sent for ${organizationId}`,
        { balance, threshold: LOW_CREDITS_THRESHOLD },
      );
    } catch (error: unknown) {
      this.logger.error(
        `${this.constructorName} failed to check low credits`,
        error,
      );
    }
  }
}
