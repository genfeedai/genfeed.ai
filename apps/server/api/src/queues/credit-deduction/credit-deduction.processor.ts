import { CreditTransactionsService } from '@api/collections/credits/services/credit-transactions.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { BusinessLogicException } from '@api/helpers/exceptions/business/business-logic.exception';
import { CreditDeductionJobData } from '@api/queues/credit-deduction/credit-deduction-job.interface';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import { CreditTransactionCategory } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';

const LOW_CREDITS_THRESHOLD = 1000;
const LOW_CREDITS_DEBOUNCE_TTL_SECONDS = 86400; // 24 hours

@Processor('credit-deduction')
export class CreditDeductionProcessor extends WorkerHost {
  private readonly constructorName = 'CreditDeductionProcessor';

  constructor(
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly creditTransactionsService: CreditTransactionsService,
    private readonly notificationsService: NotificationsService,
    private readonly redisService: RedisService,
    private readonly logger: LoggerService,
  ) {
    super();
  }

  async process(job: Job<CreditDeductionJobData>): Promise<void> {
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
        await this.creditsUtilsService.deductCreditsFromOrganization(
          organizationId,
          userId!,
          amount,
          description,
          source,
          { maxOverdraftCredits: job.data.maxOverdraftCredits },
        );

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
        error: (error as Error)?.message,
        jobId: job.id,
        maxAttempts: job.opts.attempts,
        organizationId,
        type,
      });

      // BusinessLogicException = permanent failure (e.g. "insufficient credits"
      // on retry means deduction already committed but side effects failed)
      if (error instanceof BusinessLogicException) {
        throw new UnrecoverableError((error as Error).message);
      }

      // Transient error — BullMQ retries
      throw error;
    }
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
      const wasSet = await publisher.set(debounceKey, '1', {
        EX: LOW_CREDITS_DEBOUNCE_TTL_SECONDS,
        NX: true,
      });

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
