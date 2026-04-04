import { ConfigService } from '@api/config/config.service';
import { ClerkWebhookController } from '@api/endpoints/webhooks/clerk/webhooks.clerk.controller';
import { ClerkWebhookService } from '@api/endpoints/webhooks/clerk/webhooks.clerk.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

vi.mock('svix', () => ({
  Webhook: vi.fn().mockImplementation(function () {
    return { verify: vi.fn() };
  }),
}));

vi.mock('@libs/utils/caller/caller.util', () => ({
  CallerUtil: {
    getCallerName: vi.fn().mockReturnValue('createClerk'),
  },
}));

describe('ClerkWebhookController', () => {
  let controller: ClerkWebhookController;
  let clerkWebhookService: vi.Mocked<ClerkWebhookService>;
  let loggerService: vi.Mocked<LoggerService>;

  beforeEach(async () => {
    (CallerUtil.getCallerName as vi.Mock).mockReturnValue('createClerk');

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClerkWebhookController],
      providers: [
        {
          provide: ClerkWebhookService,
          useValue: {
            handleWebhookEvent: vi.fn(),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            error: vi.fn(),
            log: vi.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn().mockReturnValue('test-webhook-secret'),
          },
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ClerkWebhookController>(ClerkWebhookController);
    clerkWebhookService = module.get(ClerkWebhookService);
    loggerService = module.get(LoggerService);
    module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('handleClerk', () => {
    const mockRequest = (headers: Record<string, string>) =>
      ({
        headers,
      }) as Request;

    const validHeaders = {
      'svix-id': 'test-id',
      'svix-signature': 'test-signature',
      'svix-timestamp': '1234567890',
    };

    it('should handle webhook successfully with valid headers', async () => {
      const payload = {
        data: { id: 'user_123' },
        object: 'user',
        type: 'user.created',
      };
      const request = mockRequest(validHeaders);
      const mockEvent = { data: { id: 'user_123' }, type: 'user.created' };

      const svix = await import('svix');
      const Webhook = svix.Webhook as vi.Mock;
      const mockVerify = vi.fn().mockReturnValue(mockEvent);
      Webhook.mockImplementation(function () {
        return { verify: mockVerify };
      });

      clerkWebhookService.handleWebhookEvent.mockResolvedValue(undefined);

      const result = await controller.handleClerk(request, payload);

      expect(loggerService.log).toHaveBeenCalledWith(
        'ClerkWebhookController createClerk received',
        payload,
      );
      expect(mockVerify).toHaveBeenCalledWith(
        JSON.stringify(payload),
        validHeaders,
      );
      expect(clerkWebhookService.handleWebhookEvent).toHaveBeenCalledWith(
        mockEvent,
        'ClerkWebhookController createClerk',
      );
      expect(result).toEqual({
        message: 'Webhook processed successfully',
        success: true,
      });
    });

    it('should return error response when svix headers are missing', async () => {
      const payload = { data: {}, object: 'user', type: 'user.created' };
      const request = mockRequest({ 'content-type': 'application/json' });

      const result = await controller.handleClerk(request, payload);

      expect(result).toBeInstanceOf(Response);
      expect((result as Response).status).toBe(400);
    });

    it('should throw when webhook verification fails', async () => {
      const payload = { data: {}, object: 'user', type: 'user.created' };
      const request = mockRequest(validHeaders);
      const verificationError = new Error('Invalid signature');

      const svix = await import('svix');
      const Webhook = svix.Webhook as vi.Mock;
      const mockVerify = vi.fn().mockImplementation(() => {
        throw verificationError;
      });
      Webhook.mockImplementation(function () {
        return { verify: mockVerify };
      });

      await expect(controller.handleClerk(request, payload)).rejects.toThrow(
        verificationError,
      );

      expect(loggerService.error).toHaveBeenCalledWith(
        'ClerkWebhookController createClerk failed',
        verificationError,
      );
    });

    it('should propagate errors from webhook service', async () => {
      const payload = { data: {}, object: 'user', type: 'user.deleted' };
      const request = mockRequest(validHeaders);
      const mockEvent = { data: { id: 'user_456' }, type: 'user.deleted' };
      const serviceError = new Error('Service processing failed');

      const svix = await import('svix');
      const Webhook = svix.Webhook as vi.Mock;
      const mockVerify = vi.fn().mockReturnValue(mockEvent);
      Webhook.mockImplementation(function () {
        return { verify: mockVerify };
      });

      clerkWebhookService.handleWebhookEvent.mockRejectedValue(serviceError);

      await expect(controller.handleClerk(request, payload)).rejects.toThrow(
        serviceError,
      );

      expect(loggerService.error).toHaveBeenCalledWith(
        'ClerkWebhookController createClerk failed',
        serviceError,
      );
    });
  });
});
