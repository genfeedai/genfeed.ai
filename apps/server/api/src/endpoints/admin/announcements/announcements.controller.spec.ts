import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import type { BroadcastAnnouncementDto } from '@api/endpoints/admin/announcements/dto/broadcast-announcement.dto';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnnouncementsController } from './announcements.controller';
import { AdminAnnouncementsService } from './announcements.service';

vi.mock('@api/helpers/decorators/user/current-user.decorator', () => ({
  CurrentUser:
    () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
      descriptor,
}));

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn(
    (_req: unknown, _serializer: unknown, data: unknown) => ({
      data,
      serialized: true,
    }),
  ),
  serializeSingle: vi.fn(
    (_req: unknown, _serializer: unknown, item: unknown) => ({
      data: item,
      serialized: true,
    }),
  ),
}));

vi.mock('@genfeedai/serializers', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@genfeedai/serializers')>();
  return {
    ...actual,
    AnnouncementSerializer: {},
  };
});

const makeRequest = () => ({
  url: 'https://api.genfeed.ai/admin/announcements',
});

const makeUser = (orgId = 'org_test123') => ({
  id: 'user_abc',
  organizationId: orgId,
  userId: 'user_abc',
});

const makeAnnouncement = () => ({
  _id: testId('announcement'),
  channel: 'discord',
  createdAt: new Date(),
  message: 'Test announcement',
  organization: 'org_test123',
});

describe('AnnouncementsController', () => {
  let controller: AnnouncementsController;

  const mockAdminAnnouncementsService = {
    broadcast: vi.fn(),
    getHistory: vi.fn(),
  };

  const mockLoggerService = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnnouncementsController],
      providers: [
        {
          provide: AdminAnnouncementsService,
          useValue: mockAdminAnnouncementsService,
        },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    })
      .overrideGuard(IpWhitelistGuard)
      .useValue({ canActivate: vi.fn().mockReturnValue(true) })
      .overrideGuard(SuperAdminGuard)
      .useValue({ canActivate: vi.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<AnnouncementsController>(AnnouncementsController);
  });

  describe('broadcast()', () => {
    it('should return serialized announcement', async () => {
      const announcement = makeAnnouncement();
      mockAdminAnnouncementsService.broadcast.mockResolvedValue(announcement);

      const result = await controller.broadcast(
        { channels: ['discord'], message: 'Hello' } as BroadcastAnnouncementDto,
        makeUser() as never,
        makeRequest() as never,
      );

      expect(result).toMatchObject({ data: announcement, serialized: true });
    });

    it('should handle service errors gracefully', async () => {
      mockAdminAnnouncementsService.broadcast.mockRejectedValue(
        new Error('Discord unavailable'),
      );

      // ErrorResponse.handle throws HttpException for non-HttpException errors
      await expect(
        controller.broadcast(
          {
            channels: ['discord'],
            message: 'Hello',
          } as BroadcastAnnouncementDto,
          makeUser() as never,
          makeRequest() as never,
        ),
      ).rejects.toThrow();
    });
  });

  describe('getHistory()', () => {
    it('should call getHistory service method', async () => {
      mockAdminAnnouncementsService.getHistory.mockResolvedValue([]);

      await controller.getHistory(makeRequest() as never);

      expect(mockAdminAnnouncementsService.getHistory).toHaveBeenCalledTimes(1);
    });

    it('should handle service errors gracefully', async () => {
      mockAdminAnnouncementsService.getHistory.mockRejectedValue(
        new Error('DB error'),
      );

      // ErrorResponse.handle throws HttpException for non-HttpException errors
      await expect(
        controller.getHistory(makeRequest() as never),
      ).rejects.toThrow();
    });
  });
});
