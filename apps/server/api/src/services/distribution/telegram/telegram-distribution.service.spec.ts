import { TelegramDistributionService } from '@api/services/distribution/telegram/telegram-distribution.service';
import {
  DistributionContentType,
  DistributionPlatform,
  PublishStatus,
} from '@genfeedai/enums';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function createMocks() {
  const distributionDoc = {
    _id: new Types.ObjectId(),
    brand: new Types.ObjectId(),
    caption: undefined,
    chatId: '-1001234567890',
    contentType: DistributionContentType.TEXT,
    isDeleted: false,
    mediaUrl: undefined,
    organization: new Types.ObjectId(),
    platform: DistributionPlatform.TELEGRAM,
    status: PublishStatus.PUBLISHING,
    text: 'Hello from Genfeed',
    user: new Types.ObjectId(),
  };

  const configService = {
    get: vi.fn().mockReturnValue('test-bot-token'),
  };

  const credentialsService = {
    findOne: vi.fn().mockResolvedValue(null),
  };

  const distributionsService = {
    createDistribution: vi.fn().mockResolvedValue(distributionDoc),
    findOne: vi.fn().mockResolvedValue(distributionDoc),
    markAsFailed: vi.fn().mockResolvedValue(distributionDoc),
    markAsPublished: vi.fn().mockResolvedValue(distributionDoc),
    patch: vi.fn().mockResolvedValue(distributionDoc),
  };

  const httpService = {
    post: vi.fn().mockReturnValue(
      of({
        data: {
          ok: true,
          result: { message_id: 42 },
        },
      }),
    ),
  };

  const loggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const queueService = {
    add: vi.fn().mockResolvedValue({ id: 'job-1' }),
  };

  return {
    configService,
    credentialsService,
    distributionDoc,
    distributionsService,
    httpService,
    loggerService,
    queueService,
  };
}

