import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@notifications/config/config.service';
import { ResendService } from '@notifications/services/resend/resend.service';
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
      if (key === 'RESEND_FROM_EMAIL') return 'Genfeed <updates@genfeed.ai>';
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
        from: 'Genfeed <updates@genfeed.ai>',
        subject: 'Subject',
        to: 'test@example.com',
      }),
      { idempotencyKey: 'crm/contacted/lead_1' },
    );
  });
});
