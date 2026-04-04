vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_req, _serializer, data) => data.docs || data),
  serializeSingle: vi.fn((_req, _serializer, data) => data),
}));

vi.mock('@api/helpers/utils/clerk/clerk.util', () => ({
  getPublicMetadata: vi.fn(() => ({
    brand: 'brand-123',
    organization: 'org-123',
    user: 'user-123',
  })),
}));

import { MonitoredAccountsController } from '@api/collections/monitored-accounts/controllers/monitored-accounts.controller';
import { MonitoredAccountsService } from '@api/collections/monitored-accounts/services/monitored-accounts.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { ApifyService } from '@api/services/integrations/apify/services/apify.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('MonitoredAccountsController', () => {
  let controller: MonitoredAccountsController;
  let monitoredAccountsService: MonitoredAccountsService;
  let apifyService: ApifyService;

  const mockRequest = {} as never;
  const mockUser = { id: 'user-123' } as never;

  const mockMonitoredAccountsService = {
    create: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    patch: vi.fn(),
    remove: vi.fn(),
    toggleActive: vi.fn(),
  };

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const mockApifyService = {
    getTwitterUserTimeline: vi.fn(),
    validateTwitterUsername: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MonitoredAccountsController],
      providers: [
        {
          provide: MonitoredAccountsService,
          useValue: mockMonitoredAccountsService,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
        {
          provide: ApifyService,
          useValue: mockApifyService,
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<MonitoredAccountsController>(
      MonitoredAccountsController,
    );
    monitoredAccountsService = module.get<MonitoredAccountsService>(
      MonitoredAccountsService,
    );
    apifyService = module.get<ApifyService>(ApifyService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('toggleActive', () => {
    it('should toggle account active status and return serialized result', async () => {
      const mockAccount = { _id: 'acc-1', isActive: false };
      mockMonitoredAccountsService.toggleActive.mockResolvedValue(mockAccount);

      const result = await controller.toggleActive(
        mockRequest,
        'acc-1',
        mockUser,
      );

      expect(monitoredAccountsService.toggleActive).toHaveBeenCalledWith(
        'acc-1',
        'org-123',
        'brand-123',
      );
      expect(result).toEqual(mockAccount);
    });
  });

  describe('validateTwitterUsername', () => {
    it('should return valid user details when account exists', async () => {
      const mockTweets = [
        {
          authorAvatarUrl: 'https://example.com/avatar.jpg',
          authorDisplayName: 'Test User',
          authorFollowersCount: 1000,
          authorId: 'tw-123',
          authorUsername: 'testuser',
        },
      ];
      mockApifyService.getTwitterUserTimeline.mockResolvedValue(mockTweets);

      const result = await controller.validateTwitterUsername({
        username: 'testuser',
      } as never);

      expect(apifyService.getTwitterUserTimeline).toHaveBeenCalledWith(
        'testuser',
        { limit: 1 },
      );
      expect(result).toEqual({
        avatarUrl: 'https://example.com/avatar.jpg',
        displayName: 'Test User',
        followersCount: 1000,
        id: 'tw-123',
        username: 'testuser',
        valid: true,
      });
    });

    it('should return invalid when account has no tweets', async () => {
      mockApifyService.getTwitterUserTimeline.mockResolvedValue([]);

      const result = await controller.validateTwitterUsername({
        username: 'emptyuser',
      } as never);

      expect(result).toEqual({
        error: 'Account not found or has no tweets',
        valid: false,
      });
    });

    it('should return invalid when API call fails', async () => {
      mockApifyService.getTwitterUserTimeline.mockRejectedValue(
        new Error('API error'),
      );

      const result = await controller.validateTwitterUsername({
        username: 'baduser',
      } as never);

      expect(result).toEqual({
        error: 'Failed to validate username',
        valid: false,
      });
    });
  });
});
