vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_req, _serializer, data) => data.docs || data),
  serializeSingle: vi.fn((_req, _serializer, data) => data),
}));

import { MonitoredAccountsController } from '@api/collections/monitored-accounts/controllers/monitored-accounts.controller';
import { MonitoredAccountsService } from '@api/collections/monitored-accounts/services/monitored-accounts.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { ApifyService } from '@api/services/integrations/apify/services/apify.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('MonitoredAccountsController', () => {
  let controller: MonitoredAccountsController;
  let apifyService: ApifyService;

  const mockMonitoredAccountsService = {
    create: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    patch: vi.fn(),
    remove: vi.fn(),
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
    apifyService = module.get<ApifyService>(ApifyService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
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

  describe('buildFindAllQuery', () => {
    const mockUser = {
      brandId: 'brand-123',
      id: 'auth-provider-user',
      organizationId: 'org-123',
      userId: 'user-123',
    } as never;

    it('ignores a foreign organizationId in the query for non-superadmin users', () => {
      const result = controller.buildFindAllQuery(mockUser, {
        organizationId: 'org-foreign',
      } as never);

      expect(result).toEqual(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: 'org-123' }),
        }),
      );
    });

    it('honors a query organizationId override for superadmin users', () => {
      const superAdmin = { ...mockUser, isSuperAdmin: true } as never;

      const result = controller.buildFindAllQuery(superAdmin, {
        organizationId: 'org-foreign',
      } as never);

      expect(result).toEqual(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: 'org-foreign' }),
        }),
      );
    });
  });
});
