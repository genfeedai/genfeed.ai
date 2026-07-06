import { DistributionsService } from '@api/collections/distributions/services/distributions.service';
import { TelegramDistributionService } from '@api/services/distribution/telegram/telegram-distribution.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  DistributionContentType,
  DistributionPlatform,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('DistributionsService', () => {
  let service: DistributionsService;

  const orgId = 'test-object-id';
  const userId = 'test-object-id';

  const mockTelegramDistributionService = {
    schedule: vi.fn(),
    sendImmediate: vi.fn(),
  };

  const mockPrismaService = {
    distribution: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };

  const mockLoggerService = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DistributionsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: LoggerService, useValue: mockLoggerService },
        {
          provide: TelegramDistributionService,
          useValue: mockTelegramDistributionService,
        },
      ],
    }).compile();

    service = module.get<DistributionsService>(DistributionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should dispatch to sendImmediate when scheduledAt is absent', async () => {
      mockTelegramDistributionService.sendImmediate.mockResolvedValue({
        distributionId: 'dist-id',
        telegramMessageId: '42',
      });

      const result = await service.createFromRequest(orgId, userId, {
        chatId: '-1001234567890',
        contentType: DistributionContentType.TEXT,
        platform: DistributionPlatform.TELEGRAM,
        text: 'Hello',
      });

      expect(
        mockTelegramDistributionService.sendImmediate,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          chatId: '-1001234567890',
          contentType: DistributionContentType.TEXT,
          organizationId: orgId,
          text: 'Hello',
          userId,
        }),
      );
      expect(mockTelegramDistributionService.schedule).not.toHaveBeenCalled();
      expect(result).toEqual({
        distributionId: 'dist-id',
        telegramMessageId: '42',
      });
    });

    it('should dispatch to schedule when scheduledAt is present', async () => {
      const scheduledAt = new Date(Date.now() + 3600000).toISOString();
      mockTelegramDistributionService.schedule.mockResolvedValue({
        distributionId: 'dist-id',
      });

      const result = await service.createFromRequest(orgId, userId, {
        chatId: '-1001234567890',
        contentType: DistributionContentType.TEXT,
        platform: DistributionPlatform.TELEGRAM,
        scheduledAt,
        text: 'Scheduled',
      });

      expect(mockTelegramDistributionService.schedule).toHaveBeenCalledWith(
        expect.objectContaining({
          chatId: '-1001234567890',
          organizationId: orgId,
          scheduledAt: new Date(scheduledAt),
          userId,
        }),
      );
      expect(
        mockTelegramDistributionService.sendImmediate,
      ).not.toHaveBeenCalled();
      expect(result).toEqual({ distributionId: 'dist-id' });
    });

    it('should throw BadRequestException for an unsupported platform', async () => {
      await expect(
        service.createFromRequest(orgId, userId, {
          chatId: 'chat',
          contentType: DistributionContentType.TEXT,
          platform: 'unsupported' as DistributionPlatform,
          text: 'Hello',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(
        mockTelegramDistributionService.sendImmediate,
      ).not.toHaveBeenCalled();
      expect(mockTelegramDistributionService.schedule).not.toHaveBeenCalled();
    });
  });
});
