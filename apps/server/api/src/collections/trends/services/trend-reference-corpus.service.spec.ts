import { TrendRemixLineage } from '@api/collections/trends/schemas/trend-remix-lineage.schema';
import { TrendSourceReference } from '@api/collections/trends/schemas/trend-source-reference.schema';
import { TrendSourceReferenceLink } from '@api/collections/trends/schemas/trend-source-reference-link.schema';
import { TrendSourceReferenceSnapshot } from '@api/collections/trends/schemas/trend-source-reference-snapshot.schema';
import { TrendReferenceCorpusService } from '@api/collections/trends/services/trend-reference-corpus.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { LoggerService } from '@libs/logger/logger.service';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';

describe('TrendReferenceCorpusService', () => {
  let service: TrendReferenceCorpusService;
  let referenceModel: {
    aggregate: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
    findOneAndUpdate: ReturnType<typeof vi.fn>;
  };
  let snapshotModel: {
    updateOne: ReturnType<typeof vi.fn>;
  };
  let linkModel: {
    find: ReturnType<typeof vi.fn>;
    updateOne: ReturnType<typeof vi.fn>;
  };
  let lineageModel: {
    aggregate: ReturnType<typeof vi.fn>;
    updateOne: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    referenceModel = {
      aggregate: vi.fn(),
      find: vi.fn(),
      findOneAndUpdate: vi.fn(),
    };
    snapshotModel = {
      updateOne: vi.fn().mockResolvedValue({ upsertedCount: 1 }),
    };
    linkModel = {
      find: vi.fn(),
      updateOne: vi.fn().mockResolvedValue({ upsertedCount: 1 }),
    };
    lineageModel = {
      aggregate: vi.fn(),
      updateOne: vi.fn().mockResolvedValue({ acknowledged: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrendReferenceCorpusService,
        {
          provide: getModelToken(
            TrendSourceReference.name,
            DB_CONNECTIONS.CLOUD,
          ),
          useValue: referenceModel,
        },
        {
          provide: getModelToken(
            TrendSourceReferenceSnapshot.name,
            DB_CONNECTIONS.CLOUD,
          ),
          useValue: snapshotModel,
        },
        {
          provide: getModelToken(
            TrendSourceReferenceLink.name,
            DB_CONNECTIONS.CLOUD,
          ),
          useValue: linkModel,
        },
        {
          provide: getModelToken(TrendRemixLineage.name, DB_CONNECTIONS.CLOUD),
          useValue: lineageModel,
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
  });

  it('syncs references, snapshots, and trend links from saved source previews', async () => {
    const referenceId = new Types.ObjectId();
    referenceModel.findOneAndUpdate.mockResolvedValue({
      _id: referenceId,
    });

    const result = await service.syncTrendReferences([
      {
        id: new Types.ObjectId().toString(),
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

    expect(referenceModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalUrl: 'https://x.com/builder/status/1',
        platform: 'twitter',
      }),
      expect.any(Object),
      expect.objectContaining({
        upsert: true,
      }),
    );
    expect(snapshotModel.updateOne).toHaveBeenCalled();
    expect(linkModel.updateOne).toHaveBeenCalled();
    expect(result).toEqual({
      links: 1,
      references: 1,
      snapshots: 1,
    });
  });

  it('returns ranked reference accounts with brand remix counts', async () => {
    referenceModel.aggregate.mockResolvedValue([
      {
        _id: {
          authorHandle: 'builder',
          platform: 'twitter',
        },
        avgTrendViralityScore: 72,
        lastSeenAt: new Date('2026-03-25T00:00:00.000Z'),
        referenceCount: 4,
        totalEngagement: 5000,
      },
    ]);
    lineageModel.aggregate.mockResolvedValue([
      {
        _id: {
          authorHandle: 'builder',
          platform: 'twitter',
        },
        brandRemixCount: 3,
      },
    ]);

    const result = await service.getTopReferenceAccounts(
      '507f1f77bcf86cd799439012',
      '507f1f77bcf86cd799439013',
      {
        platform: 'twitter',
      },
    );

    expect(result).toEqual({
      accounts: [
        {
          authorHandle: 'builder',
          avgTrendViralityScore: 72,
          brandRemixCount: 3,
          lastSeenAt: '2026-03-25T00:00:00.000Z',
          platform: 'twitter',
          referenceCount: 4,
          totalEngagement: 5000,
        },
      ],
      totalAccounts: 1,
    });
  });
});
