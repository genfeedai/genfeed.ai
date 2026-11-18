vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_req, _serializer, data) => data.docs || data),
  serializeSingle: vi.fn((_req, _serializer, data) => data),
}));

import { MonitoredAccountsController } from '@api/collections/monitored-accounts/controllers/monitored-accounts.controller';
import { MonitoredAccountsService } from '@api/collections/monitored-accounts/services/monitored-accounts.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('MonitoredAccountsController', () => {
  let controller: MonitoredAccountsController;

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

  const mockTwitterService = {
    getUserByUsername: vi.fn(),
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
          provide: TwitterService,
          useValue: mockTwitterService,
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<MonitoredAccountsController>(
      MonitoredAccountsController,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('validateTwitterUsername', () => {
    it('should return valid user details when account exists', async () => {
      mockTwitterService.getUserByUsername.mockResolvedValue({
        description: 'Building in public',
        followersCount: 1000,
        id: 'tw-123',
        name: 'Test User',
        profileImageUrl: 'https://example.com/avatar.jpg',
        username: 'testuser',
      });

      const result = await controller.validateTwitterUsername({
        username: 'testuser',
      } as never);

      expect(result).toEqual({
        avatarUrl: 'https://example.com/avatar.jpg',
        bio: 'Building in public',
        displayName: 'Test User',
        followersCount: 1000,
        id: 'tw-123',
        username: 'testuser',
        valid: true,
      });
    });

    it('should return invalid when the account does not exist', async () => {
      mockTwitterService.getUserByUsername.mockResolvedValue(null);

      const result = await controller.validateTwitterUsername({
        username: 'emptyuser',
      } as never);

      expect(result).toEqual({
        error: 'Account not found',
        valid: false,
      });
    });

    it('should return invalid when API call fails', async () => {
      mockTwitterService.getUserByUsername.mockRejectedValue(
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
