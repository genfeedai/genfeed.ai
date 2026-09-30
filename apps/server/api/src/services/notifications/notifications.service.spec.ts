import {
  ChannelDeliveryError,
  EmailDeliveryError,
  NotificationsService,
} from '@api/services/notifications/notifications.service';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

const { mockSafeFetch } = vi.hoisted(() => ({
  mockSafeFetch: vi.fn(),
}));

vi.mock('@libs/security/destination-guard', () => ({
  safeFetch: mockSafeFetch,
}));

describe('NotificationsService', () => {
  let service: NotificationsService;
  let configService: { get: ReturnType<typeof vi.fn> };
  let loggerService: vi.Mocked<LoggerService>;

  beforeEach(async () => {
    configService = {
      get: vi.fn().mockImplementation((key: string) => {
        const config: Record<string, string> = {
          GENFEEDAI_API_KEY: 'internal-api-key',
          GENFEEDAI_MICROSERVICES_NOTIFICATIONS_URL:
            'http://notifications:3011',
        };
        return config[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: ConfigService,
          useValue: configService,
        },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    module.get<ConfigService>(ConfigService);
    loggerService = module.get<LoggerService>(
      LoggerService,
    ) as vi.Mocked<LoggerService>;

    vi.clearAllMocks();
  });

  it('sends system notifications only to this deployment notifications service with acknowledgement', async () => {
    const event = {
      version: 1 as const,
      id: 'user.created/u1',
      type: 'user.created' as const,
      occurredAt: new Date().toISOString(),
      data: { objectId: 'u1' },
    };
    mockSafeFetch.mockResolvedValue(
      new Response(JSON.stringify({ delivered: true }), { status: 200 }),
    );
    await service.deliverSystemNotification(event);
    expect(mockSafeFetch).toHaveBeenCalledWith(
      new URL('http://notifications:3011/v1/internal/system-notifications'),
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer internal-api-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      }),
      expect.objectContaining({
        maxRedirects: 0,
        allowedOrigins: ['http://notifications:3011'],
      }),
    );
    mockSafeFetch.mockResolvedValue(new Response('{}', { status: 200 }));
    await expect(service.deliverSystemNotification(event)).rejects.toThrow(
      'not acknowledged',
    );
  });

  describe('deliverChannelMessage', () => {
    const request = {
      destination: null,
      idempotencyKey: 'revenue/in_1/discord/operator',
      message: {
        action: 'low_credits_alert',
        payload: { balance: 5, organizationId: 'org-1' },
        type: 'discord' as const,
      },
    };

    it('posts the rendered message and returns the acknowledged outcome', async () => {
      mockSafeFetch.mockResolvedValue(
        new Response(
          JSON.stringify({ messageId: 'message-1', status: 'delivered' }),
          { headers: { 'Content-Type': 'application/json' }, status: 200 },
        ),
      );

      await expect(service.deliverChannelMessage(request)).resolves.toEqual({
        messageId: 'message-1',
        status: 'delivered',
      });
      expect(mockSafeFetch).toHaveBeenCalledWith(
        new URL('http://notifications:3011/v1/internal/channel-deliveries'),
        expect.objectContaining({
          body: JSON.stringify(request),
          method: 'POST',
        }),
        {
          allowedOrigins: ['http://notifications:3011'],
          allowPrivateNetwork: true,
        },
      );
    });

    it('returns a skip outcome from an unconfigured channel', async () => {
      mockSafeFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            reason: 'channel_not_configured',
            status: 'skipped',
          }),
          { status: 200 },
        ),
      );

      await expect(service.deliverChannelMessage(request)).resolves.toEqual({
        reason: 'channel_not_configured',
        status: 'skipped',
      });
    });

    it('classifies permanent and transient failures', async () => {
      mockSafeFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'Invalid', retryable: false }), {
          status: 422,
        }),
      );
      await expect(service.deliverChannelMessage(request)).rejects.toEqual(
        expect.objectContaining<Partial<ChannelDeliveryError>>({
          retryable: false,
          statusCode: 422,
        }),
      );

      mockSafeFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'bogus' }), { status: 503 }),
      );
      await expect(service.deliverChannelMessage(request)).rejects.toEqual(
        expect.objectContaining<Partial<ChannelDeliveryError>>({
          retryable: true,
          statusCode: 503,
        }),
      );
    });
  });

  describe('deliverEmail', () => {
    const payload = {
      html: '<p>Test content</p>',
      idempotencyKey: 'auth/magic-link/link_123',
      subject: 'Test Subject',
      to: 'test@example.com',
    };

    it('waits for the notifications service to accept the email', async () => {
      mockSafeFetch.mockResolvedValue(
        new Response(JSON.stringify({ emailId: 'email_123' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        }),
      );

      await expect(service.deliverEmail(payload)).resolves.toBe('email_123');

      expect(mockSafeFetch).toHaveBeenCalledWith(
        new URL('http://notifications:3011/v1/internal/email-deliveries'),
        expect.objectContaining({
          body: JSON.stringify(payload),
          headers: {
            Authorization: 'Bearer internal-api-key',
            'Content-Type': 'application/json',
          },
          method: 'POST',
          signal: expect.any(AbortSignal),
        }),
        {
          allowedOrigins: ['http://notifications:3011'],
          allowPrivateNetwork: true,
        },
      );
    });

    it('classifies a notifications gateway 502 as retryable', async () => {
      mockSafeFetch.mockResolvedValue(
        new Response(
          JSON.stringify({ message: 'Provider rejected delivery' }),
          { status: 502 },
        ),
      );

      await expect(service.deliverEmail(payload)).rejects.toEqual(
        expect.objectContaining<Partial<EmailDeliveryError>>({
          cause: expect.objectContaining({
            message: 'Notifications service returned HTTP 502',
          }),
          message: 'Email delivery failed (status 502)',
          retryable: true,
          statusCode: 502,
        }),
      );
      expect(loggerService.error).toHaveBeenCalledWith(
        'NotificationsService synchronous email delivery failed',
        expect.objectContaining({ message: expect.any(String) }),
        { statusCode: 502 },
      );
    });

    it('preserves an explicit permanent provider rejection', async () => {
      mockSafeFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            message: 'Email provider rejected delivery',
            retryable: false,
          }),
          {
            headers: { 'Content-Type': 'application/json' },
            status: 422,
          },
        ),
      );

      await expect(service.deliverEmail(payload)).rejects.toEqual(
        expect.objectContaining<Partial<EmailDeliveryError>>({
          retryable: false,
          statusCode: 422,
        }),
      );
    });

    it('treats internal authentication failures as retryable infrastructure errors', async () => {
      mockSafeFetch.mockResolvedValue(
        new Response(JSON.stringify({ message: 'Unauthorized' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 401,
        }),
      );

      await expect(service.deliverEmail(payload)).rejects.toEqual(
        expect.objectContaining<Partial<EmailDeliveryError>>({
          retryable: true,
          statusCode: 401,
        }),
      );
    });

    it('rejects a malformed success response', async () => {
      mockSafeFetch.mockResolvedValue(
        new Response(JSON.stringify({ emailId: '' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        }),
      );

      await expect(service.deliverEmail(payload)).rejects.toThrow(
        'Email delivery failed',
      );
    });

    it('fails closed when internal delivery configuration is missing', async () => {
      configService.get.mockImplementation((key: string) =>
        key === 'REDIS_URL' ? 'redis://localhost:6379' : undefined,
      );

      await expect(service.deliverEmail(payload)).rejects.toThrow(
        'Email delivery failed',
      );
      expect(mockSafeFetch).not.toHaveBeenCalled();
    });

    it('converts transport and timeout failures to a safe error', async () => {
      mockSafeFetch.mockRejectedValue(new Error('socket exposed detail'));

      await expect(service.deliverEmail(payload)).rejects.toThrow(
        'Email delivery failed',
      );
      expect(loggerService.error).toHaveBeenCalledWith(
        'NotificationsService synchronous email delivery failed',
        expect.objectContaining({
          message: 'Synchronous email provider request failed',
        }),
        undefined,
      );
    });
  });
  describe('isEmailDeliveryConfigured', () => {
    const statusResponse = (isConfigured: boolean) =>
      new Response(JSON.stringify({ isConfigured }), { status: 200 });

    it('reads the provider status from the notifications service', async () => {
      mockSafeFetch.mockResolvedValue(statusResponse(true));

      await expect(service.isEmailDeliveryConfigured()).resolves.toBe(true);
      expect(mockSafeFetch).toHaveBeenCalledWith(
        new URL('http://notifications:3011/v1/internal/email-deliveries'),
        expect.objectContaining({
          headers: { Authorization: 'Bearer internal-api-key' },
          method: 'GET',
        }),
        expect.objectContaining({
          allowedOrigins: ['http://notifications:3011'],
        }),
      );
    });

    it('reports no provider when the service says none is configured', async () => {
      mockSafeFetch.mockResolvedValue(statusResponse(false));

      await expect(service.isEmailDeliveryConfigured()).resolves.toBe(false);
    });

    it('caches the answer between calls', async () => {
      mockSafeFetch.mockResolvedValue(statusResponse(true));

      await service.isEmailDeliveryConfigured();
      await service.isEmailDeliveryConfigured();

      expect(mockSafeFetch).toHaveBeenCalledTimes(1);
    });

    it('has no mailer when there is no notifications service to ask', async () => {
      configService.get.mockReturnValue(undefined);

      await expect(service.isEmailDeliveryConfigured()).resolves.toBe(false);
      expect(mockSafeFetch).not.toHaveBeenCalled();
    });

    it('assumes a mailer exists when the status was never readable', async () => {
      mockSafeFetch.mockRejectedValue(new Error('connection refused'));

      await expect(service.isEmailDeliveryConfigured()).resolves.toBe(true);
      expect(loggerService.warn).toHaveBeenCalled();
    });

    it('keeps the last known answer through an outage', async () => {
      vi.useFakeTimers();
      try {
        mockSafeFetch.mockResolvedValueOnce(statusResponse(false));
        await expect(service.isEmailDeliveryConfigured()).resolves.toBe(false);

        vi.advanceTimersByTime(61_000);
        mockSafeFetch.mockRejectedValueOnce(new Error('connection refused'));
        await expect(service.isEmailDeliveryConfigured()).resolves.toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });

    it('treats a non-OK or malformed response as unreadable', async () => {
      mockSafeFetch.mockResolvedValueOnce(new Response('{}', { status: 404 }));
      await expect(service.isEmailDeliveryConfigured()).resolves.toBe(true);
    });
  });
});
