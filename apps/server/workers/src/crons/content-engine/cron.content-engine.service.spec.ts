import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { ContentExecutionService } from '@api/services/content-engine/content-execution.service';
import { ContentPlannerService } from '@api/services/content-engine/content-planner.service';
import { ContentReviewService } from '@api/services/content-engine/content-review.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { CronContentEngineService } from '@workers/crons/content-engine/cron.content-engine.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockBrand = {
  _id: 'brand-id-1',
  agentConfig: {
    strategy: {
      contentTypes: ['video', 'image'],
      frequency: 'daily',
      goals: ['growth', 'engagement'],
      platforms: ['instagram', 'tiktok'],
    },
  },
  isActive: true,
  isDeleted: false,
  organization: { toString: () => 'org-id-1' },
  user: { toString: () => 'user-id-1' },
};

const mockPlan = {
  _id: 'plan-id-1',
};

const mockExecutionResult = {
  results: [
    { contentDraftId: 'draft-id-1' },
    { contentDraftId: 'draft-id-2' },
    { contentDraftId: null },
  ],
  summary: { completed: 2, failed: 0, total: 3 },
};

describe('CronContentEngineService', () => {
  let service: CronContentEngineService;
  let mockBrandsService: { find: ReturnType<typeof vi.fn> };
  let mockContentPlannerService: { generatePlan: ReturnType<typeof vi.fn> };
  let mockContentExecutionService: { executePlan: ReturnType<typeof vi.fn> };
  let mockContentReviewService: {
    autoApproveIfEligible: ReturnType<typeof vi.fn>;
  };
  let mockCacheService: {
    acquireLock: ReturnType<typeof vi.fn>;
    releaseLock: ReturnType<typeof vi.fn>;
  };
  let mockLogger: {
    log: ReturnType<typeof vi.fn>;
    debug: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    mockBrandsService = {
      find: vi.fn().mockResolvedValue([mockBrand]),
    };

    mockContentPlannerService = {
      generatePlan: vi
        .fn()
        .mockResolvedValue({ items: [1, 2, 3], plan: mockPlan }),
    };

    mockContentExecutionService = {
      executePlan: vi.fn().mockResolvedValue(mockExecutionResult),
    };

    mockContentReviewService = {
      autoApproveIfEligible: vi.fn().mockResolvedValue(undefined),
    };

    mockCacheService = {
      acquireLock: vi.fn().mockResolvedValue(true),
      releaseLock: vi.fn().mockResolvedValue(undefined),
    };

    mockLogger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CronContentEngineService,
        { provide: BrandsService, useValue: mockBrandsService },
        { provide: ContentPlannerService, useValue: mockContentPlannerService },
        {
          provide: ContentExecutionService,
          useValue: mockContentExecutionService,
        },
        { provide: ContentReviewService, useValue: mockContentReviewService },
        { provide: CacheService, useValue: mockCacheService },
        { provide: LoggerService, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<CronContentEngineService>(CronContentEngineService);
  });

  describe('processContentEngine', () => {
    it('should skip processing when lock cannot be acquired', async () => {
      mockCacheService.acquireLock.mockResolvedValue(false);

      await service.processContentEngine();

      expect(mockBrandsService.find).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('lock held'),
        expect.any(String),
      );
    });

    it('should query brands with correct filters', async () => {
      await service.processContentEngine();

      expect(mockBrandsService.find).toHaveBeenCalledWith(
        expect.objectContaining({
          'agentConfig.autoPublish.enabled': true,
          isActive: true,
          isDeleted: false,
        }),
      );
    });

    it('should release lock after successful processing', async () => {
      await service.processContentEngine();

      expect(mockCacheService.releaseLock).toHaveBeenCalledWith(
        expect.stringContaining('content-engine'),
      );
    });

    it('should release lock even when processing fails', async () => {
      mockBrandsService.find.mockRejectedValue(new Error('DB error'));

      await service.processContentEngine();

      expect(mockCacheService.releaseLock).toHaveBeenCalled();
    });

    it('should call generatePlan for each eligible brand', async () => {
      await service.processContentEngine();

      expect(mockContentPlannerService.generatePlan).toHaveBeenCalledWith(
        'org-id-1',
        'brand-id-1',
        'user-id-1',
        expect.objectContaining({
          itemCount: 5,
          platforms: ['instagram', 'tiktok'],
          topics: ['growth', 'engagement'],
        }),
      );
    });

    it('should call executePlan after generating plan', async () => {
      await service.processContentEngine();

      expect(mockContentExecutionService.executePlan).toHaveBeenCalledWith(
        'org-id-1',
        'brand-id-1',
        'plan-id-1',
        'user-id-1',
      );
    });

    it('should call autoApproveIfEligible for each draft with id', async () => {
      await service.processContentEngine();

      // Should be called for draft-id-1 and draft-id-2, but NOT null
      expect(
        mockContentReviewService.autoApproveIfEligible,
      ).toHaveBeenCalledTimes(2);
      expect(
        mockContentReviewService.autoApproveIfEligible,
      ).toHaveBeenCalledWith('org-id-1', 'brand-id-1', 'draft-id-1');
      expect(
        mockContentReviewService.autoApproveIfEligible,
      ).toHaveBeenCalledWith('org-id-1', 'brand-id-1', 'draft-id-2');
    });

    it('should continue processing remaining brands when one brand fails', async () => {
      const brand2 = {
        ...mockBrand,
        _id: 'brand-id-2',
        organization: { toString: () => 'org-id-2' },
      };
      mockBrandsService.find.mockResolvedValue([mockBrand, brand2]);
      mockContentPlannerService.generatePlan
        .mockRejectedValueOnce(new Error('Plan generation failed'))
        .mockResolvedValueOnce({ items: [1], plan: mockPlan });

      await service.processContentEngine();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('brand-id-1'),
        expect.any(String),
      );
      // Second brand still processed
      expect(mockContentPlannerService.generatePlan).toHaveBeenCalledTimes(2);
    });

    it('should limit brands to MAX_BRANDS_PER_CYCLE (10)', async () => {
      const manyBrands = Array.from({ length: 15 }, (_, i) => ({
        ...mockBrand,
        _id: `brand-id-${i}`,
        organization: { toString: () => `org-id-${i}` },
      }));
      mockBrandsService.find.mockResolvedValue(manyBrands);

      await service.processContentEngine();

      expect(mockContentPlannerService.generatePlan).toHaveBeenCalledTimes(10);
    });

    it('should skip brand when strategy has no contentTypes', async () => {
      const brandNoStrategy = {
        ...mockBrand,
        agentConfig: { strategy: { contentTypes: [] } },
      };
      mockBrandsService.find.mockResolvedValue([brandNoStrategy]);

      await service.processContentEngine();

      expect(mockContentPlannerService.generatePlan).not.toHaveBeenCalled();
    });

    it('should use organization as userId when brand.user is not set', async () => {
      const brandNoUser = { ...mockBrand, user: undefined };
      mockBrandsService.find.mockResolvedValue([brandNoUser]);

      await service.processContentEngine();

      expect(mockContentPlannerService.generatePlan).toHaveBeenCalledWith(
        'org-id-1',
        'brand-id-1',
        'org-id-1', // falls back to org
        expect.any(Object),
      );
    });
  });
});
