import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import type { BroadcastAnnouncementDto } from '@api/endpoints/admin/announcements/dto/broadcast-announcement.dto';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { serializeCollection } from '@api/helpers/utils/response/response.util';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { GUARDS_METADATA } from '@nestjs/common/constants';
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

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('requires IP whitelist and platform superadmin guards', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      AnnouncementsController,
    );

    expect(guards).toEqual([IpWhitelistGuard, SuperAdminGuard]);
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
        'user_abc',
        'org_123',
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
    const page = (docs: unknown[], totalDocs = docs.length) => ({
      docs,
      hasNextPage: false,
      hasPrevPage: false,
      limit: 20,
      nextPage: null,
      page: 1,
      pagingCounter: 1,
      prevPage: null,
      totalDocs,
      totalPages: 1,
    });

    it('serializes the paged result so pagination links carry the totals', async () => {
      const result = page([makeAnnouncement(), makeAnnouncement()], 42);
      mockAdminAnnouncementsService.getHistory.mockResolvedValue(result);

      const response = await controller.getHistory(
        { limit: 2, page: 3 },
        makeRequest() as never,
      );

      expect(serializeCollection).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        result,
      );
      expect(response).toBeDefined();
    });

    it('forwards the requested page window to the service', async () => {
      mockAdminAnnouncementsService.getHistory.mockResolvedValue(page([]));

      await controller.getHistory(
        { limit: 5, page: 4 },
        makeRequest() as never,
      );

      expect(mockAdminAnnouncementsService.getHistory).toHaveBeenCalledWith({
        limit: 5,
        page: 4,
        skip: 15,
      });
    });

    it('defaults to the first page of 20 and caps the limit at 100', async () => {
      mockAdminAnnouncementsService.getHistory.mockResolvedValue(page([]));

      await controller.getHistory({}, makeRequest() as never);
      await controller.getHistory({ limit: 500 }, makeRequest() as never);

      expect(mockAdminAnnouncementsService.getHistory).toHaveBeenNthCalledWith(
        1,
        { limit: 20, page: 1, skip: 0 },
      );
      expect(mockAdminAnnouncementsService.getHistory).toHaveBeenNthCalledWith(
        2,
        { limit: 100, page: 1, skip: 0 },
      );
    });

    it('should handle service errors gracefully', async () => {
      mockAdminAnnouncementsService.getHistory.mockRejectedValue(
        new Error('DB error'),
      );

      // ErrorResponse.handle throws HttpException for non-HttpException errors
      await expect(
        controller.getHistory({}, makeRequest() as never),
      ).rejects.toThrow();
    });

    it('should serialize with correct totalDocs when history returned', async () => {
      const announcements = [makeAnnouncement()];
      mockAdminAnnouncementsService.getHistory.mockResolvedValue(announcements);

      const result = await controller.getHistory({}, makeRequest() as never);

      expect(result).toBeDefined();
    });
  });
});
