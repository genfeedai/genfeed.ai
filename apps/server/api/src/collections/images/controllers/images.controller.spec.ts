vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnNotFound: vi.fn((type, id) => ({
    errors: [
      { detail: `${type} ${id} not found`, status: '404', title: 'Not Found' },
    ],
  })),
  serializeCollection: vi.fn((_req, _serializer, data) => ({
    data: data.docs || data,
  })),
  serializeSingle: vi.fn((_req, _serializer, data) => ({ data })),
}));

import { ImagesController } from '@api/collections/images/controllers/images.controller';
import { ImagesQueryDto } from '@api/collections/images/dto/images-query.dto';
import { ImagesService } from '@api/collections/images/services/images.service';
import { VotesService } from '@api/collections/votes/services/votes.service';
import { ClerkGuard } from '@api/helpers/guards/clerk/clerk.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import type { User } from '@clerk/backend';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('ImagesController', () => {
  let controller: ImagesController;
  let _imagesService: ImagesService;
  let _votesService: VotesService;
  let _loggerService: LoggerService;

  const mockUser = {
    id: 'user_123',
    publicMetadata: {
      brand: '507f1f77bcf86cd799439013',
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439011',
    },
  } as unknown as User;

  const mockImage = {
    _id: '507f1f77bcf86cd799439014',
    brand: '507f1f77bcf86cd799439013',
    category: 'image',
    isDeleted: false,
    metadata: {
      _id: '507f1f77bcf86cd799439015',
      height: 1080,
      label: 'Test Image',
      width: 1920,
    },
    organization: '507f1f77bcf86cd799439012',
    prompt: {
      _id: '507f1f77bcf86cd799439016',
      original: 'Test prompt',
    },
    user: '507f1f77bcf86cd799439011',
  };

  const mockRequest = {
    originalUrl: '/api/images',
    params: {},
    query: {},
  } as unknown as Request;

  const mockServices = {
    imagesService: {
      findAll: vi.fn(),
      findOne: vi.fn(),
      model: {
        aggregate: vi.fn().mockResolvedValue([mockImage]),
      },
      remove: vi.fn(),
    },
    loggerService: {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    },
    votesService: {
      findOne: vi.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ImagesController],
      providers: [
        { provide: ImagesService, useValue: mockServices.imagesService },
        { provide: VotesService, useValue: mockServices.votesService },
        { provide: LoggerService, useValue: mockServices.loggerService },
      ],
    })
      .overrideGuard(ClerkGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideInterceptor(CreditsInterceptor)
      .useValue({
        intercept: (_ctx: unknown, next: { handle: () => unknown }) =>
          next.handle(),
      })
      .compile();

    controller = module.get<ImagesController>(ImagesController);
    _imagesService = module.get<ImagesService>(ImagesService);
    _votesService = module.get<VotesService>(VotesService);
    _loggerService = module.get<LoggerService>(LoggerService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findLatest', () => {
    it('should return latest images', async () => {
      const mockData = {
        docs: [mockImage],
        limit: 10,
        page: 1,
        totalDocs: 1,
      };

      mockServices.imagesService.findAll.mockResolvedValue(mockData);

      const result = await controller.findLatest(mockRequest, mockUser, 10);

      expect(mockServices.imagesService.findAll).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.data).toBeDefined();
    });

    it('should limit results to 50', async () => {
      const mockData = {
        docs: [],
        totalDocs: 0,
      };

      mockServices.imagesService.findAll.mockResolvedValue(mockData);

      await controller.findLatest(mockRequest, mockUser, 100);

      const callArgs = mockServices.imagesService.findAll.mock.calls[0];
      const aggregate = callArgs[0];
      const limitStage = aggregate.find(
        (stage: unknown) => (stage as Record<string, unknown>).$limit,
      );

      expect(limitStage.$limit).toBe(50);
    });
  });

  describe('findAll', () => {
    it('should return paginated images', async () => {
      const query: ImagesQueryDto = {
        limit: 10,
        page: 1,
      };

      const mockData = {
        docs: [mockImage],
        hasNextPage: false,
        hasPrevPage: false,
        limit: 10,
        page: 1,
        totalDocs: 1,
        totalPages: 1,
      };

      mockServices.imagesService.findAll.mockResolvedValue(mockData);

      const result = await controller.findAll(mockRequest, mockUser, query);

      expect(mockServices.imagesService.findAll).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.data).toBeDefined();
    });

    it('should filter by search query', async () => {
      const query: ImagesQueryDto = {
        search: 'sunset',
      };

      const mockData = {
        docs: [mockImage],
        totalDocs: 1,
      };

      mockServices.imagesService.findAll.mockResolvedValue(mockData);

      await controller.findAll(mockRequest, mockUser, query);

      const callArgs = mockServices.imagesService.findAll.mock.calls[0];
      const aggregate = callArgs[0];
      const searchStage = aggregate.find(
        (stage: unknown) =>
          (stage as Record<string, Record<string, unknown>>).$match?.$or,
      );

      expect(searchStage).toBeDefined();
      expect(searchStage.$match.$or).toBeDefined();
    });

    it('should filter by status', async () => {
      const query: ImagesQueryDto = {
        status: 'completed',
      };

      const mockData = {
        docs: [mockImage],
        totalDocs: 1,
      };

      mockServices.imagesService.findAll.mockResolvedValue(mockData);

      await controller.findAll(mockRequest, mockUser, query);

      expect(mockServices.imagesService.findAll).toHaveBeenCalled();
    });

    it('should filter by brand', async () => {
      const query: ImagesQueryDto = {
        brand: '507f1f77bcf86cd799439013',
      };

      const mockData = {
        docs: [mockImage],
        totalDocs: 1,
      };

      mockServices.imagesService.findAll.mockResolvedValue(mockData);

      await controller.findAll(mockRequest, mockUser, query);

      expect(mockServices.imagesService.findAll).toHaveBeenCalled();
    });

    it('should handle lightweight mode', async () => {
      const query: ImagesQueryDto = {
        lightweight: true,
      };

      const mockData = {
        docs: [mockImage],
        totalDocs: 1,
      };

      mockServices.imagesService.findAll.mockResolvedValue(mockData);

      await controller.findAll(mockRequest, mockUser, query);

      expect(mockServices.imagesService.findAll).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a single image', async () => {
      mockServices.imagesService.findOne.mockResolvedValue(mockImage);
      mockServices.votesService.findOne.mockResolvedValue(null);

      const result = await controller.findOne(
        mockRequest,
        '507f1f77bcf86cd799439014',
        mockUser,
      );

      expect(mockServices.imagesService.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ _id: '507f1f77bcf86cd799439014' }),
        expect.any(Array),
      );
      expect(result).toBeDefined();
      expect(result.data).toBeDefined();
    });

    it('should include vote status', async () => {
      const mockVote = {
        _id: '507f1f77bcf86cd799439017',
        entity: '507f1f77bcf86cd799439014',
        user: '507f1f77bcf86cd799439011',
      };

      mockServices.imagesService.findOne.mockResolvedValue(mockImage);
      mockServices.votesService.findOne.mockResolvedValue(mockVote);

      const result = await controller.findOne(
        mockRequest,
        '507f1f77bcf86cd799439014',
        mockUser,
      );

      expect(mockServices.votesService.findOne).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should return 404 when image not found', async () => {
      mockServices.imagesService.findOne.mockResolvedValue(null);

      const result = await controller.findOne(
        mockRequest,
        '507f1f77bcf86cd799439014',
        mockUser,
      );

      expect(result.errors).toBeDefined();
    });
  });

  describe('remove', () => {
    it('should remove an image', async () => {
      mockServices.imagesService.remove.mockResolvedValue(mockImage);

      const result = await controller.remove(
        mockRequest,
        '507f1f77bcf86cd799439014',
      );

      expect(mockServices.imagesService.remove).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439014',
      );
      expect(result).toBeDefined();
      expect(result.data).toBeDefined();
    });

    it('should return 404 when image not found', async () => {
      mockServices.imagesService.remove.mockResolvedValue(null);

      const result = await controller.remove(
        mockRequest,
        '507f1f77bcf86cd799439014',
      );

      expect(result.errors).toBeDefined();
    });
  });
});
