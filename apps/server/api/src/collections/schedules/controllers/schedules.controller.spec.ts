import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { SchedulesController } from '@api/collections/schedules/controllers/schedules.controller';
import { GetOptimalTimeDto } from '@api/collections/schedules/dto/optimal-time.dto';
import { SchedulesService } from '@api/collections/schedules/services/schedules.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

const MOCK_ORGANIZATION_ID = testId('org');
const MOCK_USER_ID = testId('user');

describe('SchedulesController', () => {
  let controller: SchedulesController;
  let service: SchedulesService;

  const mockUser: User = {
    id: 'user_123',
    organizationId: MOCK_ORGANIZATION_ID,
    userId: MOCK_USER_ID,
  } as unknown as User;

  const mockSchedulesService = {
    getChannelCapability: vi.fn(),
    listChannelCapabilities: vi.fn(),
    getOptimalTime: vi.fn(),
    validateChannelTargetSettings: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SchedulesController],
      providers: [
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
      .overrideGuard(SubscriptionGuard)
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

  describe('channel capabilities', () => {
    it('should list channel capabilities with discovery flags', async () => {
      const capabilities = [{ label: 'YouTube', platform: 'youtube' }];
      mockSchedulesService.listChannelCapabilities.mockReturnValue(
        capabilities,
      );

      const result = await controller.listChannelCapabilities('true', 'false');

      expect(service.listChannelCapabilities).toHaveBeenCalledWith({
        includeHidden: true,
        includePlanned: false,
      });
      expect(result).toEqual(capabilities);
    });

    it('should return one channel capability', async () => {
      const capability = { label: 'TikTok', platform: 'tiktok' };
      mockSchedulesService.getChannelCapability.mockReturnValue(capability);

      const result = await controller.getChannelCapability('tiktok');

      expect(service.getChannelCapability).toHaveBeenCalledWith('tiktok');
      expect(result).toEqual(capability);
    });

    it('should validate channel target settings through the shared service', async () => {
      const input = {
        platform: 'youtube',
        settings: { privacyStatus: 'public' },
      };
      const validation = {
        errors: [],
        platform: 'youtube',
        valid: true,
        validationState: 'valid',
        warnings: [],
      };
      mockSchedulesService.validateChannelTargetSettings.mockReturnValue(
        validation,
      );

      const result = await controller.validateChannelTargetSettings(input);

      expect(service.validateChannelTargetSettings).toHaveBeenCalledWith(input);
      expect(result).toEqual(validation);
    });
  });

  describe('getOptimalTime', () => {
    it("asks the service for the caller's organization only", async () => {
      const dto: GetOptimalTimeDto = {
        platform: 'twitter',
        timezone: 'Europe/Malta',
      };
      const recommendation = { basis: 'default', windows: [] };
      mockSchedulesService.getOptimalTime.mockResolvedValue(recommendation);

      const result = await controller.getOptimalTime(dto, mockUser);

      expect(service.getOptimalTime).toHaveBeenCalledWith(
        dto,
        MOCK_ORGANIZATION_ID,
      );
      expect(result).toEqual(recommendation);
    });
  });
});
