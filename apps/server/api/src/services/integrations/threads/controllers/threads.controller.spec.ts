vi.mock('@api/helpers/utils/clerk/clerk.util', () => ({
  getPublicMetadata: vi.fn(() => ({
    organization: '507f1f77bcf86cd799439011',
    user: '507f1f77bcf86cd799439013',
  })),
}));

vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnBadRequest: vi.fn((data) => data),
  returnInternalServerError: vi.fn((msg) => msg),
  returnNotFound: vi.fn((name, id) => ({ id, name })),
  serializeCollection: vi.fn((_, __, r) => r),
  serializeSingle: vi.fn((_, __, data) => data),
}));

import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ConfigService } from '@api/config/config.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { ThreadsController } from '@api/services/integrations/threads/controllers/threads.controller';
import { ThreadsService } from '@api/services/integrations/threads/services/threads.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';

describe('ThreadsController', () => {
  let controller: ThreadsController;
  let brandsService: BrandsService;
  let threadsService: ThreadsService;

  const mockRequest = {} as never;
  const mockUser = { id: 'user-123' } as never;

  const mockBrandsService = { findOne: vi.fn() };
  const mockCredentialsService = {
    findOne: vi.fn(),
    patch: vi.fn(),
    saveCredentials: vi.fn(),
  };
  const mockThreadsService = {
    getAccountDetails: vi.fn(),
    getTrends: vi.fn(),
  };
  const mockLoggerService = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ThreadsController],
      providers: [
        {
          provide: ConfigService,
          useValue: { get: vi.fn().mockReturnValue('') },
        },
        {
          provide: BrandsService,
          useValue: mockBrandsService,
        },
        {
          provide: CredentialsService,
          useValue: mockCredentialsService,
        },
        {
          provide: HttpService,
          useValue: { get: vi.fn(), post: vi.fn() },
        },
        {
          provide: ThreadsService,
          useValue: mockThreadsService,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ThreadsController>(ThreadsController);
    brandsService = module.get<BrandsService>(BrandsService);
    threadsService = module.get<ThreadsService>(ThreadsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('connect', () => {
    it('should return bad request when brand not found', async () => {
      mockBrandsService.findOne.mockResolvedValue(null);

      const result = await controller.connect(mockRequest, mockUser, {
        brand: '507f1f77bcf86cd799439015',
      });

      expect(result).toEqual({
        detail: 'You do not have access to this brand',
        title: 'Invalid payload',
      });
    });

    it('should save credentials and return OAuth URL when brand found', async () => {
      const mockBrand = {
        _id: '507f1f77bcf86cd799439015',
        organization: '507f1f77bcf86cd799439011',
      };
      mockBrandsService.findOne.mockResolvedValue(mockBrand);
      mockCredentialsService.saveCredentials.mockResolvedValue({});

      const result = await controller.connect(mockRequest, mockUser, {
        brand: '507f1f77bcf86cd799439015',
      });

      expect(brandsService.findOne).toHaveBeenCalled();
      expect(mockCredentialsService.saveCredentials).toHaveBeenCalled();
      expect(result).toHaveProperty('url');
    });
  });

  describe('getTrends', () => {
    it('should delegate to threads service', () => {
      const mockTrends = [{ topic: 'AI' }, { topic: 'Tech' }];
      mockThreadsService.getTrends.mockReturnValue(mockTrends);

      const result = controller.getTrends();

      expect(threadsService.getTrends).toHaveBeenCalled();
      expect(result).toEqual(mockTrends);
    });
  });
});
