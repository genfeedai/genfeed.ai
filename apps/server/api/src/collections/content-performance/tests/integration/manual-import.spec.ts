import {
  ContentPerformance,
  PerformanceSource,
} from '@api/collections/content-performance/schemas/content-performance.schema';
import { ContentPerformanceService } from '@api/collections/content-performance/services/content-performance.service';
import { Post } from '@api/collections/posts/schemas/post.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';

/**
 * Integration test: Manual data import
 *
 * Tests bulk CSV import, single manual entry, error handling,
 * and that imported data surfaces in queries/summaries.
 */
describe('Manual Import (Integration)', () => {
  let service: ContentPerformanceService;

  const orgId = '507f191e810c19729de860ee'.toString();
  const userId = '507f191e810c19729de860ee'.toString();
  const brandId = '507f191e810c19729de860ee'.toString();

  const mockBrandFindOne = vi.fn().mockResolvedValue({ _id: 'brand-id' });
  const mockSave = vi.fn();

  // Model mock must support both constructor usage (BaseService.create) and static methods
  class MockModel {
    constructor(data: Record<string, unknown>) {
      Object.assign(this, data);
    }

    save() {
      return mockSave();
    }

    static aggregate = vi.fn().mockReturnThis();
    static aggregatePaginate = vi.fn();
    static collection = { name: 'content-performance' };
    static create = vi.fn();
    static db = {
      collection: vi.fn().mockReturnValue({ findOne: mockBrandFindOne }),
    };
    static exec = vi.fn();
    static find = vi.fn().mockReturnThis();
    static findById = vi.fn().mockReturnThis();
    static findOne = vi.fn().mockReturnThis();
    static insertMany = vi.fn();
    static limit = vi.fn().mockReturnThis();
    static modelName = 'ContentPerformance';
    static sort = vi.fn().mockReturnThis();
  }

  const mockModel = MockModel;

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
        ContentPerformanceService,
        { provide: PrismaService, useValue: mockModel },
        { provide: LoggerService, useValue: mockLogger },
      ],
    }).compile();

    service = module.get(ContentPerformanceService);
  });

  // ─── Bulk import via ManualInputDto ────────────────────────────────

  describe('Bulk import metrics', () => {
    it('should insert multiple entries with MANUAL source', async () => {
      const entries = [
        {
          clicks: 20,
          comments: 80,
          contentType: 'image' as any,
          likes: 400,
          measuredAt: '2026-02-10T00:00:00.000Z',
          platform: 'instagram' as any,
          saves: 100,
          shares: 50,
          views: 5000,
        },
        {
          clicks: 100,
          comments: 300,
          contentType: 'video' as any,
          likes: 1500,
          measuredAt: '2026-02-10T00:00:00.000Z',
          platform: 'tiktok' as any,
          saves: 200,
          shares: 400,
          views: 20000,
        },
        {
          clicks: 40,
          comments: 120,
          contentType: 'carousel' as any,
          likes: 600,
          measuredAt: '2026-02-11T00:00:00.000Z',
          platform: 'instagram' as any,
          saves: 150,
          shares: 80,
          views: 8000,
        },
      ];

      const insertedDocs = entries.map((e, i) => ({
        _id: '507f191e810c19729de860ee',
        ...e,
        brand: brandId,
        engagementRate: 10 + i * 2,
        organization: orgId,
        performanceScore: 50 + i * 10,
        source: PerformanceSource.MANUAL,
        user: userId,
      }));

      mockModel.insertMany.mockResolvedValue(insertedDocs);

      const result = await service.bulkManualImport(
        { brand: brandId, entries },
        orgId,
        userId,
      );

      expect(mockModel.insertMany).toHaveBeenCalledTimes(1);
      const insertArg = mockModel.insertMany.mock.calls[0][0];
      expect(insertArg).toHaveLength(3);

      // All entries should have MANUAL source
      for (const record of insertArg) {
        expect(record.source).toBe(PerformanceSource.MANUAL);
        expect(record.organization.toString()).toBe(orgId);
        expect(record.user.toString()).toBe(userId);
        expect(record.brand.toString()).toBe(brandId);
      }

      expect(result).toHaveLength(3);
    });

    it('should compute performanceScore and engagementRate for each entry', async () => {
      const entries = [
        {
          comments: 100,
          contentType: 'image' as any,
          likes: 500,
          measuredAt: '2026-02-10T00:00:00.000Z',
          platform: 'instagram' as any,
          saves: 50,
          shares: 50,
          views: 10000,
        },
      ];

      mockModel.insertMany.mockImplementation(
        (records: Record<string, unknown>[]) => records,
      );

      const _result = await service.bulkManualImport(
        { brand: brandId, entries },
        orgId,
        userId,
      );

      const inserted = mockModel.insertMany.mock.calls[0][0][0];
      // engagementRate = (500+100+50+50)/10000*100 = 7.0
      expect(inserted.engagementRate).toBeCloseTo(7.0, 1);
      // performanceScore = min(100, round(7.0 * 10)) = 70
      // Actually: (500+100+50+50+0)/10000*100=7, score = min(100, 70) = 70
      expect(inserted.performanceScore).toBe(70);
    });
  });

  // ─── Single manual entry ───────────────────────────────────────────

  describe('Single manual entry', () => {
    it('should create a single performance record via createPerformance', async () => {
      const mockDoc = {
        _id: '507f191e810c19729de860ee',
        brand: brandId,
        views: 3000,
      };
      mockSave.mockResolvedValue(mockDoc);

      const result = await service.createPerformance(
        {
          brand: brandId,
          clicks: 10,
          comments: 40,
          contentType: 'image' as any,
          likes: 200,
          measuredAt: '2026-02-12T00:00:00.000Z',
          platform: 'instagram' as any,
          saves: 25,
          shares: 30,
          source: PerformanceSource.MANUAL,
          views: 3000,
        },
        orgId,
        userId,
      );

      expect(mockSave).toHaveBeenCalledTimes(1);
      expect(result).toBeDefined();
    });
  });

  // ─── Error handling ────────────────────────────────────────────────

  describe('Error handling', () => {
    it('should handle empty entries array gracefully', async () => {
      mockModel.insertMany.mockResolvedValue([]);

      const result = await service.bulkManualImport(
        { brand: brandId, entries: [] },
        orgId,
        userId,
      );

      expect(result).toHaveLength(0);
    });

    it('should propagate database errors', async () => {
      mockModel.insertMany.mockRejectedValue(
        new Error('Database connection failed'),
      );

      await expect(
        service.bulkManualImport(
          {
            brand: brandId,
            entries: [
              {
                contentType: 'image' as any,
                measuredAt: '2026-02-10T00:00:00.000Z',
                platform: 'instagram' as any,
                views: 100,
              },
            ],
          },
          orgId,
          userId,
        ),
      ).rejects.toThrow('Database connection failed');
    });

    it('should handle zero views gracefully (no division by zero)', async () => {
      mockModel.insertMany.mockImplementation(
        (records: Record<string, unknown>[]) => records,
      );

      await service.bulkManualImport(
        {
          brand: brandId,
          entries: [
            {
              contentType: 'image' as any,
              likes: 0,
              measuredAt: '2026-02-10T00:00:00.000Z',
              platform: 'instagram' as any,
              views: 0,
            },
          ],
        },
        orgId,
        userId,
      );

      const inserted = mockModel.insertMany.mock.calls[0][0][0];
      expect(inserted.engagementRate).toBe(0);
      expect(inserted.performanceScore).toBe(0);
    });
  });

  // ─── Verify imported data appears in queries ───────────────────────

  describe('Imported data appears in queries', () => {
    it('should return manually imported records when queried', async () => {
      const importedRecords = [
        {
          _id: '507f191e810c19729de860ee',
          isDeleted: false,
          likes: 400,
          performanceScore: 80,
          platform: 'instagram',
          source: PerformanceSource.MANUAL,
          views: 5000,
        },
        {
          _id: '507f191e810c19729de860ee',
          isDeleted: false,
          likes: 1500,
          performanceScore: 90,
          platform: 'tiktok',
          source: PerformanceSource.MANUAL,
          views: 20000,
        },
      ];

      mockModel.exec.mockResolvedValue(importedRecords);

      const results = await service.queryPerformance({ brand: brandId }, orgId);

      expect(results).toHaveLength(2);
      expect(
        results.every(
          (r: { source: string }) => r.source === PerformanceSource.MANUAL,
        ),
      ).toBe(true);
    });

    it('should include manual entries in top performers', async () => {
      const topRecords = [
        {
          _id: '507f191e810c19729de860ee',
          performanceScore: 95,
          source: PerformanceSource.MANUAL,
          views: 50000,
        },
      ];

      mockModel.exec.mockResolvedValue(topRecords);

      const results = await service.getTopPerformers(orgId, brandId, 5);

      expect(results).toHaveLength(1);
      expect(results[0].performanceScore).toBe(95);
    });
  });
});
