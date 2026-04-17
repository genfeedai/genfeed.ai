import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { PatternType } from '@genfeedai/interfaces';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreativePatternsService } from './creative-patterns.service';
import {
  CreativePattern,
  type CreativePatternDocument,
} from './schemas/creative-pattern.schema';

const makePattern = (
  overrides: Partial<CreativePatternDocument> = {},
): CreativePatternDocument =>
  ({
    _id: '507f191e810c19729de860ee',
    avgPerformanceScore: 0.8,
    brand: null,
    industry: null,
    isDeleted: false,
    organization: '507f191e810c19729de860ee',
    patternType: 'hook' as PatternType,
    platform: 'instagram',
    scope: 'private',
    validUntil: new Date(Date.now() + 86400 * 1000),
    ...overrides,
  }) as unknown as CreativePatternDocument;

describe('CreativePatternsService', () => {
  let service: CreativePatternsService;

  const mockModel = {
    find: vi.fn(),
    findOneAndUpdate: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreativePatternsService,
        { provide: PrismaService, useValue: mockModel },
      ],
    }).compile();

    service = module.get<CreativePatternsService>(CreativePatternsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('upsertPattern()', () => {
    it('should call findOneAndUpdate with upsert option', async () => {
      const pattern = makePattern();
      mockModel.findOneAndUpdate.mockResolvedValue(pattern);

      const result = await service.upsertPattern({
        organization: pattern.organization,
        patternType: 'hook' as PatternType,
        platform: 'instagram',
        scope: 'private',
      });

      expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ patternType: 'hook', platform: 'instagram' }),
        expect.objectContaining({ $set: expect.any(Object) }),
        { new: true, upsert: true },
      );
      expect(result).toBe(pattern);
    });

    it('should use null for missing optional filter fields', async () => {
      const pattern = makePattern();
      mockModel.findOneAndUpdate.mockResolvedValue(pattern);

      await service.upsertPattern({
        patternType: 'hook' as PatternType,
        scope: 'public',
      });

      const [filter] = mockModel.findOneAndUpdate.mock.calls[0];
      expect(filter.brand).toBeNull();
      expect(filter.industry).toBeNull();
      expect(filter.platform).toBeNull();
    });
  });

  describe('findTopForBrand()', () => {
    it('should query both public and private patterns', async () => {
      const patterns = [makePattern()];
      const mockQuery = {
        exec: vi.fn().mockResolvedValue(patterns),
        lean: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
      };
      mockModel.find.mockReturnValue(mockQuery);

      const orgId = '507f191e810c19729de860ee'.toString();
      const brandId = '507f191e810c19729de860ee'.toString();
      const result = await service.findTopForBrand(orgId, brandId);

      expect(mockModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          $or: expect.arrayContaining([
            expect.objectContaining({ scope: 'public' }),
            expect.objectContaining({ scope: 'private' }),
          ]),
        }),
      );
      expect(result).toEqual(patterns);
    });

    it('should apply default limit of 10', async () => {
      const mockQuery = {
        exec: vi.fn().mockResolvedValue([]),
        lean: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
      };
      mockModel.find.mockReturnValue(mockQuery);

      await service.findTopForBrand(
        '507f191e810c19729de860ee'.toString(),
        '507f191e810c19729de860ee'.toString(),
      );

      expect(mockQuery.limit).toHaveBeenCalledWith(10);
    });

    it('should respect custom limit option', async () => {
      const mockQuery = {
        exec: vi.fn().mockResolvedValue([]),
        lean: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
      };
      mockModel.find.mockReturnValue(mockQuery);

      await service.findTopForBrand(
        '507f191e810c19729de860ee'.toString(),
        '507f191e810c19729de860ee'.toString(),
        { limit: 5 },
      );

      expect(mockQuery.limit).toHaveBeenCalledWith(5);
    });

    it('should add patternType filter when provided', async () => {
      const mockQuery = {
        exec: vi.fn().mockResolvedValue([]),
        lean: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
      };
      mockModel.find.mockReturnValue(mockQuery);

      await service.findTopForBrand(
        '507f191e810c19729de860ee'.toString(),
        '507f191e810c19729de860ee'.toString(),
        {
          patternTypes: ['hook' as PatternType],
        },
      );

      expect(mockModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          patternType: { $in: ['hook'] },
        }),
      );
    });
  });

  describe('findAll()', () => {
    it('should return patterns sorted by avgPerformanceScore', async () => {
      const patterns = [makePattern(), makePattern()];
      const mockQuery = {
        exec: vi.fn().mockResolvedValue(patterns),
        lean: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
      };
      mockModel.find.mockReturnValue(mockQuery);

      const result = await service.findAll({});

      expect(mockQuery.sort).toHaveBeenCalledWith({ avgPerformanceScore: -1 });
      expect(result).toEqual(patterns);
    });

    it('should apply platform filter when provided', async () => {
      const mockQuery = {
        exec: vi.fn().mockResolvedValue([]),
        lean: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
      };
      mockModel.find.mockReturnValue(mockQuery);

      await service.findAll({ platform: 'tiktok' });

      expect(mockModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ platform: 'tiktok' }),
      );
    });

    it('should apply scope filter when provided', async () => {
      const mockQuery = {
        exec: vi.fn().mockResolvedValue([]),
        lean: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
      };
      mockModel.find.mockReturnValue(mockQuery);

      await service.findAll({ scope: 'public' });

      expect(mockModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ scope: 'public' }),
      );
    });

    it('should always filter isDeleted: false', async () => {
      const mockQuery = {
        exec: vi.fn().mockResolvedValue([]),
        lean: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
      };
      mockModel.find.mockReturnValue(mockQuery);

      await service.findAll({});

      expect(mockModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ isDeleted: false }),
      );
    });
  });
});
