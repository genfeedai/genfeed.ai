import * as crypto from 'node:crypto';
import { ClientRequest } from 'node:http';
import { Readable } from 'node:stream';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import {
  assertSafeWebhookEndpoint,
  createPinnedWebhookAgent,
  type ValidatedWebhookEndpoint,
  WebhookEndpointValidationError,
} from '@api/services/webhook-client/webhook-endpoint.validator';
import { redactPublishWebhookText } from '@genfeedai/contracts/api-types/contracts/publish-webhook-events.contract';
import type { IWebhookDeliveryStatus } from '@genfeedai/contracts/interfaces';
import {
  WEBHOOK_CLIENT_QUEUE,
  WebhookJobData,
} from '@genfeedai/contracts/queue';
import { LoggerService } from '@libs/logger/logger.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { HttpService } from '@nestjs/axios';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import {
  firstValueFrom,
  fromEvent,
  mergeMap,
  takeUntil,
  throwError,
} from 'rxjs';

const WEBHOOK_REQUEST_TIMEOUT_MS = 30_000;

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
    const { payload, organizationId, ingredientId, isTest } = job.data;
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
      const statusCode = await this.sendWebhook(job, deliveryId);

      await job.updateProgress(100);

      await this.recordDeliveryStatus(organizationId, {
        attempt,
        attemptedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        deliveryId,
        event: payload.event,
        isTest: Boolean(isTest),
        status: statusCode >= 400 ? 'rejected' : 'delivered',
        statusCode,
      });

      this.logger.log(`${this.constructorName} webhook delivered`, {
        deliveryId,
        event: payload.event,
        ingredientId,
        jobId: job.id,
        organizationId,
        statusCode,
      });

      // Log warning for 4xx responses (delivered but rejected)
      if (statusCode >= 400) {
        this.logger.warn(
          `${this.constructorName} webhook rejected by endpoint`,
          {
            jobId: job.id,
            organizationId,
            statusCode,
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

      // Re-throw a sanitized error with the original retry class so BullMQ
      // never persists credential material in the job's failedReason or stack.
      throw error instanceof UnrecoverableError
        ? new UnrecoverableError(errorMessage)
        : new Error(errorMessage);
    }
  }

  private async sendWebhook(
    job: Job<WebhookJobData>,
    deliveryId: string,
  ): Promise<number> {
    const { endpoint, payload, secret } = job.data;
    const controller = new AbortController();
    const signal = controller.signal;
    const timer = setTimeout(() => {
      controller.abort(
        new Error(
          `Webhook delivery timed out after ${WEBHOOK_REQUEST_TIMEOUT_MS}ms`,
        ),
      );
    }, WEBHOOK_REQUEST_TIMEOUT_MS);
    let pinnedAgent: ReturnType<typeof createPinnedWebhookAgent> | undefined;
    let responseBody: unknown;
    let outgoingRequest: ClientRequest | undefined;

    try {
      let validatedEndpoint: ValidatedWebhookEndpoint;
      try {
        validatedEndpoint = await waitBeforeAbort(
          assertSafeWebhookEndpoint(endpoint),
          signal,
        );
      } catch (error: unknown) {
        if (error instanceof WebhookEndpointValidationError) {
          throw new UnrecoverableError(
            redactPublishWebhookText(
              getErrorMessage(error, {
                fallback: () => '',
                messageSource: 'error-instance',
              }),
            ),
          );
        }
        throw error;
      }
      await waitBeforeAbort(job.updateProgress(10), signal);
      signal.throwIfAborted();
      const signature = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(payload))
        .digest('hex');
      pinnedAgent = createPinnedWebhookAgent(validatedEndpoint);
      const pinnedAgentConfig =
        validatedEndpoint.url.protocol === 'https:'
          ? { httpsAgent: pinnedAgent }
          : { httpAgent: pinnedAgent };
      await waitBeforeAbort(job.updateProgress(30), signal);
      signal.throwIfAborted();

      const response = await firstValueFrom(
        this.httpService
          .post<Readable>(endpoint, payload, {
            headers: {
              'Content-Type': 'application/json',
              Host: validatedEndpoint.url.host,
              'X-Genfeed-Delivery': deliveryId,
              'X-Genfeed-Event': payload.event,
              'X-Genfeed-Signature': `sha256=${signature}`,
            },
            ...pinnedAgentConfig,
            maxRedirects: 0,
            responseType: 'stream',
            signal,
            timeout: WEBHOOK_REQUEST_TIMEOUT_MS,
            validateStatus: (status) => status < 500,
          })
          .pipe(
            takeUntil(
              fromEvent(signal, 'abort').pipe(
                mergeMap(() => throwError(() => signal.reason)),
              ),
            ),
          ),
      );
      responseBody = response.data;
      if (response.request instanceof ClientRequest)
        outgoingRequest = response.request;
      if (response.status < 400) {
        // Axios' native adapter can expose headers before ClientRequest finishes.
        await waitForOutgoingPayload(response.request, responseBody, signal);
      }
      return response.status;
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null) {
        if ('response' in error) {
          const response = error.response;
          if (typeof response === 'object' && response !== null) {
            if ('data' in response) responseBody = response.data;
            if (
              'request' in response &&
              response.request instanceof ClientRequest
            )
              outgoingRequest = response.request;
          }
        }
        if (
          !outgoingRequest &&
          'request' in error &&
          error.request instanceof ClientRequest
        )
          outgoingRequest = error.request;
      }
      if (signal.aborted) throw signal.reason;
      throw error;
    } finally {
      clearTimeout(timer);
      discardResponseBody(responseBody);
      try {
        outgoingRequest?.destroy();
      } catch {
        // The agent must still close even if request cleanup fails.
      }
      try {
        pinnedAgent?.destroy();
      } catch {
        // Cleanup cannot turn an acknowledgement into a retry or hide its error.
      }
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
        error: redactPublishWebhookText(
          readErrorMessage(error) || 'Failed to record webhook delivery status',
        ),
        organizationId,
      });
    }
  }
}

