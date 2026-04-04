vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_req, _serializer, data) => data.docs || data),
  serializeSingle: vi.fn((_req, _serializer, data) => data),
}));

import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { SchedulesController } from '@api/collections/schedules/controllers/schedules.controller';
import { BulkScheduleDto } from '@api/collections/schedules/dto/bulk-schedule.dto';
import { GetOptimalTimeDto } from '@api/collections/schedules/dto/optimal-time.dto';
import { RepurposeContentDto } from '@api/collections/schedules/dto/repurpose.dto';
import { SchedulesService } from '@api/collections/schedules/services/schedules.service';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import type { User } from '@clerk/backend';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('SchedulesController', () => {
  let controller: SchedulesController;
  let service: SchedulesService;
  let mockReq: Request;

  const mockUser: User = {
    id: 'user_123',
    publicMetadata: {
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439011',
    },
  } as unknown as User;

  const mockSchedulesService = {
    bulkSchedule: vi.fn(),
    getCalendar: vi.fn(),
    getOptimalTime: vi.fn(),
    getRepurposingStatus: vi.fn(),
    repurposeContent: vi.fn(),
  };

  beforeEach(async () => {
    mockReq = {} as Request;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SchedulesController],
      providers: [
        {
          provide: CreditsUtilsService,
          useValue: {
            checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(true),
            getOrganizationCreditsBalance: vi.fn().mockResolvedValue(0),
          },
        },
        {
          provide: ModelsService,
          useValue: {
            findOne: vi.fn().mockResolvedValue(null),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
        {
          provide: SchedulesService,
          useValue: mockSchedulesService,
        },
      ],
    })
      .overrideInterceptor(CreditsInterceptor)
      .useValue({
        intercept: (_context: unknown, next: { handle: () => unknown }) =>
          next.handle(),
      })
      .overrideGuard(SubscriptionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(CreditsGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SchedulesController>(SchedulesController);
    service = module.get<SchedulesService>(SchedulesService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getOptimalTime', () => {
    it('should return optimal posting time', async () => {
      const dto: GetOptimalTimeDto = {
        contentType: 'image',
        platform: 'instagram',
      };

      const optimalTime = {
        platform: 'instagram',
        reasoning: 'Peak engagement time',
        recommendedTime: '18:00',
        timezone: 'UTC',
      };

      mockSchedulesService.getOptimalTime.mockResolvedValue(optimalTime);

      const result = await controller.getOptimalTime(mockReq, dto, mockUser);

      expect(service.getOptimalTime).toHaveBeenCalledWith(
        dto,
        mockUser.publicMetadata.organization,
        expect.any(Function),
      );
      expect(result).toEqual(optimalTime);
    });
  });

  describe('bulkSchedule', () => {
    it('should bulk schedule content', async () => {
      const dto: BulkScheduleDto = {
        contentIds: ['id1', 'id2', 'id3'],
        interval: 3600,
        platform: 'twitter',
        startTime: new Date().toISOString(),
      };

      const scheduled = {
        items: [
          { id: 'id1', time: '10:00' },
          { id: 'id2', time: '11:00' },
          { id: 'id3', time: '12:00' },
        ],
        scheduled: 3,
      };

      mockSchedulesService.bulkSchedule.mockResolvedValue(scheduled);

      const result = await controller.bulkSchedule(dto, mockUser);

      expect(service.bulkSchedule).toHaveBeenCalledWith(
        dto,
        mockUser.publicMetadata.organization,
        mockUser.id,
      );
      expect(result).toEqual(scheduled);
    });
  });

  describe('getCalendar', () => {
    it('should return schedule calendar', async () => {
      const calendar = {
        events: [
          { content: 'Post 1', id: '1', time: '2024-01-01T10:00:00Z' },
          { content: 'Post 2', id: '2', time: '2024-01-02T10:00:00Z' },
        ],
      };

      mockSchedulesService.getCalendar.mockResolvedValue(calendar);

      const result = await controller.getCalendar(mockReq, mockUser);

      expect(service.getCalendar).toHaveBeenCalledWith(
        mockUser.publicMetadata.organization,
        expect.any(String),
        expect.any(String),
      );
      expect(result).toEqual(calendar);
    });

    it('should use custom date range', async () => {
      const start = '2024-01-01';
      const end = '2024-01-31';
      const calendar = { events: [] };

      mockSchedulesService.getCalendar.mockResolvedValue(calendar);

      await controller.getCalendar(mockReq, mockUser, start, end);

      expect(service.getCalendar).toHaveBeenCalledWith(
        mockUser.publicMetadata.organization,
        start,
        end,
      );
    });
  });

  describe('repurposeContent', () => {
    it('should repurpose content', async () => {
      const dto: RepurposeContentDto = {
        contentId: 'content123',
        targetPlatforms: ['twitter', 'linkedin'],
      };

      const repurposed = {
        id: 'repurpose123',
        status: 'processing',
        variants: 2,
      };

      mockSchedulesService.repurposeContent.mockResolvedValue(repurposed);

      const result = await controller.repurposeContent(dto, mockUser);

      expect(service.repurposeContent).toHaveBeenCalledWith(
        dto,
        mockUser.publicMetadata.organization,
        mockUser.id,
      );
      expect(result).toEqual(repurposed);
    });
  });

  describe('getRepurposingStatus', () => {
    it('should return repurposing status', async () => {
      const id = 'repurpose123';
      const status = {
        id,
        status: 'completed',
        variants: [
          { content: 'Tweet version', platform: 'twitter' },
          { content: 'LinkedIn version', platform: 'linkedin' },
        ],
      };

      mockSchedulesService.getRepurposingStatus.mockResolvedValue(status);

      const result = await controller.getRepurposingStatus(id, mockUser);

      expect(service.getRepurposingStatus).toHaveBeenCalledWith(
        id,
        mockUser.publicMetadata.organization,
      );
      expect(result).toEqual(status);
    });
  });
});
