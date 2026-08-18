import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@workers/config/config.service';
import type { QueueHealthNotification } from '@workers/monitoring/queue-health.types';
import { QueueHealthAlertNotifierService } from '@workers/monitoring/queue-health-alert-notifier.service';

describe('QueueHealthAlertNotifierService', () => {
  let service: QueueHealthAlertNotifierService;
  const mockLogger = {
    log: vi.fn(),
    warn: vi.fn(),
  };
  const mockConfig: { queueHealthAlertWebhookUrl: string | undefined } = {
    queueHealthAlertWebhookUrl: undefined,
  };
  const notification: QueueHealthNotification = {
    breaches: [{ actual: 101, kind: 'waiting', threshold: 100 }],
    incidentStartedAt: '2026-08-12T00:00:00.000Z',
    kind: 'breach',
    snapshot: {
      active: 2,
      capturedAt: '2026-08-12T00:05:00.000Z',
      delayed: 3,
      failed: 4,
      oldestWaitingAgeSeconds: 60,
      queueName: 'default',
      stalledEvents: 0,
      stalledJobIds: [],
      waiting: 101,
    },
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    mockConfig.queueHealthAlertWebhookUrl = undefined;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueueHealthAlertNotifierService,
        { provide: ConfigService, useValue: mockConfig },
        { provide: LoggerService, useValue: mockLogger },
      ],
    }).compile();

    service = module.get(QueueHealthAlertNotifierService);
  });

  it('emits a structured warning without requiring a webhook', async () => {
    await service.notify(notification);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      'BullMQ queue health threshold breached',
      expect.objectContaining({
        notificationKind: 'breach',
        snapshot: notification.snapshot,
      }),
    );
  });

  it('posts a Slack-compatible metadata-only message', async () => {
    mockConfig.queueHealthAlertWebhookUrl = 'https://hooks.example.com/queue';
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    await service.notify(notification);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = fetchMock.mock.calls[0]?.[1];
    const body =
      request && typeof request === 'object' && 'body' in request
        ? request.body
        : undefined;
    expect(typeof body).toBe('string');
    const payload = JSON.parse(String(body));
    expect(Object.keys(payload)).toEqual(['text']);
    expect(payload.text).toContain('default');
    expect(payload.text).toContain('waiting=101');
    expect(payload.text).toContain('stalledEvents=0');
    expect(payload.text).not.toContain('payload');
    expect(payload.text).not.toContain('credential');
  });

  it('throws a redacted transport error without reading the response body', async () => {
    mockConfig.queueHealthAlertWebhookUrl = 'https://hooks.example.com/queue';
    const response = {
      json: vi.fn(),
      ok: false,
      status: 503,
      text: vi.fn(),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    await expect(service.notify(notification)).rejects.toThrow('HTTP 503');
    expect(response.json).not.toHaveBeenCalled();
    expect(response.text).not.toHaveBeenCalled();
  });

  it('redacts a webhook URL from network failures', async () => {
    const secretUrl = 'https://hooks.example.com/secret-token';
    mockConfig.queueHealthAlertWebhookUrl = secretUrl;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error(`request to ${secretUrl} failed`)),
    );

    let errorMessage = '';
    try {
      await service.notify(notification);
    } catch (error: unknown) {
      errorMessage = error instanceof Error ? error.message : String(error);
    }

    expect(errorMessage).toBe('Queue health alert webhook request failed');
    expect(errorMessage).not.toContain(secretUrl);
  });
});
