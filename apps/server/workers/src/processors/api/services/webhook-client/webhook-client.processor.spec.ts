import { WebhookClientProcessor } from '@workers/processors/api/services/webhook-client/webhook-client.processor';
import { UnrecoverableError } from 'bullmq';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dnsLookupMock = vi.hoisted(() => vi.fn());

vi.mock('node:dns/promises', () => ({
  lookup: dnsLookupMock,
}));

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
    dnsLookupMock.mockReset();
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

  it('pins HTTPS dispatch to the validated addresses while preserving Host and SNI', async () => {
    dnsLookupMock.mockResolvedValueOnce([
      { address: '93.184.216.34', family: 4 },
      { address: '2606:4700:4700::1111', family: 6 },
    ]);
    const job = {
      attemptsMade: 0,
      data: {
        endpoint: 'https://hooks.example.com/webhook',
        organizationId: 'org-1',
        payload: {
          event: 'ingredient.generated',
          timestamp: '2026-05-17T10:00:00.000Z',
        },
        secret: 'secret',
      },
      id: 'job-https-pinned',
      opts: { attempts: 5 },
      updateProgress: vi.fn(),
    };

    await processor.process(job as never);

    const [requestUrl, _payload, requestOptions] =
      httpService.post.mock.calls[0] ?? [];
    expect(requestUrl).toBe('https://hooks.example.com/webhook');
    expect(requestOptions).toMatchObject({
      headers: {
        Host: 'hooks.example.com',
      },
      httpsAgent: expect.any(Object),
      maxRedirects: 0,
      timeout: 30000,
    });
    expect(requestOptions.httpAgent).toBeUndefined();
    expect(requestOptions.httpsAgent.options.servername).toBe(
      'hooks.example.com',
    );

    dnsLookupMock.mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }]);
    await new Promise<void>((resolve, reject) => {
      requestOptions.httpsAgent.options.lookup(
        'hooks.example.com',
        { all: true },
        (error: Error | null, addresses: unknown) => {
          if (error) {
            reject(error);
            return;
          }

          expect(addresses).toEqual([
            { address: '93.184.216.34', family: 4 },
            { address: '2606:4700:4700::1111', family: 6 },
          ]);
          resolve();
        },
      );
    });
    expect(dnsLookupMock).toHaveBeenCalledTimes(1);
  });

  it('pins HTTP dispatch to a public IPv6 literal', async () => {
    const job = {
      attemptsMade: 0,
      data: {
        endpoint: 'http://[2606:4700:4700::1111]/webhook',
        organizationId: 'org-1',
        payload: {
          event: 'ingredient.generated',
          timestamp: '2026-05-17T10:00:00.000Z',
        },
        secret: 'secret',
      },
      id: 'job-http-ipv6-pinned',
      opts: { attempts: 5 },
      updateProgress: vi.fn(),
    };

    await processor.process(job as never);

    const requestOptions = httpService.post.mock.calls[0]?.[2];
    expect(requestOptions).toMatchObject({
      headers: {
        Host: '[2606:4700:4700::1111]',
      },
      httpAgent: expect.any(Object),
    });
    expect(requestOptions.httpsAgent).toBeUndefined();
    expect(dnsLookupMock).not.toHaveBeenCalled();

    await new Promise<void>((resolve, reject) => {
      requestOptions.httpAgent.options.lookup(
        '2606:4700:4700::1111',
        {},
        (error: Error | null, address: string, family: number) => {
          if (error) {
            reject(error);
            return;
          }

          expect(address).toBe('2606:4700:4700::1111');
          expect(family).toBe(6);
          resolve();
        },
      );
    });
  });

  it('fails closed without dispatch when DNS returns no public addresses', async () => {
    dnsLookupMock.mockResolvedValueOnce([]);
    const job = {
      attemptsMade: 0,
      data: {
        endpoint: 'https://hooks.example.com/webhook',
        organizationId: 'org-1',
        payload: {
          event: 'ingredient.generated',
          timestamp: '2026-05-17T10:00:00.000Z',
        },
        secret: 'secret',
      },
      id: 'job-empty-dns',
      opts: { attempts: 5 },
      updateProgress: vi.fn(),
    };

    await expect(processor.process(job as never)).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
    expect(httpService.post).not.toHaveBeenCalled();
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

    const delivery = processor.process(job as never);
    await expect(delivery).rejects.toBeInstanceOf(UnrecoverableError);
    await expect(delivery).rejects.toThrow(
      'Webhook endpoint cannot target private or reserved IPs',
    );

    expect(httpService.post).not.toHaveBeenCalled();
    expect(
      organizationSettingsService.recordWebhookDeliveryStatus,
    ).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        attempt: 1,
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
        attempt: 1,
        deliveryId: 'job-1',
        event: 'ingredient.generated',
        status: 'delivered',
        statusCode: 200,
      }),
    );
  });

  it('records retryable HTTP failure status codes', async () => {
    const error = new Error(
      'Request failed with status code 503 api_key=raw-provider-key',
    ) as Error & {
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
      'Request failed with status code 503 api_key=[REDACTED]',
    );

    expect(
      organizationSettingsService.recordWebhookDeliveryStatus,
    ).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        attempt: 1,
        deliveryId: 'job-1',
        error: 'Request failed with status code 503 api_key=[REDACTED]',
        event: 'ingredient.generated',
        status: 'failed',
        statusCode: 503,
      }),
    );
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(
      'raw-provider-key',
    );
  });

  it('records 4xx responses as rejected without triggering a retry', async () => {
    httpService.post.mockReturnValueOnce(of({ status: 422 }));
    const job = {
      attemptsMade: 0,
      data: {
        endpoint: 'https://8.8.8.8/webhook',
        organizationId: 'org-1',
        payload: {
          event: 'target.failed',
          eventId: 'publish:target.failed:release-1:target-1:failed',
          timestamp: '2026-05-17T10:00:00.000Z',
        },
        secret: 'secret',
      },
      id: 'publish-webhook-rejected',
      opts: { attempts: 5 },
      updateProgress: vi.fn(),
    };

    await expect(processor.process(job as never)).resolves.toBeUndefined();

    const requestOptions = httpService.post.mock.calls[0]?.[2];
    expect(requestOptions.validateStatus(422)).toBe(true);
    expect(requestOptions.validateStatus(503)).toBe(false);
    expect(
      organizationSettingsService.recordWebhookDeliveryStatus,
    ).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        attempt: 1,
        deliveryId: 'publish-webhook-rejected',
        event: 'target.failed',
        status: 'rejected',
        statusCode: 422,
      }),
    );
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('webhook rejected by endpoint'),
      expect.objectContaining({
        jobId: 'publish-webhook-rejected',
        organizationId: 'org-1',
        statusCode: 422,
      }),
    );
  });

  it('rethrows delivery failures so BullMQ retries the webhook job', async () => {
    const error = new Error(
      'upstream 503 oauth_token=raw-oauth-token webhook_secret=raw-webhook-secret',
    );
    httpService.post.mockReturnValue(throwError(() => error));
    const job = {
      attemptsMade: 1,
      data: {
        endpoint: 'https://8.8.8.8/webhook',
        organizationId: 'org-1',
        payload: {
          event: 'target.failed',
          eventId: 'publish:target.failed:release-1:target-1:failed',
          timestamp: '2026-05-17T10:00:00.000Z',
        },
        secret: 'secret',
      },
      id: 'publish:target.failed:release-1:target-1:failed',
      opts: { attempts: 5 },
      updateProgress: vi.fn(),
    };

    await expect(processor.process(job as never)).rejects.toThrow(
      'upstream 503 oauth_token=[REDACTED] webhook_secret=[REDACTED]',
    );

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('webhook delivery failed'),
      expect.objectContaining({
        attempt: 2,
        event: 'target.failed',
        jobId: 'publish:target.failed:release-1:target-1:failed',
        maxAttempts: 5,
        organizationId: 'org-1',
      }),
    );
    expect(
      organizationSettingsService.recordWebhookDeliveryStatus,
    ).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        attempt: 2,
        deliveryId: 'publish:target.failed:release-1:target-1:failed',
        error: 'upstream 503 oauth_token=[REDACTED] webhook_secret=[REDACTED]',
        status: 'failed',
      }),
    );
    const diagnostics = JSON.stringify({
      logs: logger.error.mock.calls,
      statuses:
        organizationSettingsService.recordWebhookDeliveryStatus.mock.calls,
    });
    expect(diagnostics).not.toContain('raw-oauth-token');
    expect(diagnostics).not.toContain('raw-webhook-secret');
  });

  it('does not serialize arbitrary thrown objects into webhook diagnostics', async () => {
    httpService.post.mockReturnValue(
      throwError(() => ({ privatePayload: 'must-not-be-persisted' })),
    );
    const job = {
      attemptsMade: 0,
      data: {
        endpoint: 'https://8.8.8.8/webhook',
        organizationId: 'org-1',
        payload: {
          event: 'target.failed',
          timestamp: '2026-05-17T10:00:00.000Z',
        },
        secret: 'secret',
      },
      id: 'publish-webhook-object-error',
      opts: { attempts: 5 },
      updateProgress: vi.fn(),
    };

    await expect(processor.process(job as never)).rejects.toThrow(
      'Webhook delivery failed',
    );
    expect(
      organizationSettingsService.recordWebhookDeliveryStatus,
    ).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ error: 'Webhook delivery failed' }),
    );
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(
      'must-not-be-persisted',
    );
  });

  it('uses the bounded timeout and rethrows a sanitized timeout for retry', async () => {
    const error = Object.assign(
      new Error('timeout after 30000ms access_token=raw-access-token'),
      { code: 'ECONNABORTED' },
    );
    httpService.post.mockReturnValueOnce(throwError(() => error));
    const job = {
      attemptsMade: 0,
      data: {
        endpoint: 'https://8.8.8.8/webhook',
        organizationId: 'org-1',
        payload: {
          event: 'target.published',
          eventId: 'publish:target.published:release-1:target-1:published',
          timestamp: '2026-05-17T10:00:00.000Z',
        },
        secret: 'secret',
      },
      id: 'publish-webhook-timeout',
      opts: { attempts: 5 },
      updateProgress: vi.fn(),
    };

    await expect(processor.process(job as never)).rejects.toThrow(
      'timeout after 30000ms access_token=[REDACTED]',
    );

    expect(httpService.post).toHaveBeenCalledWith(
      'https://8.8.8.8/webhook',
      expect.any(Object),
      expect.objectContaining({
        timeout: 30000,
      }),
    );
    expect(
      organizationSettingsService.recordWebhookDeliveryStatus,
    ).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        attempt: 1,
        deliveryId: 'publish-webhook-timeout',
        error: 'timeout after 30000ms access_token=[REDACTED]',
        status: 'failed',
      }),
    );
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(
      'raw-access-token',
    );
  });

  it('redacts status persistence diagnostics', async () => {
    organizationSettingsService.recordWebhookDeliveryStatus.mockRejectedValueOnce(
      new Error('write failed session_token=raw-session-token'),
    );
    const job = {
      attemptsMade: 0,
      data: {
        endpoint: 'https://8.8.8.8/webhook',
        organizationId: 'org-1',
        payload: {
          event: 'target.published',
          timestamp: '2026-05-17T10:00:00.000Z',
        },
        secret: 'secret',
      },
      id: 'publish-webhook-status-log',
      opts: { attempts: 5 },
      updateProgress: vi.fn(),
    };

    await processor.process(job as never);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('failed to record status'),
      expect.objectContaining({
        deliveryId: 'publish-webhook-status-log',
        error: 'write failed session_token=[REDACTED]',
        organizationId: 'org-1',
      }),
    );
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(
      'raw-session-token',
    );
  });
});
