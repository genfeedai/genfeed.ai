import * as crypto from 'node:crypto';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { assertSafeWebhookEndpoint } from '@api/services/webhook-client/webhook-endpoint.validator';
import { redactPublishWebhookText } from '@api-types/contracts/publish-webhook-events.contract';
import type { IWebhookDeliveryStatus } from '@genfeedai/interfaces';
import {
  WEBHOOK_CLIENT_QUEUE,
  WebhookJobData,
} from '@genfeedai/queue-contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { firstValueFrom } from 'rxjs';

@Processor(WEBHOOK_CLIENT_QUEUE)
export class WebhookClientProcessor extends WorkerHost {
  private readonly constructorName = 'WebhookClientProcessor';

  constructor(
    private readonly httpService: HttpService,
    private readonly logger: LoggerService,
    private readonly organizationSettingsService: OrganizationSettingsService,
  ) {
    super();
  }

  async process(job: Job<WebhookJobData>): Promise<void> {
    const { endpoint, secret, payload, organizationId, ingredientId, isTest } =
      job.data;
    const attempt = job.attemptsMade + 1;
    const deliveryId = job.data.deliveryId ?? job.id ?? 'unknown';

    this.logger.log(`${this.constructorName} processing webhook job`, {
      attempt,
      deliveryId,
      event: payload.event,
      ingredientId,
      jobId: job.id,
      organizationId,
    });

    try {
      await assertSafeWebhookEndpoint(endpoint);
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
            'X-Genfeed-Delivery': deliveryId,
            'X-Genfeed-Event': payload.event,
            'X-Genfeed-Signature': `sha256=${signature}`,
          },
          maxRedirects: 0,
          timeout: 30000, // 30 second timeout
          validateStatus: (status) => status < 500, // Retry on 5xx, not 4xx
        }),
      );

      await job.updateProgress(100);

      await this.recordDeliveryStatus(organizationId, {
        attempt,
        attemptedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        deliveryId,
        event: payload.event,
        isTest: Boolean(isTest),
        status: response.status >= 400 ? 'rejected' : 'delivered',
        statusCode: response.status,
      });

      this.logger.log(`${this.constructorName} webhook delivered`, {
        deliveryId,
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
            jobId: job.id,
            organizationId,
            statusCode: response.status,
          },
        );
      }
    } catch (error: unknown) {
      const errorMessage = redactPublishWebhookText(
        readErrorMessage(error) || 'Webhook delivery failed',
      );
      const errorCode = readErrorCode(error);

      await this.recordDeliveryStatus(organizationId, {
        attempt,
        attemptedAt: new Date().toISOString(),
        deliveryId,
        error: errorMessage,
        event: payload.event,
        isTest: Boolean(isTest),
        status: 'failed',
        statusCode: readHttpStatusCode(error),
      });

      this.logger.error(`${this.constructorName} webhook delivery failed`, {
        attempt,
        code: errorCode ? redactPublishWebhookText(errorCode) : undefined,
        error: errorMessage,
        event: payload.event,
        ingredientId,
        jobId: job.id,
        maxAttempts: job.opts.attempts,
        organizationId,
      });

      // Re-throw a sanitized error so BullMQ retries without persisting
      // credential material in the job's failedReason or stack.
      throw new Error(errorMessage);
    }
  }

  private async recordDeliveryStatus(
    organizationId: string,
    status: IWebhookDeliveryStatus,
  ): Promise<void> {
    try {
      await this.organizationSettingsService.recordWebhookDeliveryStatus(
        organizationId,
        status,
      );
    } catch (error: unknown) {
      this.logger.warn(`${this.constructorName} failed to record status`, {
        deliveryId: status.deliveryId,
        error: (error as Error)?.message,
        organizationId,
      });
    }
  }
}

function readHttpStatusCode(error: unknown): number | undefined {
  const status = (error as { response?: { status?: unknown } })?.response
    ?.status;
  return typeof status === 'number' ? status : undefined;
}

function readErrorMessage(error: unknown): string | undefined {
  const message = (error as { message?: unknown })?.message;
  return typeof message === 'string' ? message : undefined;
}

function readErrorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown })?.code;
  return typeof code === 'string' ? code : undefined;
}
