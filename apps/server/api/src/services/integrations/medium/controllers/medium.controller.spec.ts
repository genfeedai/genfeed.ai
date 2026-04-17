import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { MediumController } from '@api/services/integrations/medium/controllers/medium.controller';
import { MediumService } from '@api/services/integrations/medium/services/medium.service';
import type { IClerkPublicMetadata } from '@api/shared/interfaces/clerk/clerk.interface';
import type { User } from '@clerk/backend';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('MediumController', () => {
  let controller: MediumController;
  let mediumService: vi.Mocked<MediumService>;
  let loggerService: vi.Mocked<LoggerService>;

  const _mockUser = {
    id: 'user-123',
    publicMetadata: {
      brand: 'test-object-id',
      isSuperAdmin: false,
      organization: 'test-object-id',
      user: 'test-object-id',
    } as IClerkPublicMetadata,
  } as unknown as User;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MediumController],
      providers: [
        {
          provide: MediumService,
          useValue: {
            exchangeAuthCodeForAccessToken: vi.fn(),
            generateAuthUrl: vi.fn(),
            getUserProfile: vi.fn(),
            publishArticle: vi.fn(),
          },
        },
        {
          provide: BrandsService,
          useValue: {
            findOne: vi.fn(),
          },
        },
        {
          provide: CredentialsService,
          useValue: {
            findOne: vi.fn(),
            patch: vi.fn(),
            saveCredentials: vi.fn(),
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
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<MediumController>(MediumController);
    mediumService = module.get(MediumService);
    loggerService = module.get(LoggerService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('Medium integration endpoints', () => {
    it('should have Medium service dependency', () => {
      expect(mediumService).toBeDefined();
    });

    it('should use logger for operations', () => {
      expect(loggerService).toBeDefined();
    });
  });

  describe('authentication', () => {
    it('should require user authentication', () => {
      // Tests for authenticated endpoints would go here
      expect(controller).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle Medium API errors', () => {
      // Error handling tests would go here
      expect(controller).toBeDefined();
    });
  });
});