function waitBeforeAbort<T>(
  operation: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', abort);
    const abort = () => {
      cleanup();
      reject(signal.reason);
    };
    operation.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      },
    );
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  });
}

async function waitForOutgoingPayload(
  request: unknown,
  body: unknown,
  signal: AbortSignal,
): Promise<void> {
  if (!(request instanceof ClientRequest)) {
    throw new Error('Webhook response is missing its outgoing request');
  }
  if (request.errored) throw request.errored;
  if (request.writableFinished) return;
  if (request.destroyed || request.closed) {
    throw new Error('Webhook request closed before its payload finished');
  }
  signal.throwIfAborted();

  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      request.removeListener('finish', finish);
      request.removeListener('close', close);
      request.removeListener('error', fail);
      if (body instanceof Readable) body.removeListener('error', fail);
      signal.removeEventListener('abort', abort);
    };
    const finish = () => {
      cleanup();
      resolve();
    };
    const fail = (error: unknown) => {
      cleanup();
      reject(error);
    };
    const close = () => {
      if (request.writableFinished) finish();
      else
        fail(new Error('Webhook request closed before its payload finished'));
    };
    const abort = () => fail(signal.reason);
    request.once('finish', finish);
    request.once('close', close);
    request.once('error', fail);
    if (body instanceof Readable) body.once('error', fail);
    signal.addEventListener('abort', abort, { once: true });
  });
}

function discardResponseBody(body: unknown): void {
  if (!(body instanceof Readable) || body.closed) return;
  const ignoreError = () => undefined;
  const cleanup = () => {
    body.removeListener('error', ignoreError);
    body.removeListener('close', cleanup);
  };
  body.once('error', ignoreError);
  body.once('close', cleanup);
  try {
    body.destroy();
  } catch {
    cleanup();
  }
}

function readHttpStatusCode(error: unknown): number | undefined {
  const status = (error as { response?: { status?: unknown } })?.response
    ?.status;
  return typeof status === 'number' ? status : undefined;
}

function readErrorMessage(error: unknown): string | undefined {
  return getErrorMessage(error, { fallback: () => undefined });
}

function readErrorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown })?.code;
  return typeof code === 'string' ? code : undefined;
}
