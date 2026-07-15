import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@notifications/config/config.service';
import {
  ResendEmailDeliveryError,
  ResendService,
} from '@notifications/services/resend/resend.service';
import { Resend } from 'resend';

const mockSend = vi.fn();

vi.mock('resend', () => {
  return {
    Resend: vi.fn(function MockResend() {
      return {
        emails: { send: mockSend },
      };
    }),
  };
});

describe('ResendService', () => {
  let service: ResendService;
  let configMock: {
    get: ReturnType<typeof vi.fn>;
    isDevelopment: boolean;
    isResendEnabled: ReturnType<typeof vi.fn>;
  };
  let loggerMock: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    configMock = {
      get: vi.fn(),
      isDevelopment: false,
      isResendEnabled: vi.fn().mockReturnValue(true),
    };

    loggerMock = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResendService,
        { provide: ConfigService, useValue: configMock },
        { provide: LoggerService, useValue: loggerMock },
      ],
    }).compile();

    service = module.get<ResendService>(ResendService);
    mockSend.mockReset();
    vi.mocked(Resend).mockClear();
  });

  it('skips when Resend is not configured', async () => {
    configMock.isResendEnabled.mockReturnValue(false);

    await expect(
      service.sendEmail({
        html: '<p>hello</p>',
        subject: 'Subject',
        to: 'test@example.com',
      }),
    ).resolves.toBeNull();

    expect(loggerMock.warn).toHaveBeenCalledWith(
      'ResendService sendEmail skipped - Resend not configured',
    );
  });

  it('logs and skips in development', async () => {
    configMock.isDevelopment = true;

    await expect(
      service.sendEmail({
        html: '<p>hello</p>',
        subject: 'Subject',
        to: 'test@example.com',
      }),
    ).resolves.toBeNull();

    expect(loggerMock.log).toHaveBeenCalledWith(
      'ResendService sendEmail skipped',
      expect.objectContaining({
        subject: 'Subject',
        to: 'test@example.com',
      }),
    );
  });

  it('sends successfully', async () => {
    configMock.get.mockImplementation((key: string) => {
      if (key === 'RESEND_API_KEY') return 're_test';
      if (key === 'RESEND_FROM_EMAIL') return 'Genfeed <no-reply@genfeed.ai>';
      return '';
    });
    mockSend.mockResolvedValue({
      data: { id: 'email_123' },
      error: null,
    });

    await expect(
      service.sendEmail({
        html: '<p>hello</p>',
        idempotencyKey: 'crm/contacted/lead_1',
        subject: 'Subject',
        to: 'test@example.com',
      }),
    ).resolves.toBe('email_123');

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'Genfeed <no-reply@genfeed.ai>',
        subject: 'Subject',
        to: 'test@example.com',
      }),
      { idempotencyKey: 'crm/contacted/lead_1' },
    );
  });

  it('surfaces transient Resend failures as retryable delivery errors', async () => {
    mockSend.mockResolvedValue({
      data: null,
      error: {
        message: 'Too many requests',
        name: 'rate_limit_exceeded',
        statusCode: 429,
      },
    });

    const delivery = service.sendEmail({
      html: '<p>hello</p>',
      subject: 'Subject',
      to: 'test@example.com',
    });

    await expect(delivery).rejects.toMatchObject({
      message: 'Too many requests',
      name: ResendEmailDeliveryError.name,
      providerCode: 'rate_limit_exceeded',
      retryable: true,
      statusCode: 429,
    });
    expect(loggerMock.error).toHaveBeenCalledWith(
      'ResendService sendEmail failed',
      expect.any(ResendEmailDeliveryError),
      expect.objectContaining({
        providerCode: 'rate_limit_exceeded',
        retryable: true,
        statusCode: 429,
      }),
    );
  });

  it('treats SDK-normalized network failures as retryable', async () => {
    mockSend.mockResolvedValue({
      data: null,
      error: {
        message: 'Unable to fetch data',
        name: 'application_error',
        statusCode: null,
      },
    });

    await expect(
      service.sendEmail({
        html: '<p>hello</p>',
        subject: 'Subject',
        to: 'test@example.com',
      }),
    ).rejects.toMatchObject({
      providerCode: 'application_error',
      retryable: true,
      statusCode: null,
    });
  });

  it('retries concurrent requests that reuse an in-flight idempotency key', async () => {
    mockSend.mockResolvedValue({
      data: null,
      error: {
        message: 'The original request is still in progress',
        name: 'concurrent_idempotent_requests',
        statusCode: 409,
      },
    });

    await expect(
      service.sendEmail({
        html: '<p>hello</p>',
        idempotencyKey: 'workflow-status/workflow_1/completed',
        subject: 'Subject',
        to: 'test@example.com',
      }),
    ).rejects.toMatchObject({
      providerCode: 'concurrent_idempotent_requests',
      retryable: true,
      statusCode: 409,
    });
  });

  it('surfaces permanent Resend failures without marking them retryable', async () => {
    mockSend.mockResolvedValue({
      data: null,
      error: {
        message: 'Invalid recipient',
        name: 'validation_error',
        statusCode: 422,
      },
    });

    await expect(
      service.sendEmail({
        html: '<p>hello</p>',
        subject: 'Subject',
        to: 'invalid',
      }),
    ).rejects.toMatchObject({
      message: 'Invalid recipient',
      providerCode: 'validation_error',
      retryable: false,
      statusCode: 422,
    });
  });

  it('does not retry quota failures that cannot recover within the retry window', async () => {
    mockSend.mockResolvedValue({
      data: null,
      error: {
        message: 'Monthly quota exceeded',
        name: 'monthly_quota_exceeded',
        statusCode: 429,
      },
    });

    await expect(
      service.sendEmail({
        html: '<p>hello</p>',
        subject: 'Subject',
        to: 'test@example.com',
      }),
    ).rejects.toMatchObject({
      providerCode: 'monthly_quota_exceeded',
      retryable: false,
      statusCode: 429,
    });
  });

  it('surfaces thrown transport failures as retryable delivery errors', async () => {
    mockSend.mockRejectedValue(new Error('socket closed'));

    await expect(
      service.sendEmail({
        html: '<p>hello</p>',
        subject: 'Subject',
        to: 'test@example.com',
      }),
    ).rejects.toMatchObject({
      message: 'socket closed',
      providerCode: null,
      retryable: true,
      statusCode: null,
    });
  });
});
