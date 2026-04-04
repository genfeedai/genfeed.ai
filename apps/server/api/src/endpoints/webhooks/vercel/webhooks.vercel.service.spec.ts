import { ConfigService } from '@api/config/config.service';
import { VercelWebhookService } from '@api/endpoints/webhooks/vercel/webhooks.vercel.service';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('VercelWebhookService', () => {
  let service: VercelWebhookService;
  const notificationsService = {
    sendDiscordCard: vi.fn(),
    sendVercelNotification: vi.fn(),
  };

  const configService = {
    get: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VercelWebhookService,
        { provide: NotificationsService, useValue: notificationsService },
        { provide: ConfigService, useValue: configService },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
        },
      ],
    }).compile();

    service = module.get<VercelWebhookService>(VercelWebhookService);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateSignature', () => {
    it('should return true for valid signature', () => {
      const payload = { type: 'deployment.ready' };
      const secret = 'test-secret';
      configService.get.mockReturnValue(secret);

      // Generate valid signature using SHA1 (matching service implementation)
      const crypto = require('node:crypto');
      const payloadBuffer = Buffer.from(JSON.stringify(payload));
      const hmac = crypto.createHmac('sha1', secret);
      const signature = hmac.update(payloadBuffer).digest('hex');

      const result = service.validateSignature(payloadBuffer, signature);
      expect(result).toBe(true);
    });

    it('should return false for invalid signature', () => {
      const payload = { type: 'deployment.ready' };
      const payloadBuffer = Buffer.from(JSON.stringify(payload));
      configService.get.mockReturnValue('test-secret');

      const result = service.validateSignature(
        payloadBuffer,
        'invalid-signature',
      );
      expect(result).toBe(false);
    });

    it('should return true when secret not configured', () => {
      const payload = { type: 'deployment.ready' };
      const payloadBuffer = Buffer.from(JSON.stringify(payload));
      configService.get.mockReturnValue(undefined);

      const result = service.validateSignature(payloadBuffer, 'any-signature');
      expect(result).toBe(true);
    });
  });

  describe('handleWebhook', () => {
    it('should send success deployment to vercel webhook', async () => {
      const payload = {
        payload: {
          creator: { username: 'tester' },
          deployment: {
            meta: { githubCommitMessage: 'test', githubCommitSha: 'abcdef1' },
            target: 'preview',
            url: 'test.example.com',
          },
          project: { name: 'test-project' },
        },
        type: 'deployment.ready',
      };

      await service.handleWebhook(payload);

      expect(notificationsService.sendVercelNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          embed: expect.objectContaining({
            title: '✅ Deployment ready',
          }),
        }),
      );
    });

    it('should send failed deployment to vercel webhook', async () => {
      const payload = {
        payload: {
          creator: { username: 'tester' },
          deployment: {
            target: 'preview',
            url: 'test.example.com',
          },
          project: { name: 'test-project' },
        },
        type: 'deployment.error',
      };

      await service.handleWebhook(payload);

      expect(notificationsService.sendVercelNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          embed: expect.objectContaining({
            title: '❌ Deployment failed',
          }),
        }),
      );
    });

    it('should send canceled deployment to vercel webhook', async () => {
      const payload = {
        payload: {
          creator: { username: 'tester' },
          project: { name: 'test-project' },
        },
        type: 'deployment.canceled',
      };

      await service.handleWebhook(payload);

      expect(notificationsService.sendVercelNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          embed: expect.any(Object),
        }),
      );
    });
  });
});
