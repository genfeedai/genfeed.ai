import { TrendReferenceCorpusService } from '@api/collections/trends/services/trend-reference-corpus.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('TrendReferenceCorpusService', () => {
  let service: TrendReferenceCorpusService;
  let prisma: {
    trendRemixLineage: {
      create: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    trendSourceReference: {
      count: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    trendSourceReferenceLink: {
      create: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
    trendSourceReferenceSnapshot: {
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(async () => {
    prisma = {
      trendRemixLineage: {
        create: vi.fn().mockResolvedValue({ id: 'lineage-1' }),
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockResolvedValue({}),
      },
      trendSourceReference: {
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn().mockResolvedValue({ data: {}, id: 'ref-1' }),
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockResolvedValue({ data: {}, id: 'ref-1' }),
      },
      trendSourceReferenceLink: {
        create: vi.fn().mockResolvedValue({ id: 'link-1' }),
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
      trendSourceReferenceSnapshot: {
        create: vi.fn().mockResolvedValue({ id: 'snap-1' }),
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockResolvedValue({}),
      },
    };

    const module = await Test.createTestingModule({
      providers: [
        TrendReferenceCorpusService,
        {
          provide: PrismaService,
          useValue: prisma,
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

    service = module.get(TrendReferenceCorpusService);

    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('syncs references, snapshots, and trend links from saved source previews', async () => {
    // findMany returns empty list (no existing ref), so create path is taken
    prisma.trendSourceReference.findMany.mockResolvedValue([]);
    prisma.trendSourceReference.create.mockResolvedValue({
      data: {
        canonicalUrl: 'https://x.com/builder/status/1',
        platform: 'twitter',
      },
      id: 'ref-new',
    });
    prisma.trendSourceReferenceSnapshot.findMany.mockResolvedValue([]);
    prisma.trendSourceReferenceLink.findFirst.mockResolvedValue(null);

    const result = await service.syncTrendReferences([
      {
        id: 'trend-id-1',
        mentions: 2200,
        platform: 'twitter',
        sourcePreview: [
          {
            authorHandle: 'builder',
            contentType: 'tweet',
            id: 'tweet-1',
            metrics: {
              likes: 100,
              views: 1000,
            },
            platform: 'twitter',
            sourceUrl: 'https://x.com/builder/status/1?utm=test',
            text: 'Actual tweet',
          },
        ],
        sourcePreviewState: 'live',
        topic: '#AIAgents',
        viralityScore: 88,
      },
    ]);

    // URL should be normalized (query stripped)
    expect(prisma.trendSourceReference.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          data: expect.objectContaining({
            canonicalUrl: 'https://x.com/builder/status/1',
            platform: 'twitter',
          }),
        }),
      }),
    );
    expect(prisma.trendSourceReferenceSnapshot.create).toHaveBeenCalled();
    expect(prisma.trendSourceReferenceLink.create).toHaveBeenCalled();
    expect(result).toEqual({
      links: 1,
      references: 1,
      snapshots: 1,
    });
  });

  it('returns ranked reference accounts with brand remix counts', async () => {
    const orgId = '507f1f77bcf86cd799439012';
    const bId = '507f1f77bcf86cd799439013';

    // References with authorHandle
    prisma.trendSourceReference.findMany.mockResolvedValue([
      {
        data: {
          authorHandle: 'builder',
          currentEngagementTotal: 5000,
          lastSeenAt: '2026-03-25T00:00:00.000Z',
          latestTrendViralityScore: 72,
          platform: 'twitter',
        },
        id: 'ref-1',
      },
    ]);

    // Lineages with source references
    prisma.trendRemixLineage.findMany.mockResolvedValue([
      {
        id: 'lineage-1',
        sourceReferences: [
          {
            data: {
              authorHandle: 'builder',
              platform: 'twitter',
            },
            id: 'ref-1',
          },
          {
            data: {
              authorHandle: 'builder',
              platform: 'twitter',
            },
            id: 'ref-1',
          },
          {
            data: {
              authorHandle: 'builder',
              platform: 'twitter',
            },
            id: 'ref-1',
          },
        ],
      },
    ]);

    const result = await service.getTopReferenceAccounts(orgId, bId, {
      platform: 'twitter',
    });

    expect(result.accounts).toHaveLength(1);
    expect(result.accounts[0]).toMatchObject({
      authorHandle: 'builder',
      avgTrendViralityScore: 72,
      brandRemixCount: 3,
      platform: 'twitter',
      referenceCount: 1,
      totalEngagement: 5000,
    });
    expect(result.totalAccounts).toBe(1);
  });

  it('countGlobalReferences returns prisma count', async () => {
    prisma.trendSourceReference.count.mockResolvedValue(42);

    const result = await service.countGlobalReferences();

    expect(result).toBe(42);
    expect(prisma.trendSourceReference.count).toHaveBeenCalledWith({
      where: { isDeleted: false },
    });
  });
});
