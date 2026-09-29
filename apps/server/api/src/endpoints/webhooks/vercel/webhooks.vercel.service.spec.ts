import { VercelWebhookService } from '@api/endpoints/webhooks/vercel/webhooks.vercel.service';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('VercelWebhookService', () => {
  let service: VercelWebhookService;
  const notificationsService = {
    dispatch: vi.fn(),
  };

  const configService = {
    get: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VercelWebhookService,
        { provide: ActivityRecorderService, useValue: notificationsService },
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

      expect(notificationsService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            {
              destination: null,
              message: {
                action: 'vercel_notification',
                payload: {
                  embed: expect.objectContaining({
                    title: '✅ Deployment ready',
                  }),
                },
                type: 'discord',
              },
            },
          ],
          organizationId: null,
          topic: 'operator.alerts',
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

      expect(notificationsService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            {
              destination: null,
              message: {
                action: 'vercel_notification',
                payload: {
                  embed: expect.objectContaining({
                    title: '❌ Deployment failed',
                  }),
                },
                type: 'discord',
              },
            },
          ],
          organizationId: null,
          topic: 'operator.alerts',
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

      expect(notificationsService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            {
              destination: null,
              message: {
                action: 'vercel_notification',
                payload: {
                  embed: expect.objectContaining({
                    title: '🛑 Deployment canceled',
                  }),
                },
                type: 'discord',
              },
            },
          ],
          organizationId: null,
          topic: 'operator.alerts',
        }),
      );
    });

    it('keys delivery on the Vercel event id so a retried event sends once', async () => {
      await service.handleWebhook({
        id: 'evt_1',
        payload: { project: { name: 'test-project' } },
        type: 'deployment.canceled',
      });

      expect(notificationsService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ deduplicationKey: 'message.vercel/evt_1' }),
      );
    });

    it('never collapses distinct cancels of one project without an event id', async () => {
      const cancel = {
        payload: { project: { name: 'test-project' } },
        type: 'deployment.canceled',
      };
      const now = vi.spyOn(Date, 'now');
      now.mockReturnValueOnce(1).mockReturnValueOnce(2);

      await service.handleWebhook(cancel);
      await service.handleWebhook(cancel);

      const keys = notificationsService.dispatch.mock.calls.map(
        ([input]) => input.deduplicationKey,
      );
      expect(new Set(keys).size).toBe(2);
      now.mockRestore();
    });
  });
});
