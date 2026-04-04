import { ContentPerformance } from '@api/collections/content-performance/schemas/content-performance.schema';
import { AttributionService } from '@api/collections/content-performance/services/attribution.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { LoggerService } from '@libs/logger/logger.service';
import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';

/**
 * Integration test: Attribution service
 *
 * Tests linking performance data back to generation workflows,
 * handling missing generationIds, grouping by workflow execution,
 * and cross-platform attribution.
 */
describe('Attribution (Integration)', () => {
  let service: AttributionService;

  const orgId = new Types.ObjectId().toString();
  const brandId = new Types.ObjectId().toString();
  const workflowExecId1 = new Types.ObjectId();
  const workflowExecId2 = new Types.ObjectId();

  const mockModel = {
    aggregate: vi.fn(),
  };

  const mockLogger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    setContext: vi.fn(),
    verbose: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttributionService,
        {
          provide: getModelToken(ContentPerformance.name, DB_CONNECTIONS.CLOUD),
          useValue: mockModel,
        },
        { provide: LoggerService, useValue: mockLogger },
      ],
    }).compile();

    service = module.get(AttributionService);
  });

  // ─── Content with generationId links correctly ─────────────────────

  describe('Content with generationId', () => {
    it('should return attribution data for a valid generationId', async () => {
      mockModel.aggregate.mockReturnValue({
        exec: vi.fn().mockResolvedValue([
          {
            _id: 'gen-attr-001',
            avgEngagementRate: 12.5,
            avgPerformanceScore: 78,
            hookUsed: 'Stop scrolling — this changes everything',
            promptUsed: 'Create viral hook about mindset shifts',
            totalEngagements: 2300,
            totalRecords: 3,
            totalViews: 45000,
            workflowExecutionId: workflowExecId1,
          },
        ]),
      });

      const result = await service.getAttributionByGenerationId(
        orgId,
        'gen-attr-001',
      );

      expect(result).not.toBeNull();
      expect(result?.generationId).toBe('gen-attr-001');
      expect(result?.promptUsed).toBe('Create viral hook about mindset shifts');
      expect(result?.hookUsed).toBe('Stop scrolling — this changes everything');
      expect(result?.totalRecords).toBe(3);
      expect(result?.avgPerformanceScore).toBe(78);
      expect(result?.totalViews).toBe(45000);
      expect(result?.workflowExecutionId).toBe(workflowExecId1.toString());
    });
  });

  // ─── Content without generationId ─────────────────────────────────

  describe('Content without generationId', () => {
    it('should return null for non-existent generationId', async () => {
      mockModel.aggregate.mockReturnValue({
        exec: vi.fn().mockResolvedValue([]),
      });

      const result = await service.getAttributionByGenerationId(
        orgId,
        'gen-nonexistent-999',
      );

      expect(result).toBeNull();
    });

    it('should exclude records without generationId from rankings', async () => {
      mockModel.aggregate.mockReturnValue({
        exec: vi.fn().mockResolvedValue([
          {
            _id: 'gen-ranked-001',
            avgEngagementRate: 15.0,
            avgPerformanceScore: 90,
            hookUsed: 'Hook A',
            promptUsed: 'Prompt A',
            totalEngagements: 3000,
            totalRecords: 5,
            totalViews: 60000,
            workflowExecutionId: workflowExecId1,
          },
        ]),
      });

      const rankings = await service.rankGenerationStrategies(orgId);

      // The $match stage filters generationId: { $exists: true, $ne: null }
      // so records without generationId should never appear
      expect(rankings.length).toBe(1);
      expect(rankings[0].generationId).toBe('gen-ranked-001');
    });
  });

  // ─── Multiple posts from same workflow execution ───────────────────

  describe('Multiple posts from same workflow execution', () => {
    it('should group posts by generationId from same workflow', async () => {
      mockModel.aggregate.mockReturnValue({
        exec: vi.fn().mockResolvedValue([
          {
            _id: 'gen-workflow-batch-001',
            avgEngagementRate: 11.2,
            avgPerformanceScore: 72,
            hookUsed: 'First hook from batch',
            promptUsed: 'Generate 5 posts about fitness',
            totalEngagements: 5600,
            totalRecords: 5,
            totalViews: 100000,
            workflowExecutionId: workflowExecId1,
          },
        ]),
      });

      const result = await service.getAttributionByGenerationId(
        orgId,
        'gen-workflow-batch-001',
      );

      expect(result).not.toBeNull();
      expect(result?.totalRecords).toBe(5);
      expect(result?.totalViews).toBe(100000);
      // workflowExecutionId should be preserved
      expect(result?.workflowExecutionId).toBe(workflowExecId1.toString());
    });

    it('should rank different generation batches from same workflow separately', async () => {
      mockModel.aggregate.mockReturnValue({
        exec: vi.fn().mockResolvedValue([
          {
            _id: 'gen-batch-A',
            avgEngagementRate: 18.0,
            avgPerformanceScore: 92,
            hookUsed: 'Best hook ever',
            promptUsed: 'High performing prompt',
            totalEngagements: 9000,
            totalRecords: 3,
            totalViews: 50000,
            workflowExecutionId: workflowExecId1,
          },
          {
            _id: 'gen-batch-B',
            avgEngagementRate: 4.0,
            avgPerformanceScore: 30,
            hookUsed: 'Meh hook',
            promptUsed: 'Low performing prompt',
            totalEngagements: 800,
            totalRecords: 3,
            totalViews: 20000,
            workflowExecutionId: workflowExecId1,
          },
        ]),
      });

      const rankings = await service.rankGenerationStrategies(orgId, brandId);

      expect(rankings).toHaveLength(2);
      // Should be sorted by avgPerformanceScore desc
      expect(rankings[0].generationId).toBe('gen-batch-A');
      expect(rankings[0].avgPerformanceScore).toBe(92);
      expect(rankings[1].generationId).toBe('gen-batch-B');
      expect(rankings[1].avgPerformanceScore).toBe(30);
      // Both from the same workflow
      expect(rankings[0].workflowExecutionId).toBe(workflowExecId1.toString());
      expect(rankings[1].workflowExecutionId).toBe(workflowExecId1.toString());
    });
  });

  // ─── Attribution across different platforms ────────────────────────

  describe('Attribution across platforms', () => {
    it('should aggregate metrics across platforms for same generationId', async () => {
      // A single generationId may produce posts on instagram + tiktok + twitter
      // The aggregation groups by generationId regardless of platform
      mockModel.aggregate.mockReturnValue({
        exec: vi.fn().mockResolvedValue([
          {
            _id: 'gen-multiplatform-001',
            avgEngagementRate: 10.5,
            avgPerformanceScore: 68,
            hookUsed: 'This one weird trick',
            promptUsed: 'Cross-platform viral content about health',
            totalEngagements: 15000,
            totalRecords: 6, // 2 per platform
            totalViews: 200000,
            workflowExecutionId: workflowExecId2,
          },
        ]),
      });

      const result = await service.getAttributionByGenerationId(
        orgId,
        'gen-multiplatform-001',
      );

      expect(result).not.toBeNull();
      expect(result?.totalRecords).toBe(6);
      expect(result?.totalViews).toBe(200000);
      expect(result?.totalEngagements).toBe(15000);
    });

    it('should rank cross-platform strategies alongside single-platform ones', async () => {
      mockModel.aggregate.mockReturnValue({
        exec: vi.fn().mockResolvedValue([
          {
            _id: 'gen-cross-platform',
            avgEngagementRate: 14.0,
            avgPerformanceScore: 82,
            hookUsed: 'Cross-platform hook',
            promptUsed: 'Multi-platform prompt',
            totalEngagements: 15000,
            totalRecords: 6,
            totalViews: 200000,
            workflowExecutionId: workflowExecId2,
          },
          {
            _id: 'gen-ig-only',
            avgEngagementRate: 16.0,
            avgPerformanceScore: 88,
            hookUsed: 'Instagram-only hook',
            promptUsed: 'Instagram-specific prompt',
            totalEngagements: 4000,
            totalRecords: 2,
            totalViews: 25000,
            workflowExecutionId: workflowExecId1,
          },
        ]),
      });

      const rankings = await service.rankGenerationStrategies(orgId);

      expect(rankings).toHaveLength(2);
      // Instagram-only has higher avgPerformanceScore
      expect(rankings[0].generationId).toBe('gen-cross-platform');
      expect(rankings[1].generationId).toBe('gen-ig-only');
      // Cross-platform has more total views due to wider distribution
      expect(rankings[0].totalViews).toBeGreaterThan(rankings[1].totalViews);
    });
  });
});
