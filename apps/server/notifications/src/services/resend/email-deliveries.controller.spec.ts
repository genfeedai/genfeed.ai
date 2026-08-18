import { LoggerService } from '@libs/logger/logger.service';
import {
  BadGatewayException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@notifications/config/config.service';
import { EmailDeliveriesController } from '@notifications/services/resend/email-deliveries.controller';
import {
  ResendEmailDeliveryError,
  ResendService,
} from '@notifications/services/resend/resend.service';

describe('EmailDeliveriesController', () => {
  let controller: EmailDeliveriesController;
  let resendService: { sendEmail: ReturnType<typeof vi.fn> };

  const payload = {
    html: '<p>Sign in</p>',
    idempotencyKey: 'auth/magic-link/link_123',
    subject: 'Your sign-in link',
    to: 'user@example.com',
  };

  beforeEach(async () => {
    resendService = { sendEmail: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmailDeliveriesController],
      providers: [
        {
          provide: ConfigService,
          useValue: { get: vi.fn(), isDevelopment: false },
        },
        {
          provide: LoggerService,
          useValue: { warn: vi.fn() },
        },
        { provide: ResendService, useValue: resendService },
      ],
    }).compile();

    controller = module.get<EmailDeliveriesController>(
      EmailDeliveriesController,
    );
  });

  it('returns the provider id after Resend accepts the message', async () => {
    resendService.sendEmail.mockResolvedValue('email_123');

    await expect(controller.deliver(payload)).resolves.toEqual({
      emailId: 'email_123',
    });
    expect(resendService.sendEmail).toHaveBeenCalledWith(payload);
  });

  it('reports unavailable when Resend is not configured', async () => {
    resendService.sendEmail.mockResolvedValue(null);

    await expect(controller.deliver(payload)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('maps retryable provider failures to service unavailable', async () => {
    resendService.sendEmail.mockRejectedValue(
      new ResendEmailDeliveryError('rate limited', {
        providerCode: 'rate_limit_exceeded',
        retryable: true,
        statusCode: 429,
      }),
    );

    await expect(controller.deliver(payload)).rejects.toMatchObject({
      message: 'Email delivery is temporarily unavailable',
      status: 503,
    });
  });

  it('maps permanent provider rejection to a safe bad gateway response', async () => {
    resendService.sendEmail.mockRejectedValue(
      new ResendEmailDeliveryError('unverified sender detail', {
        providerCode: 'validation_error',
        retryable: false,
        statusCode: 403,
      }),
    );

    const delivery = controller.deliver(payload);

    await expect(delivery).rejects.toBeInstanceOf(BadGatewayException);
    await expect(delivery).rejects.toMatchObject({
      message: 'Email provider rejected delivery',
      status: 502,
    });
  });
});
