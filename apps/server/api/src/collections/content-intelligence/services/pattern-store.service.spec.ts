import { ContentPattern } from '@api/collections/content-intelligence/schemas/content-pattern.schema';
import { PatternStoreService } from '@api/collections/content-intelligence/services/pattern-store.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import {
  ContentIntelligencePlatform,
  ContentPatternType,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const makePatternDto = (overrides: Record<string, unknown> = {}) => ({
  description: 'A test pattern',
  embedding: [],
  extractedFormula: 'Hook + CTA',
  organization: new Types.ObjectId(),
  patternType: ContentPatternType.HOOK,
  placeholders: ['topic'],
  platform: ContentIntelligencePlatform.TWITTER,
  rawExample: 'Did you know {topic}?',
  sourceMetrics: {
    comments: 50,
    engagementRate: 0.05,
    likes: 100,
    shares: 20,
    views: 5000,
    viralScore: 0.8,
  },
  tags: ['viral'],
  ...overrides,
});

describe('PatternStoreService', () => {
  let service: PatternStoreService;
  let model: Record<string, ReturnType<typeof vi.fn>>;

  const mockDoc = {
    _id: new Types.ObjectId(),
    ...makePatternDto(),
    isDeleted: false,
    relevanceWeight: 1.0,
    usageCount: 0,
  };

  beforeEach(async () => {
    model = {
      aggregate: vi.fn(),
      aggregatePaginate: vi.fn().mockResolvedValue({ docs: [mockDoc] }),
      create: vi.fn().mockResolvedValue(mockDoc),
      deleteMany: vi.fn(),
      find: vi.fn(),
      findById: vi.fn(),
      findByIdAndDelete: vi.fn(),
      findByIdAndUpdate: vi.fn().mockResolvedValue(mockDoc),
      findOne: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
    };

    // Make model callable (BaseService constructor pattern)
    const callableModel = Object.assign(
      vi.fn().mockImplementation((dto: Record<string, unknown>) => ({
        ...dto,
        save: vi.fn().mockResolvedValue({ ...mockDoc, ...dto }),
      })),
      model,
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PatternStoreService,
        {
          provide: getModelToken(ContentPattern.name, DB_CONNECTIONS.CLOUD),
          useValue: callableModel,
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
    }).compile();

    service = module.get<PatternStoreService>(PatternStoreService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── storePattern ───────────────────────────────────────────────────────────

  describe('storePattern', () => {
    it('should call create with relevanceWeight and usageCount defaults', async () => {
      const createSpy = vi
        .spyOn(service, 'create')
        .mockResolvedValue(mockDoc as never);
      const dto = makePatternDto();

      await service.storePattern(dto as never);

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          relevanceWeight: 1.0,
          usageCount: 0,
        }),
      );
    });

    it('should return the created document', async () => {
      vi.spyOn(service, 'create').mockResolvedValue(mockDoc as never);
      const result = await service.storePattern(makePatternDto() as never);
      expect(result).toBe(mockDoc);
    });
  });

  // ─── storeBulkPatterns ──────────────────────────────────────────────────────

  describe('storeBulkPatterns', () => {
    it('should store each pattern sequentially', async () => {
      const storePatternSpy = vi
        .spyOn(service, 'storePattern')
        .mockResolvedValue(mockDoc as never);
      const patterns = [makePatternDto(), makePatternDto()];

      const results = await service.storeBulkPatterns(patterns as never);

      expect(storePatternSpy).toHaveBeenCalledTimes(2);
      expect(results).toHaveLength(2);
    });

    it('should return empty array for empty input', async () => {
      const results = await service.storeBulkPatterns([]);
      expect(results).toEqual([]);
    });
  });

  // ─── findByOrganization ─────────────────────────────────────────────────────

  describe('findByOrganization', () => {
    it('should query with organization and isDeleted filters', async () => {
      const findAllSpy = vi
        .spyOn(service, 'findAll')
        .mockResolvedValue({ docs: [mockDoc] } as never);
      const orgId = new Types.ObjectId();

      await service.findByOrganization(orgId);

      expect(findAllSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            $match: expect.objectContaining({
              isDeleted: false,
              organization: orgId,
            }),
          }),
        ]),
        { pagination: false },
      );
    });

    it('should apply platform filter when provided', async () => {
      const findAllSpy = vi
        .spyOn(service, 'findAll')
        .mockResolvedValue({ docs: [] } as never);
      const orgId = new Types.ObjectId();

      await service.findByOrganization(orgId, {
        platform: ContentIntelligencePlatform.TWITTER,
      });

      expect(findAllSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            $match: expect.objectContaining({
              platform: ContentIntelligencePlatform.TWITTER,
            }),
          }),
        ]),
        { pagination: false },
      );
    });

    it('should apply patternType filter when provided', async () => {
      const findAllSpy = vi
        .spyOn(service, 'findAll')
        .mockResolvedValue({ docs: [] } as never);
      const orgId = new Types.ObjectId();

      await service.findByOrganization(orgId, {
        patternType: ContentPatternType.HOOK,
      });

      expect(findAllSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            $match: expect.objectContaining({
              patternType: ContentPatternType.HOOK,
            }),
          }),
        ]),
        { pagination: false },
      );
    });

    it('should apply tags filter with $in operator', async () => {
      const findAllSpy = vi
        .spyOn(service, 'findAll')
        .mockResolvedValue({ docs: [] } as never);
      const orgId = new Types.ObjectId();

      await service.findByOrganization(orgId, { tags: ['viral', 'trending'] });

      expect(findAllSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            $match: expect.objectContaining({
              tags: { $in: ['viral', 'trending'] },
            }),
          }),
        ]),
        { pagination: false },
      );
    });

    it('should apply minRelevanceWeight filter with $gte', async () => {
      const findAllSpy = vi
        .spyOn(service, 'findAll')
        .mockResolvedValue({ docs: [] } as never);
      const orgId = new Types.ObjectId();

      await service.findByOrganization(orgId, { minRelevanceWeight: 0.5 });

      expect(findAllSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            $match: expect.objectContaining({
              relevanceWeight: { $gte: 0.5 },
            }),
          }),
        ]),
        { pagination: false },
      );
    });

    it('should return docs from aggregation result', async () => {
      vi.spyOn(service, 'findAll').mockResolvedValue({
        docs: [mockDoc],
      } as never);
      const orgId = new Types.ObjectId();

      const result = await service.findByOrganization(orgId);
      expect(result).toEqual([mockDoc]);
    });
  });

  // ─── findHooks ──────────────────────────────────────────────────────────────

  describe('findHooks', () => {
    it('should filter by HOOK patternType and organization', async () => {
      const findAllSpy = vi
        .spyOn(service, 'findAll')
        .mockResolvedValue({ docs: [] } as never);
      const orgId = new Types.ObjectId();

      await service.findHooks(orgId);

      expect(findAllSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            $match: expect.objectContaining({
              isDeleted: false,
              organization: orgId,
              patternType: ContentPatternType.HOOK,
            }),
          }),
        ]),
        { pagination: false },
      );
    });

    it('should apply platform filter when provided', async () => {
      const findAllSpy = vi
        .spyOn(service, 'findAll')
        .mockResolvedValue({ docs: [] } as never);
      const orgId = new Types.ObjectId();

      await service.findHooks(orgId, ContentIntelligencePlatform.TWITTER);

      expect(findAllSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            $match: expect.objectContaining({
              platform: ContentIntelligencePlatform.TWITTER,
            }),
          }),
        ]),
        { pagination: false },
      );
    });

    it('should include $limit stage', async () => {
      const findAllSpy = vi
        .spyOn(service, 'findAll')
        .mockResolvedValue({ docs: [] } as never);
      const orgId = new Types.ObjectId();

      await service.findHooks(orgId, undefined, 10);

      expect(findAllSpy).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ $limit: 10 })]),
        { pagination: false },
      );
    });
  });

  // ─── incrementUsage ─────────────────────────────────────────────────────────

  describe('incrementUsage', () => {
    it('should call patchAll with $inc operator', async () => {
      const patchAllSpy = vi
        .spyOn(service, 'patchAll')
        .mockResolvedValue({ modifiedCount: 1 } as never);
      const id = new Types.ObjectId();

      await service.incrementUsage(id);

      expect(patchAllSpy).toHaveBeenCalledWith(
        { _id: new Types.ObjectId(id.toString()) },
        { $inc: { usageCount: 1 } },
      );
    });
  });

  // ─── updateRelevanceWeight ──────────────────────────────────────────────────

  describe('updateRelevanceWeight', () => {
    it('should clamp weight between 0 and 1', async () => {
      const patchSpy = vi
        .spyOn(service, 'patch')
        .mockResolvedValue(mockDoc as never);
      const id = new Types.ObjectId();

      await service.updateRelevanceWeight(id, 1.5);
      expect(patchSpy).toHaveBeenCalledWith(id, { relevanceWeight: 1 });

      await service.updateRelevanceWeight(id, -0.5);
      expect(patchSpy).toHaveBeenCalledWith(id, { relevanceWeight: 0 });

      await service.updateRelevanceWeight(id, 0.7);
      expect(patchSpy).toHaveBeenCalledWith(id, { relevanceWeight: 0.7 });
    });
  });

  // ─── deleteByCreator ────────────────────────────────────────────────────────

  describe('deleteByCreator', () => {
    it('should soft-delete all patterns for a creator', async () => {
      const patchAllSpy = vi
        .spyOn(service, 'patchAll')
        .mockResolvedValue({ modifiedCount: 3 } as never);
      const creatorId = new Types.ObjectId();

      const result = await service.deleteByCreator(creatorId);

      expect(patchAllSpy).toHaveBeenCalledWith(
        { isDeleted: false, sourceCreator: creatorId },
        { $set: { isDeleted: true } },
      );
      expect(result).toEqual({ count: 3 });
    });
  });
});
