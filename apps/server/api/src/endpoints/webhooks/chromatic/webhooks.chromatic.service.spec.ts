import { ConfigService } from '@api/config/config.service';
import { ChromaticWebhookService } from '@api/endpoints/webhooks/chromatic/webhooks.chromatic.service';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('ChromaticWebhookService', () => {
  let service: ChromaticWebhookService;
  const notificationsService = {
    sendChromaticNotification: vi.fn(),
  };

  const configService = {
    get: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChromaticWebhookService,
        { provide: NotificationsService, useValue: notificationsService },
        { provide: ConfigService, useValue: configService },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
        },
      ],
    }).compile();

    service = module.get<ChromaticWebhookService>(ChromaticWebhookService);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateSignature', () => {
    it('should return true for valid signature', async () => {
      const payload = { build: { id: '123' }, event: 'build.completed' };
      const secret = 'test-secret';
      configService.get.mockReturnValue(secret);

      // Generate valid signature using SHA256 (matching service implementation)
      const crypto = await import('node:crypto');
      const payloadBuffer = Buffer.from(JSON.stringify(payload));
      const hmac = crypto.createHmac('sha256', secret);
      const signature = hmac.update(payloadBuffer).digest('hex');

      const result = service.validateSignature(payloadBuffer, signature);
      expect(result).toBe(true);
    });

    it('should return false for invalid signature', () => {
      const payload = { build: { id: '123' }, event: 'build.completed' };
      const payloadBuffer = Buffer.from(JSON.stringify(payload));
      configService.get.mockReturnValue('test-secret');

      const result = service.validateSignature(
        payloadBuffer,
        'invalid-signature',
      );
      expect(result).toBe(false);
    });

    it('should return true when secret not configured', () => {
      const payload = { build: { id: '123' }, event: 'build.completed' };
      const payloadBuffer = Buffer.from(JSON.stringify(payload));
      configService.get.mockReturnValue(undefined);

      const result = service.validateSignature(payloadBuffer, 'any-signature');
      expect(result).toBe(true);
    });
  });

  describe('handleWebhook', () => {
    it('should send passed build notification with green color', async () => {
      const payload = {
        branch: 'develop',
        build: {
          changeCount: 0,
          errorCount: 0,
          id: 'build-123',
          number: 42,
          status: 'PASSED',
          testCount: 25,
          webUrl: 'https://chromatic.com/build?id=123',
        },
        commit: {
          author: 'developer',
          message: 'Update components',
          sha: 'abc123def456',
        },
        event: 'build.completed',
        project: { name: 'test-project' },
      };

      await service.handleWebhook(payload);

      expect(
        notificationsService.sendChromaticNotification,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          embed: expect.objectContaining({
            color: 0x22c55e, // Green
            title: '✅ Chromatic Build PASSED',
            url: 'https://chromatic.com/build?id=123',
          }),
        }),
      );
    });

    it('should send failed build notification with red color', async () => {
      const payload = {
        branch: 'feature-branch',
        build: {
          changeCount: 5,
          errorCount: 3,
          id: 'build-456',
          number: 43,
          status: 'FAILED',
          testCount: 25,
          webUrl: 'https://chromatic.com/build?id=456',
        },
        commit: {
          author: 'developer',
          message: 'Breaking changes',
          sha: 'def456abc789',
        },
        event: 'build.completed',
        project: { name: 'test-project' },
      };

      await service.handleWebhook(payload);

      expect(
        notificationsService.sendChromaticNotification,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          embed: expect.objectContaining({
            color: 0xef4444, // Red
            title: '❌ Chromatic Build FAILED',
          }),
        }),
      );
    });

    it('should send approved build notification', async () => {
      const payload = {
        branch: 'develop',
        build: {
          changeCount: 2,
          id: 'build-789',
          number: 44,
          status: 'APPROVED',
          testCount: 25,
          webUrl: 'https://chromatic.com/build?id=789',
        },
        event: 'build.approved',
        project: { name: 'test-project' },
      };

      await service.handleWebhook(payload);

      expect(
        notificationsService.sendChromaticNotification,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          embed: expect.objectContaining({
            color: 0x10b981, // Green (approved)
            title: '✅ Chromatic Build APPROVED',
          }),
        }),
      );
    });

    it('should send pending build notification with blue color', async () => {
      const payload = {
        branch: 'develop',
        build: {
          id: 'build-999',
          number: 45,
          status: 'PENDING',
          webUrl: 'https://chromatic.com/build?id=999',
        },
        event: 'build.started',
        project: { name: 'test-project' },
      };

      await service.handleWebhook(payload);

      expect(
        notificationsService.sendChromaticNotification,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          embed: expect.objectContaining({
            color: 0x6366f1, // Blue
            title: expect.stringContaining('Chromatic Build PENDING'),
          }),
        }),
      );
    });

    it('should include commit information when available', async () => {
      const payload = {
        build: {
          number: 50,
          status: 'PASSED',
        },
        commit: {
          author: 'Jane Developer',
          message: 'Fix bug in component',
          sha: 'fullcommitsha123456789',
        },
        event: 'build.completed',
        project: { name: 'test-project' },
      };

      await service.handleWebhook(payload);

      expect(
        notificationsService.sendChromaticNotification,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          embed: expect.objectContaining({
            description: '**Commit:** Fix bug in component',
            fields: expect.arrayContaining([
              expect.objectContaining({
                name: 'Commit',
                value: '`fullcom`', // First 7 chars
              }),
              expect.objectContaining({
                name: 'Author',
                value: 'Jane Developer',
              }),
            ]),
          }),
        }),
      );
    });
  });
});
