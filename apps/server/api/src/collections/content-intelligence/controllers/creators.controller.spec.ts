vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_req, _serializer, data) => ({
    data: data.docs || data,
  })),
  serializeSingle: vi.fn((_req, _serializer, data) => ({ data })),
}));

vi.mock(
  '@api/collections/content-intelligence/schemas/creator-analysis.schema',
  () => ({
    CreatorAnalysis: { name: 'CreatorAnalysis' },
  }),
);

vi.mock('@api/helpers/utils/error-response/error-response.util', () => {
  const { HttpException, HttpStatus } = require('@nestjs/common');
  return {
    ErrorResponse: {
      notFound: vi.fn((resource: string, id: string) => {
        throw new HttpException(
          {
            detail: `${resource} with ID '${id}' not found`,
            status: HttpStatus.NOT_FOUND,
          },
          HttpStatus.NOT_FOUND,
        );
      }),
    },
  };
});

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreatorsController } from '@api/collections/content-intelligence/controllers/creators.controller';
import type { AddCreatorDto } from '@api/collections/content-intelligence/dto/add-creator.dto';
import type { ImportCreatorsDto } from '@api/collections/content-intelligence/dto/import-creators.dto';
import type { CreatorsQueryDto } from '@api/collections/content-intelligence/dto/patterns-query.dto';
import { ContentIntelligenceService } from '@api/collections/content-intelligence/services/content-intelligence.service';
import { PatternAnalyzerService } from '@api/collections/content-intelligence/services/pattern-analyzer.service';
import { PatternStoreService } from '@api/collections/content-intelligence/services/pattern-store.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('CreatorsController', () => {
  const userId = '550e8400-e29b-41d4-a716-446655440001';
  const organizationId = '550e8400-e29b-41d4-a716-446655440002';
  const brandId = '550e8400-e29b-41d4-a716-446655440003';
  const creatorId = '550e8400-e29b-41d4-a716-446655440004';
  let controller: CreatorsController;

  const mockUser = {
    id: 'user_123',
    brandId: brandId,
    organizationId: organizationId,
    userId: userId,
  } as unknown as User;

  const mockRequest = {
    originalUrl: '/api/content-intelligence/creators',
    query: {},
  } as Request;

  const mockCreator = {
    id: creatorId,
    handle: '@testcreator',
    organizationId,
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

      await controller.findAll(mockRequest, mockUser, {} as CreatorsQueryDto);

      expect(mockContentIntelligenceService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isDeleted: false,
            organizationId,
          }),
        }),
        expect.anything(),
      );
    });

    it('should filter by platform', async () => {
      mockContentIntelligenceService.findAll.mockResolvedValue({ docs: [] });

      await controller.findAll(mockRequest, mockUser, {
        platform: 'twitter',
      } as unknown as CreatorsQueryDto);

      expect(mockContentIntelligenceService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: [{ data: { equals: 'twitter', path: ['platform'] } }],
          }),
        }),
        expect.anything(),
      );
    });
  });

  describe('findOne', () => {
    it('should return a single creator', async () => {
      mockContentIntelligenceService.findOne.mockResolvedValue(mockCreator);

      await controller.findOne(mockRequest, mockUser, creatorId);

      expect(mockContentIntelligenceService.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          id: creatorId,
        }),
      );
    });

    it('should throw when creator not found', async () => {
      mockContentIntelligenceService.findOne.mockResolvedValue(null);

      await expect(
        controller.findOne(mockRequest, mockUser, creatorId),
      ).rejects.toThrow(HttpException);
    });

    it('should throw for an invalid entity ID', async () => {
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
      } as unknown as AddCreatorDto);

      expect(mockContentIntelligenceService.addCreator).not.toHaveBeenCalled();
    });

    it('should create new creator if not existing', async () => {
      mockContentIntelligenceService.findByHandle.mockResolvedValue(null);
      mockContentIntelligenceService.addCreator.mockResolvedValue(mockCreator);

      await controller.create(mockRequest, mockUser, {
        handle: '@newcreator',
        platform: 'twitter',
      } as unknown as AddCreatorDto);

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
      } as unknown as ImportCreatorsDto);

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
      } as unknown as ImportCreatorsDto);

      expect(mockContentIntelligenceService.addCreator).toHaveBeenCalledTimes(
        1,
      );
    });

    it('resolves distinct creators concurrently and reuses duplicate results', async () => {
      const pendingLookups: Array<() => void> = [];
      mockContentIntelligenceService.findByHandle.mockImplementation(
        () =>
          new Promise<null>((resolve) => {
            pendingLookups.push(() => resolve(null));
          }),
      );
      mockContentIntelligenceService.addCreator.mockResolvedValue(mockCreator);

      const resultPromise = controller.importCreators(mockRequest, mockUser, {
        creators: [
          { handle: '@creator1', platform: 'twitter' },
          { handle: '@creator2', platform: 'instagram' },
          { handle: '@creator1', platform: 'twitter' },
        ],
      } as unknown as ImportCreatorsDto);

      expect(mockContentIntelligenceService.findByHandle).toHaveBeenCalledTimes(
        2,
      );
      for (const resolveLookup of pendingLookups) {
        resolveLookup();
      }
      await resultPromise;

      expect(mockContentIntelligenceService.addCreator).toHaveBeenCalledTimes(
        2,
      );
    });
  });

  describe('analyze', () => {
    it('should trigger analysis for creator', async () => {
      mockContentIntelligenceService.findOne
        .mockResolvedValueOnce(mockCreator)
        .mockResolvedValueOnce({ ...mockCreator, status: 'analyzed' });
      mockPatternAnalyzerService.analyzeCreator.mockResolvedValue(undefined);

      await controller.analyze(mockRequest, mockUser, creatorId);

      expect(mockPatternAnalyzerService.analyzeCreator).toHaveBeenCalledWith(
        creatorId,
      );
    });

    it('should throw when creator not found', async () => {
      mockContentIntelligenceService.findOne.mockResolvedValue(null);

      await expect(
        controller.analyze(mockRequest, mockUser, creatorId),
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

      await controller.remove(mockRequest, mockUser, creatorId);

      expect(mockPatternStoreService.deleteByCreator).toHaveBeenCalledWith(
        creatorId,
        organizationId,
      );
      expect(mockContentIntelligenceService.remove).toHaveBeenCalledWith(
        creatorId,
      );
    });

    it('should throw when creator not found', async () => {
      mockContentIntelligenceService.findOne.mockResolvedValue(null);

      await expect(
        controller.remove(mockRequest, mockUser, creatorId),
      ).rejects.toThrow(HttpException);
    });
  });
});
