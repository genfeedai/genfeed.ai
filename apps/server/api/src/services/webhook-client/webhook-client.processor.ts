import * as crypto from 'node:crypto';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { firstValueFrom } from 'rxjs';

export interface WebhookJobData {
  endpoint: string;
  secret: string;
  payload: {
    event: string;
    timestamp: string;
    [key: string]: unknown;
  };
  organizationId: string;
  ingredientId?: string;
}

@Processor('webhook-client')
export class WebhookClientProcessor extends WorkerHost {
  private readonly constructorName = 'WebhookClientProcessor';

  constructor(
    private readonly httpService: HttpService,
    private readonly logger: LoggerService,
  ) {
    super();
  }

  async process(job: Job<WebhookJobData>): Promise<void> {
    const { endpoint, secret, payload, organizationId, ingredientId } =
      job.data;

    this.logger.log(`${this.constructorName} processing webhook job`, {
      attempt: job.attemptsMade + 1,
      event: payload.event,
      ingredientId,
      jobId: job.id,
      organizationId,
    });

    try {
      await job.updateProgress(10);

      const payloadString = JSON.stringify(payload);

      // Generate HMAC-SHA256 signature
      const signature = crypto
        .createHmac('sha256', secret)
        .update(payloadString)
        .digest('hex');

      await job.updateProgress(30);

      // Send webhook with timeout
      const response = await firstValueFrom(
        this.httpService.post(endpoint, payload, {
          headers: {
            'Content-Type': 'application/json',
            'X-Genfeed-Delivery': job.id,
            'X-Genfeed-Event': payload.event,
            'X-Genfeed-Signature': `sha256=${signature}`,
          },
          timeout: 30000, // 30 second timeout
          validateStatus: (status) => status < 500, // Retry on 5xx, not 4xx
        }),
      );

      await job.updateProgress(100);

      this.logger.log(`${this.constructorName} webhook delivered`, {
        event: payload.event,
        ingredientId,
        jobId: job.id,
        organizationId,
        statusCode: response.status,
      });

      // Log warning for 4xx responses (delivered but rejected)
      if (response.status >= 400) {
        this.logger.warn(
          `${this.constructorName} webhook rejected by endpoint`,
          {
            endpoint,
            jobId: job.id,
            organizationId,
            statusCode: response.status,
          },
        );
      }
    } catch (error: unknown) {
      this.logger.error(`${this.constructorName} webhook delivery failed`, {
        attempt: job.attemptsMade + 1,
        // @ts-expect-error TS2339
        code: (error as Error)?.code,
        error: (error as Error)?.message,
        event: payload.event,
        ingredientId,
        jobId: job.id,
        maxAttempts: job.opts.attempts,
        organizationId,
      });

      // Re-throw to trigger retry
      throw error;
    }
  }
}