describe('TelegramDistributionService', () => {
  let service: TelegramDistributionService;
  let mocks: ReturnType<typeof createMocks>;

  beforeEach(() => {
    mocks = createMocks();
    service = new TelegramDistributionService(
      mocks.configService as never,
      mocks.credentialsService as never,
      mocks.distributionsService as never,
      mocks.queueService as never,
      mocks.httpService as never,
      mocks.loggerService as never,
    );
  });

  describe('sendImmediate', () => {
    it('should send text message and mark as published', async () => {
      const result = await service.sendImmediate({
        chatId: '-1001234567890',
        contentType: DistributionContentType.TEXT,
        organizationId: new Types.ObjectId().toString(),
        text: 'Hello from Genfeed',
        userId: new Types.ObjectId().toString(),
      });

      expect(result.distributionId).toBeDefined();
      expect(result.telegramMessageId).toBe('42');
      expect(mocks.distributionsService.createDistribution).toHaveBeenCalled();
      expect(mocks.distributionsService.markAsPublished).toHaveBeenCalled();
      expect(mocks.httpService.post).toHaveBeenCalledWith(
        expect.stringContaining('/sendMessage'),
        expect.objectContaining({
          chat_id: '-1001234567890',
          text: 'Hello from Genfeed',
        }),
        expect.objectContaining({
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    it('should send photo with caption', async () => {
      await service.sendImmediate({
        caption: 'Look at this',
        chatId: '-1001234567890',
        contentType: DistributionContentType.PHOTO,
        mediaUrl: 'https://example.com/photo.jpg',
        organizationId: new Types.ObjectId().toString(),
        userId: new Types.ObjectId().toString(),
      });

      expect(mocks.httpService.post).toHaveBeenCalledWith(
        expect.stringContaining('/sendPhoto'),
        expect.objectContaining({
          caption: 'Look at this',
          chat_id: '-1001234567890',
          photo: 'https://example.com/photo.jpg',
        }),
        expect.objectContaining({
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    it('should send video with caption', async () => {
      await service.sendImmediate({
        caption: 'Watch this',
        chatId: '-1001234567890',
        contentType: DistributionContentType.VIDEO,
        mediaUrl: 'https://example.com/video.mp4',
        organizationId: new Types.ObjectId().toString(),
        userId: new Types.ObjectId().toString(),
      });

      expect(mocks.httpService.post).toHaveBeenCalledWith(
        expect.stringContaining('/sendVideo'),
        expect.objectContaining({
          caption: 'Watch this',
          chat_id: '-1001234567890',
          video: 'https://example.com/video.mp4',
        }),
        expect.objectContaining({
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    it('should mark as failed on Telegram API error', async () => {
      mocks.httpService.post = vi
        .fn()
        .mockReturnValue(
          throwError(() => new Error('Telegram API error: chat not found')),
        );

      await expect(
        service.sendImmediate({
          chatId: 'invalid-chat',
          contentType: DistributionContentType.TEXT,
          organizationId: new Types.ObjectId().toString(),
          text: 'Hello',
          userId: new Types.ObjectId().toString(),
        }),
      ).rejects.toThrow('Telegram API error: chat not found');

      expect(mocks.distributionsService.markAsFailed).toHaveBeenCalledWith(
        expect.anything(),
        'Telegram API error: chat not found',
      );
    });

    it('should resolve brand-scoped bot token when brandId provided', async () => {
      const brandCredential = {
        accessToken: 'brand-specific-token',
      };
      mocks.credentialsService.findOne = vi
        .fn()
        .mockResolvedValue(brandCredential);

      await service.sendImmediate({
        brandId: new Types.ObjectId().toString(),
        chatId: '-1001234567890',
        contentType: DistributionContentType.TEXT,
        organizationId: new Types.ObjectId().toString(),
        text: 'Hello',
        userId: new Types.ObjectId().toString(),
      });

      expect(mocks.httpService.post).toHaveBeenCalledWith(
        expect.stringContaining('brand-specific-token'),
        expect.anything(),
        expect.anything(),
      );
    });
  });

  describe('schedule', () => {
    it('should create a scheduled distribution', async () => {
      const scheduledAt = new Date(Date.now() + 3600000);

      const result = await service.schedule({
        chatId: '-1001234567890',
        contentType: DistributionContentType.TEXT,
        organizationId: new Types.ObjectId().toString(),
        scheduledAt,
        text: 'Scheduled message',
        userId: new Types.ObjectId().toString(),
      });

      expect(result.distributionId).toBeDefined();
      expect(
        mocks.distributionsService.createDistribution,
      ).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        DistributionPlatform.TELEGRAM,
        PublishStatus.SCHEDULED,
        scheduledAt,
      );
      expect(mocks.queueService.add).toHaveBeenCalledWith(
        'telegram-distribute',
        expect.objectContaining({
          distributionId: expect.any(String),
          organizationId: expect.any(String),
          platform: DistributionPlatform.TELEGRAM,
        }),
        expect.objectContaining({
          delay: expect.any(Number),
        }),
      );
    });
  });

  describe('processScheduled', () => {
    it('should process a scheduled distribution', async () => {
      const scheduledDoc = {
        ...mocks.distributionDoc,
        status: PublishStatus.SCHEDULED,
      };
      mocks.distributionsService.findOne = vi
        .fn()
        .mockResolvedValue(scheduledDoc);

      await service.processScheduled({
        distributionId: scheduledDoc._id.toString(),
        organizationId: scheduledDoc.organization.toString(),
        platform: DistributionPlatform.TELEGRAM,
      });

      expect(mocks.distributionsService.patch).toHaveBeenCalled();
      expect(mocks.distributionsService.markAsPublished).toHaveBeenCalled();
    });

    it('should skip when distribution not found or not scheduled', async () => {
      mocks.distributionsService.findOne = vi.fn().mockResolvedValue(null);

      await service.processScheduled({
        distributionId: new Types.ObjectId().toString(),
        organizationId: new Types.ObjectId().toString(),
        platform: DistributionPlatform.TELEGRAM,
      });

      expect(mocks.distributionsService.patch).not.toHaveBeenCalled();
      expect(mocks.loggerService.warn).toHaveBeenCalled();
    });

    it('should mark as failed when Telegram API call fails', async () => {
      const scheduledDoc = {
        ...mocks.distributionDoc,
        status: PublishStatus.SCHEDULED,
      };
      mocks.distributionsService.findOne = vi
        .fn()
        .mockResolvedValue(scheduledDoc);
      mocks.httpService.post = vi
        .fn()
        .mockReturnValue(throwError(() => new Error('Bot token revoked')));

      await expect(
        service.processScheduled({
          distributionId: scheduledDoc._id.toString(),
          organizationId: scheduledDoc.organization.toString(),
          platform: DistributionPlatform.TELEGRAM,
        }),
      ).rejects.toThrow('Bot token revoked');

      expect(mocks.distributionsService.markAsFailed).toHaveBeenCalled();
    });
  });

  describe('credential resolution', () => {
    it('should fall back to global token when no credentials found', async () => {
      mocks.credentialsService.findOne = vi.fn().mockResolvedValue(null);

      await service.sendImmediate({
        chatId: '-1001234567890',
        contentType: DistributionContentType.TEXT,
        organizationId: new Types.ObjectId().toString(),
        text: 'Hello',
        userId: new Types.ObjectId().toString(),
      });

      expect(mocks.httpService.post).toHaveBeenCalledWith(
        expect.stringContaining('test-bot-token'),
        expect.anything(),
        expect.anything(),
      );
    });

    it('should throw when no token is available', async () => {
      mocks.credentialsService.findOne = vi.fn().mockResolvedValue(null);
      mocks.configService.get = vi.fn().mockReturnValue(undefined);

      await expect(
        service.sendImmediate({
          chatId: '-1001234567890',
          contentType: DistributionContentType.TEXT,
          organizationId: new Types.ObjectId().toString(),
          text: 'Hello',
          userId: new Types.ObjectId().toString(),
        }),
      ).rejects.toThrow('No Telegram bot token found');
    });
  });

  describe('multi-tenancy isolation', () => {
    it('should use org-specific credential lookup', async () => {
      const orgId = new Types.ObjectId().toString();

      await service.sendImmediate({
        chatId: '-1001234567890',
        contentType: DistributionContentType.TEXT,
        organizationId: orgId,
        text: 'Hello',
        userId: new Types.ObjectId().toString(),
      });

      expect(mocks.credentialsService.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          organization: new Types.ObjectId(orgId),
        }),
      );
    });
  });
});
