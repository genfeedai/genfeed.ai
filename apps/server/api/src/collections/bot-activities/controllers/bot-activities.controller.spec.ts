vi.mock('@api/helpers/utils/clerk/clerk.util', () => ({
  getPublicMetadata: vi.fn(() => ({
    brand: 'brand-123',
    organization: 'org-123',
    user: 'user-123',
  })),
}));

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_req, _serializer, data) => data),
  serializeSingle: vi.fn((_req, _serializer, data) => data),
}));

import { BotActivitiesController } from '@api/collections/bot-activities/controllers/bot-activities.controller';
import { BotActivitiesService } from '@api/collections/bot-activities/services/bot-activities.service';
import { FeatureFlagGuard } from '@api/feature-flag/feature-flag.guard';
import { FeatureFlagService } from '@api/feature-flag/feature-flag.service';
import { ClerkGuard } from '@api/helpers/guards/clerk/clerk.guard';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('BotActivitiesController', () => {
  let controller: BotActivitiesController;
  let botActivitiesService: BotActivitiesService;

  const mockRequest = {} as never;
  const mockUser = { id: 'user-123' } as never;
  const mockFeatureFlagService = {
    isEnabled: vi.fn(() => true),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BotActivitiesController],
      providers: [
        {
          provide: BotActivitiesService,
          useValue: {
            findOne: vi.fn(),
            findRecentByConfig: vi.fn(),
            findWithFilters: vi.fn(),
            getStats: vi.fn(),
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
          provide: FeatureFlagService,
          useValue: mockFeatureFlagService,
        },
      ],
    })
      .overrideGuard(FeatureFlagGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ClerkGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<BotActivitiesController>(BotActivitiesController);
    botActivitiesService =
      module.get<BotActivitiesService>(BotActivitiesService);
  });

  afterEach(() => {
    vi.clearAllMocks();
    mockFeatureFlagService.isEnabled.mockReturnValue(true);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return paginated activities from the service', async () => {
      const mockActivities = [{ _id: '1' }, { _id: '2' }];
      const mockResult = { activities: mockActivities, total: 2 };
      vi.mocked(botActivitiesService.findWithFilters).mockResolvedValue(
        mockResult as never,
      );

      const query = { limit: 10, page: 1 } as never;
      const result = await controller.findAll(mockRequest, query, mockUser);

      expect(botActivitiesService.findWithFilters).toHaveBeenCalledWith(
        'org-123',
        'brand-123',
        query,
      );
      expect(result).toEqual({
        docs: mockActivities,
        total: 2,
      });
    });
  });

  describe('findOne', () => {
    it('should return a single activity by id', async () => {
      const mockActivity = { _id: 'act-1', type: 'reply' };
      vi.mocked(botActivitiesService.findOne).mockResolvedValue(
        mockActivity as never,
      );

      const result = await controller.findOne(mockRequest, 'act-1', mockUser);

      expect(botActivitiesService.findOne).toHaveBeenCalledWith({
        _id: 'act-1',
        brand: 'brand-123',
        isDeleted: false,
        organization: 'org-123',
      });
      expect(result).toEqual(mockActivity);
    });
  });

  describe('getStats', () => {
    it('should delegate to service with correct parameters', async () => {
      const mockStats = { replied: 10, skipped: 3, total: 13 };
      vi.mocked(botActivitiesService.getStats).mockResolvedValue(
        mockStats as never,
      );

      const result = await controller.getStats(
        'config-1',
        '2026-01-01',
        '2026-01-31',
        mockUser,
      );

      expect(botActivitiesService.getStats).toHaveBeenCalledWith(
        'org-123',
        'brand-123',
        'config-1',
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      );
      expect(result).toEqual(mockStats);
    });

    it('should pass undefined dates when not provided', async () => {
      vi.mocked(botActivitiesService.getStats).mockResolvedValue({} as never);

      await controller.getStats('config-1', '', '', mockUser);

      expect(botActivitiesService.getStats).toHaveBeenCalledWith(
        'org-123',
        'brand-123',
        'config-1',
        undefined,
        undefined,
      );
    });
  });

  describe('getRecentByConfig', () => {
    it('should return recent activities for a config', async () => {
      const mockDocs = [{ _id: 'a1' }, { _id: 'a2' }];
      vi.mocked(botActivitiesService.findRecentByConfig).mockResolvedValue(
        mockDocs as never,
      );

      const result = await controller.getRecentByConfig(
        mockRequest,
        'config-1',
        5,
        mockUser,
      );

      expect(botActivitiesService.findRecentByConfig).toHaveBeenCalledWith(
        'config-1',
        'brand-123',
        5,
      );
      expect(result).toEqual({ docs: mockDocs });
    });
  });
});
