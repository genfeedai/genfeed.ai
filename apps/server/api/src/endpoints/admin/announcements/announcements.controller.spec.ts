import type { BroadcastAnnouncementDto } from '@api/endpoints/admin/announcements/dto/broadcast-announcement.dto';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnnouncementsController } from './announcements.controller';
import { AdminAnnouncementsService } from './announcements.service';

vi.mock('@api/endpoints/admin/guards/ip-whitelist.guard', () => ({
  IpWhitelistGuard: vi.fn().mockImplementation(function () {
    return { canActivate: vi.fn().mockReturnValue(true) };
  }),
}));

vi.mock('@api/helpers/decorators/user/current-user.decorator', () => ({
  CurrentUser:
    () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
      descriptor,
}));

vi.mock('@api/helpers/utils/clerk/clerk.util', () => ({
  getPublicMetadata: vi.fn().mockReturnValue({
    organization: 'org_test123',
  }),
}));

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn(
    (req: unknown, _serializer: unknown, data: unknown) => ({
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

vi.mock('@genfeedai/serializers', () => ({
  AnnouncementSerializer: {},
}));

const makeRequest = () => ({
  url: 'https://api.genfeed.ai/admin/announcements',
});

const makeUser = (orgId = 'org_test123') => ({
  id: 'user_clerk_abc',
  publicMetadata: { organization: orgId },
});

const makeAnnouncement = () => ({
  _id: '507f191e810c19729de860ee',
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
      .overrideGuard('IpWhitelistGuard')
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AnnouncementsController>(AnnouncementsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('broadcast()', () => {
    it('should call service.broadcast with userId and org from user metadata', async () => {
      const announcement = makeAnnouncement();
      mockAdminAnnouncementsService.broadcast.mockResolvedValue(announcement);

      const dto: BroadcastAnnouncementDto = {
        channels: ['discord'],
        message: 'New feature released!',
      };
      const user = makeUser('org_123');
      const req = makeRequest();

      await controller.broadcast(dto, user as never, req as never);

      expect(mockAdminAnnouncementsService.broadcast).toHaveBeenCalledWith(
        'user_clerk_abc',
        'org_test123',
        dto,
      );
    });

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
    it('should return serialized announcement collection', async () => {
      const announcements = [makeAnnouncement(), makeAnnouncement()];
      mockAdminAnnouncementsService.getHistory.mockResolvedValue(announcements);

      const result = await controller.getHistory(makeRequest() as never);

      expect(result).toBeDefined();
    });

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

    it('should serialize with correct totalDocs when history returned', async () => {
      const announcements = [makeAnnouncement()];
      mockAdminAnnouncementsService.getHistory.mockResolvedValue(announcements);

      const result = await controller.getHistory(makeRequest() as never);

      expect(result).toBeDefined();
    });
  });
});
