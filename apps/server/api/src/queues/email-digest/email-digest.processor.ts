import {
  type EmailDigestResult,
  EmailDigestService,
} from '@api/collections/content-performance/services/email-digest.service';
import {
  BrokenCircuitError,
  createProcessorCircuitBreaker,
  type ProcessorCircuitBreaker,
} from '@api/shared/utils/circuit-breaker/circuit-breaker.util';
import { LoggerService } from '@libs/logger/logger.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

export interface EmailDigestJobData {
  organizationId: string;
  brandId: string;
  recipientEmails?: string[];
  startDate?: string;
  endDate?: string;
}

@Processor('email-digest')
export class EmailDigestProcessor extends WorkerHost {
  private readonly circuitBreaker: ProcessorCircuitBreaker;

  constructor(
    private readonly emailDigestService: EmailDigestService,
    private readonly logger: LoggerService,
  ) {
    super();
    this.circuitBreaker = createProcessorCircuitBreaker(
      'email-digest',
      this.logger,
    );
  }

  async process(job: Job<EmailDigestJobData>): Promise<EmailDigestResult> {
    try {
      return await this.circuitBreaker.execute(() => this.processInternal(job));
    } catch (error: unknown) {
      if (error instanceof BrokenCircuitError) {
        this.logger.warn((error as Error).message);
        throw error;
      }
      throw error;
    }
  }

  private async processInternal(
    job: Job<EmailDigestJobData>,
  ): Promise<EmailDigestResult> {
    const { organizationId, brandId, recipientEmails, startDate, endDate } =
      job.data;

    this.logger.log(
      `Processing email digest for org=${organizationId} brand=${brandId}`,
    );

    await job.updateProgress(10);

    const result = await this.emailDigestService.sendDigest({
      brandId,
      endDate,
      organizationId,
      recipientEmails,
      startDate,
    });

    await job.updateProgress(100);

    this.logger.log(
      `Email digest completed for org=${organizationId}: sent=${result.sent}, errors=${result.errors}`,
    );

    return result;
  }
}
