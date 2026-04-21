import { BrandMemoryService } from '@api/collections/brand-memory/services/brand-memory.service';
import { BrandMemorySyncService } from '@api/services/brand-memory/brand-memory-sync.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ContentType, CredentialPlatform } from '@genfeedai/enums';
import { type ContentPerformance } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('BrandMemorySyncService', () => {
  let service: BrandMemorySyncService;

  const mockContentPerformanceModel = {
    find: vi.fn(),
    findOne: vi.fn(),
  };

  const mockBrandMemoryService = {
    logEntry: vi.fn(),
    updateMetrics: vi.fn(),
  };

  const mockLogger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const orgId = 'test-object-id'.toString();
  const brandId = 'test-object-id'.toString();
  const postId = 'test-object-id'.toString();

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BrandMemorySyncService,
        { provide: PrismaService, useValue: mockContentPerformanceModel },
        {
          provide: BrandMemoryService,
          useValue: mockBrandMemoryService,
        },
        {
          provide: LoggerService,
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get<BrandMemorySyncService>(BrandMemorySyncService);
  });

  it('should sync post performance into brand memory', async () => {
    mockContentPerformanceModel.findOne.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        lean: () => ({
          exec: async () => ({
            brand: new string(brandId),
            comments: 12,
            contentType: ContentType.VIDEO,
            engagementRate: 7.2,
            likes: 100,
            measuredAt: new Date('2026-02-25T10:00:00.000Z'),
            platform: CredentialPlatform.INSTAGRAM,
            post: new string(postId),
            saves: 9,
            shares: 4,
            views: 1800,
          }),
        }),
      }),
    });

    await service.syncPostPerformance(orgId, brandId, postId);

    expect(mockBrandMemoryService.logEntry).toHaveBeenCalled();
    expect(mockBrandMemoryService.updateMetrics).toHaveBeenCalledWith(
      orgId,
      brandId,
      expect.objectContaining({
        avgEngagementRate: 7.2,
        postsPublished: 1,
        totalEngagement: 125,
      }),
    );
  });

  it('should detect spike and drop alerts', async () => {
    const recentDocs = [
      {
        engagementRate: 10,
      },
      {
        engagementRate: 8,
      },
    ];

    const baselineDocs = [
      {
        engagementRate: 2,
      },
      {
        engagementRate: 3,
      },
      {
        engagementRate: 2.5,
      },
    ];

    mockContentPerformanceModel.find
      .mockReturnValueOnce({
        lean: () => ({
          exec: async () => recentDocs,
        }),
      })
      .mockReturnValueOnce({
        lean: () => ({
          exec: async () => baselineDocs,
        }),
      });

    const alerts = await service.detectThresholdAlerts(orgId, brandId);

    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0].type).toBe('spike');
  });

  it('should detect drop alerts when recent is far below baseline', async () => {
    const recentDocs = [{ engagementRate: 0.5 }, { engagementRate: 0.3 }];
    const baselineDocs = [
      { engagementRate: 5 },
      { engagementRate: 6 },
      { engagementRate: 4 },
    ];

    mockContentPerformanceModel.find
      .mockReturnValueOnce({
        lean: () => ({ exec: async () => recentDocs }),
      })
      .mockReturnValueOnce({
        lean: () => ({ exec: async () => baselineDocs }),
      });

    const alerts = await service.detectThresholdAlerts(orgId, brandId);
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0].type).toBe('drop');
  });

  it('should return empty alerts when engagement is stable', async () => {
    const recentDocs = [{ engagementRate: 5 }, { engagementRate: 5.5 }];
    const baselineDocs = [
      { engagementRate: 5 },
      { engagementRate: 5 },
      { engagementRate: 5 },
    ];

    mockContentPerformanceModel.find
      .mockReturnValueOnce({
        lean: () => ({ exec: async () => recentDocs }),
      })
      .mockReturnValueOnce({
        lean: () => ({ exec: async () => baselineDocs }),
      });

    const alerts = await service.detectThresholdAlerts(orgId, brandId);
    expect(alerts).toEqual([]);
  });

  it('should skip sync when no performance data exists', async () => {
    mockContentPerformanceModel.findOne.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        lean: () => ({ exec: async () => null }),
      }),
    });

    await service.syncPostPerformance(orgId, brandId, postId);

    expect(mockBrandMemoryService.logEntry).not.toHaveBeenCalled();
    expect(mockBrandMemoryService.updateMetrics).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it('should handle empty recent docs in detectThresholdAlerts', async () => {
    mockContentPerformanceModel.find
      .mockReturnValueOnce({
        lean: () => ({ exec: async () => [] }),
      })
      .mockReturnValueOnce({
        lean: () => ({ exec: async () => [{ engagementRate: 5 }] }),
      });

    const alerts = await service.detectThresholdAlerts(orgId, brandId);
    expect(alerts).toEqual([]);
  });
});
