vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_req, _serializer, data) => ({
    data: data.docs || data,
  })),
  serializeSingle: vi.fn((_req, _serializer, data) => ({ data })),
}));

vi.mock('@api/helpers/utils/clerk/clerk.util', () => ({
  getPublicMetadata: vi.fn(
    (user: { publicMetadata?: unknown }) => user?.publicMetadata ?? {},
  ),
}));

vi.mock('@api/collections/content-intelligence/schemas/creator-analysis.schema', () => ({
  CreatorAnalysis: { name: 'CreatorAnalysis' },
}));

vi.mock('@api/helpers/utils/error-response/error-response.util', () => {
  const { HttpException, HttpStatus } = require('@nestjs/common');
  return {
    ErrorResponse: {
      notFound: vi.fn((resource: string, id: string) => {
        throw new HttpException(
          { detail: `${resource} with ID '${id}' not found`, status: HttpStatus.NOT_FOUND },
          HttpStatus.NOT_FOUND,
        );
      }),
    },
  };
});

import { CreatorsController } from '@api/collections/content-intelligence/controllers/creators.controller';
import { ContentIntelligenceService } from '@api/collections/content-intelligence/services/content-intelligence.service';
import { PatternAnalyzerService } from '@api/collections/content-intelligence/services/pattern-analyzer.service';
import { PatternStoreService } from '@api/collections/content-intelligence/services/pattern-store.service';
import type { User } from '@clerk/backend';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('CreatorsController', () => {
  let controller: CreatorsController;

  const mockUser = {
    id: 'user_123',
    publicMetadata: {
      brand: '507f1f77bcf86cd799439013',
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439011',
    },
  } as unknown as User;

  const mockRequest = {
    originalUrl: '/api/content-intelligence/creators',
    query: {},
  } as Request;

  const mockCreator = {
    _id: '507f1f77bcf86cd799439015',
    handle: '@testcreator',
    organization: '507f1f77bcf86cd799439012',
    platform: 'twitter',
    status: 'active',
  };

  const mockContentIntelligenceService = {
    addCreator: vi.fn(),
    findAll: vi.fn(),
    findByHandle: vi.fn(),
    findOne: vi.fn(),
    remove: vi.fn(),
  };

  const mockPatternAnalyzerService = {
    analyzeCreator: vi.fn(),
  };

  const mockPatternStoreService = {
    deleteByCreator: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CreatorsController],
      providers: [
        {
          provide: ContentIntelligenceService,
          useValue: mockContentIntelligenceService,
        },
        {
          provide: PatternAnalyzerService,
          useValue: mockPatternAnalyzerService,
        },
        { provide: PatternStoreService, useValue: mockPatternStoreService },
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
    }).compile();

    controller = module.get<CreatorsController>(CreatorsController);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return creators for organization', async () => {
      const mockData = { docs: [mockCreator], totalDocs: 1 };
      mockContentIntelligenceService.findAll.mockResolvedValue(mockData);

      await controller.findAll(mockRequest, mockUser, {} as any);

      expect(mockContentIntelligenceService.findAll).toHaveBeenCalled();
    });

    it('should filter by platform', async () => {
      mockContentIntelligenceService.findAll.mockResolvedValue({ docs: [] });

      await controller.findAll(mockRequest, mockUser, {
        platform: 'twitter',
      } as any);

      expect(mockContentIntelligenceService.findAll).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a single creator', async () => {
      mockContentIntelligenceService.findOne.mockResolvedValue(mockCreator);

      await controller.findOne(
        mockRequest,
        mockUser,
        '507f1f77bcf86cd799439015',
      );

      expect(mockContentIntelligenceService.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: '507f1f77bcf86cd799439015',
          isDeleted: false,
        }),
      );
    });

    it('should throw when creator not found', async () => {
      mockContentIntelligenceService.findOne.mockResolvedValue(null);

      await expect(
        controller.findOne(mockRequest, mockUser, '507f1f77bcf86cd799439015'),
      ).rejects.toThrow(HttpException);
    });

    it('should throw for invalid ObjectId', async () => {
      await expect(
        controller.findOne(mockRequest, mockUser, 'invalid-id'),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('create', () => {
    it('should return existing creator if already exists', async () => {
      mockContentIntelligenceService.findByHandle.mockResolvedValue(
        mockCreator,
      );

      await controller.create(mockRequest, mockUser, {
        handle: '@testcreator',
        platform: 'twitter',
      } as any);

      expect(mockContentIntelligenceService.addCreator).not.toHaveBeenCalled();
    });

    it('should create new creator if not existing', async () => {
      mockContentIntelligenceService.findByHandle.mockResolvedValue(null);
      mockContentIntelligenceService.addCreator.mockResolvedValue(mockCreator);

      await controller.create(mockRequest, mockUser, {
        handle: '@newcreator',
        platform: 'twitter',
      } as any);

      expect(mockContentIntelligenceService.addCreator).toHaveBeenCalled();
    });
  });

  describe('importCreators', () => {
    it('should import multiple creators', async () => {
      mockContentIntelligenceService.findByHandle.mockResolvedValue(null);
      mockContentIntelligenceService.addCreator.mockResolvedValue(mockCreator);

      await controller.importCreators(mockRequest, mockUser, {
        creators: [
          { handle: '@creator1', platform: 'twitter' },
          { handle: '@creator2', platform: 'instagram' },
        ],
      } as any);

      expect(mockContentIntelligenceService.addCreator).toHaveBeenCalledTimes(
        2,
      );
    });

    it('should skip existing creators', async () => {
      mockContentIntelligenceService.findByHandle
        .mockResolvedValueOnce(mockCreator)
        .mockResolvedValueOnce(null);
      mockContentIntelligenceService.addCreator.mockResolvedValue(mockCreator);

      await controller.importCreators(mockRequest, mockUser, {
        creators: [
          { handle: '@existing', platform: 'twitter' },
          { handle: '@new', platform: 'twitter' },
        ],
      } as any);

      expect(mockContentIntelligenceService.addCreator).toHaveBeenCalledTimes(
        1,
      );
    });
  });

  describe('analyze', () => {
    it('should trigger analysis for creator', async () => {
      mockContentIntelligenceService.findOne
        .mockResolvedValueOnce(mockCreator)
        .mockResolvedValueOnce({ ...mockCreator, status: 'analyzed' });
      mockPatternAnalyzerService.analyzeCreator.mockResolvedValue(undefined);

      await controller.analyze(
        mockRequest,
        mockUser,
        '507f1f77bcf86cd799439015',
      );

      expect(mockPatternAnalyzerService.analyzeCreator).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439015',
      );
    });

    it('should throw when creator not found', async () => {
      mockContentIntelligenceService.findOne.mockResolvedValue(null);

      await expect(
        controller.analyze(mockRequest, mockUser, '507f1f77bcf86cd799439015'),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('remove', () => {
    it('should delete creator and associated patterns', async () => {
      mockContentIntelligenceService.findOne.mockResolvedValue(mockCreator);
      mockPatternStoreService.deleteByCreator.mockResolvedValue(undefined);
      mockContentIntelligenceService.remove.mockResolvedValue({
        ...mockCreator,
        isDeleted: true,
      });

      await controller.remove(
        mockRequest,
        mockUser,
        '507f1f77bcf86cd799439015',
      );

      expect(mockPatternStoreService.deleteByCreator).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439015',
      );
      expect(mockContentIntelligenceService.remove).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439015',
      );
    });

    it('should throw when creator not found', async () => {
      mockContentIntelligenceService.findOne.mockResolvedValue(null);

      await expect(
        controller.remove(mockRequest, mockUser, '507f1f77bcf86cd799439015'),
      ).rejects.toThrow(HttpException);
    });
  });
});
