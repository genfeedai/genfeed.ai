import { WebhookClientProcessor } from '@workers/processors/api/services/webhook-client/webhook-client.processor';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('WebhookClientProcessor', () => {
  let httpService: { post: ReturnType<typeof vi.fn> };
  let logger: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
  let organizationSettingsService: {
    recordWebhookDeliveryStatus: ReturnType<typeof vi.fn>;
  };
  let processor: WebhookClientProcessor;

  beforeEach(() => {
    httpService = {
      post: vi.fn().mockReturnValue(of({ status: 200 })),
    };
    logger = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };
    organizationSettingsService = {
      recordWebhookDeliveryStatus: vi.fn().mockResolvedValue(undefined),
    };
    processor = new WebhookClientProcessor(
      httpService as never,
      logger as never,
      organizationSettingsService as never,
    );
  });

  it('rejects unsafe webhook endpoints before dispatch', async () => {
    const job = {
      attemptsMade: 0,
      data: {
        endpoint: 'http://127.0.0.1/webhook',
        organizationId: 'org-1',
        payload: {
          event: 'ingredient.generated',
          timestamp: '2026-05-17T10:00:00.000Z',
        },
        secret: 'secret',
      },
      id: 'job-1',
      opts: { attempts: 5 },
      updateProgress: vi.fn(),
    };

    await expect(processor.process(job as never)).rejects.toThrow(
      'Webhook endpoint cannot target private or reserved IPs',
    );

    expect(httpService.post).not.toHaveBeenCalled();
    expect(
      organizationSettingsService.recordWebhookDeliveryStatus,
    ).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        deliveryId: 'job-1',
        event: 'ingredient.generated',
        status: 'failed',
      }),
    );
  });

  it('disables redirects when dispatching webhooks', async () => {
    const job = {
      attemptsMade: 0,
      data: {
        endpoint: 'https://8.8.8.8/webhook',
        organizationId: 'org-1',
        payload: {
          event: 'ingredient.generated',
          timestamp: '2026-05-17T10:00:00.000Z',
        },
        secret: 'secret',
      },
      id: 'job-1',
      opts: { attempts: 5 },
      updateProgress: vi.fn(),
    };

    await processor.process(job as never);

    expect(httpService.post).toHaveBeenCalledWith(
      'https://8.8.8.8/webhook',
      expect.any(Object),
      expect.objectContaining({
        maxRedirects: 0,
      }),
    );
    expect(
      organizationSettingsService.recordWebhookDeliveryStatus,
    ).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        deliveryId: 'job-1',
        event: 'ingredient.generated',
        status: 'delivered',
        statusCode: 200,
      }),
    );
  });

  it('records retryable HTTP failure status codes', async () => {
    const error = new Error('Request failed with status code 503') as Error & {
      response: { status: number };
    };
    error.response = { status: 503 };
    httpService.post.mockReturnValueOnce(throwError(() => error));

    const job = {
      attemptsMade: 0,
      data: {
        endpoint: 'https://8.8.8.8/webhook',
        organizationId: 'org-1',
        payload: {
          event: 'ingredient.generated',
          timestamp: '2026-05-17T10:00:00.000Z',
        },
        secret: 'secret',
      },
      id: 'job-1',
      opts: { attempts: 5 },
      updateProgress: vi.fn(),
    };

    await expect(processor.process(job as never)).rejects.toThrow(
      'Request failed with status code 503',
    );

    expect(
      organizationSettingsService.recordWebhookDeliveryStatus,
    ).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        deliveryId: 'job-1',
        event: 'ingredient.generated',
        status: 'failed',
        statusCode: 503,
      }),
    );
  });
});
