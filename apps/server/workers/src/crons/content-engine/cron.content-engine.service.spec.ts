import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { ContentExecutionService } from '@api/services/content-engine/content-execution.service';
import { ContentPlannerService } from '@api/services/content-engine/content-planner.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { CronContentEngineService } from '@workers/crons/content-engine/cron.content-engine.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockBrand = {
  agentConfig: {
    autoPublish: { enabled: true },
    strategy: {
      contentTypes: ['video', 'image'],
      frequency: 'daily',
      goals: ['growth', 'engagement'],
      platforms: ['instagram', 'tiktok'],
    },
  },
  id: 'brand-id-1',
  isActive: true,
  isDeleted: false,
  organizationId: 'org-id-1',
  userId: 'user-id-1',
};

const mockPlan = {
  id: 'plan-id-1',
};

const mockExecutionResult = {
  results: [{ postId: 'post-id-1' }, { postId: 'post-id-2' }, {}],
  summary: { completed: 2, failed: 0, total: 3 },
};

describe('CronContentEngineService', () => {
  let service: CronContentEngineService;
  let mockBrandsService: { find: ReturnType<typeof vi.fn> };
  let mockContentPlannerService: { generatePlan: ReturnType<typeof vi.fn> };
  let mockContentExecutionService: { executePlan: ReturnType<typeof vi.fn> };
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

      // BaseService.find applies the soft-delete filter itself, so the cron
      // only narrows on isActive.
      expect(mockBrandsService.find).toHaveBeenCalledWith(
        expect.objectContaining({
          isActive: true,
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

    it('should continue processing remaining brands when one brand fails', async () => {
      const brand2 = {
        ...mockBrand,
        id: 'brand-id-2',
        organizationId: 'org-id-2',
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
        id: `brand-id-${i}`,
        organizationId: `org-id-${i}`,
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
      const brandNoUser = { ...mockBrand, userId: undefined };
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
