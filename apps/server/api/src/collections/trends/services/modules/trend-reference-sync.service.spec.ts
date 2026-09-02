import { TrendReferenceSyncService } from '@api/collections/trends/services/modules/trend-reference-sync.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';

describe('TrendReferenceSyncService', () => {
  const loggerService = {
    warn: vi.fn(),
  };
  const prisma = {
    trendSourceReference: {
      create: vi.fn().mockResolvedValue({ id: 'reference_1' }),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
    },
    trendSourceReferenceLink: {
      create: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    trendSourceReferenceSnapshot: {
      create: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
    },
  };

  let service: TrendReferenceSyncService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TrendReferenceSyncService(
      prisma as unknown as PrismaService,
      loggerService as unknown as LoggerService,
    );
  });

  it('reports the persisted reference, snapshot, and link counts', async () => {
    const result = await service.syncTrendReferences([
      {
        id: 'trend_1',
        mentions: 12,
        platform: 'tiktok',
        sourcePreview: [
          {
            contentType: 'video',
            id: 'source_1',
            metrics: { likes: 4, shares: 2, views: 20 },
            platform: 'tiktok',
            sourceUrl: 'https://example.com/reference?utm_source=test',
          },
        ],
        sourcePreviewState: 'live',
        topic: 'ai tools',
        viralityScore: 80,
      },
    ]);

    expect(result).toEqual({ links: 1, references: 1, snapshots: 1 });
    expect(prisma.trendSourceReference.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          canonicalUrl: 'https://example.com/reference',
          currentEngagementTotal: 26,
        }),
      }),
    );
  });

  it('propagates persistence failures instead of reporting partial success', async () => {
    prisma.trendSourceReference.create.mockRejectedValueOnce(
      new Error('database unavailable'),
    );

    await expect(
      service.syncTrendReferences([
        {
          id: 'trend_1',
          mentions: 12,
          platform: 'tiktok',
          sourcePreview: [
            {
              contentType: 'video',
              id: 'source_1',
              platform: 'tiktok',
              sourceUrl: 'https://example.com/reference',
            },
          ],
          sourcePreviewState: 'live',
          topic: 'ai tools',
          viralityScore: 80,
        },
      ]),
    ).rejects.toThrow('database unavailable');
    expect(prisma.trendSourceReferenceSnapshot.create).not.toHaveBeenCalled();
    expect(prisma.trendSourceReferenceLink.create).not.toHaveBeenCalled();
  });
});
