import { WebhookClientService } from '@api/services/webhook-client/webhook-client.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('WebhookClientService', () => {
  let queue: { add: ReturnType<typeof vi.fn> };
  let logger: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
  let organizationSettingsService: { findOne: ReturnType<typeof vi.fn> };
  let service: WebhookClientService;

  beforeEach(() => {
    queue = {
      add: vi.fn().mockResolvedValue({ id: 'job-1' }),
    };
    logger = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };
    organizationSettingsService = {
      findOne: vi.fn().mockResolvedValue({
        isWebhookEnabled: true,
        webhookEndpoint: 'https://8.8.8.8/webhook',
        webhookSecret: 'secret',
      }),
    };
    service = new WebhookClientService(
      queue as never,
      logger as never,
      organizationSettingsService as never,
    );
  });

  it('preserves reserved event and timestamp fields for generic webhook data', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-17T10:00:00.000Z'));

    await service.sendWebhook('org-1', 'custom.event', {
      event: 'overridden',
      timestamp: 123,
      value: true,
    });

    expect(queue.add).toHaveBeenCalledWith(
      'send-webhook',
      expect.objectContaining({
        payload: {
          event: 'custom.event',
          timestamp: '2026-05-17T10:00:00.000Z',
          value: true,
        },
      }),
      expect.any(Object),
    );

    vi.useRealTimers();
  });

  it('does not queue webhooks for localhost endpoints', async () => {
    organizationSettingsService.findOne.mockResolvedValue({
      isWebhookEnabled: true,
      webhookEndpoint: 'http://localhost/webhook',
      webhookSecret: 'secret',
    });

    await service.sendWebhook('org-1', 'custom.event', {});

    expect(queue.add).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('failed to queue webhook'),
      expect.objectContaining({
        event: 'custom.event',
        organizationId: 'org-1',
      }),
    );
  });
});
