import { ContentGeneratorService } from '@api/collections/content-intelligence/services/content-generator.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { BatchGenerationProcessingService } from '@api/services/batch-generation/batch-generation-processing.service';
import { BatchGenerationSummaryService } from '@api/services/batch-generation/batch-generation-summary.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  BatchItemStatus,
  BatchStatus,
  ContentFormat,
  PostStatus,
} from '@genfeedai/enums';
import { CredentialPlatform } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('BatchGenerationProcessingService post.create credentials', () => {
  let service: BatchGenerationProcessingService;
  let postsService: { create: ReturnType<typeof vi.fn> };
  let contentGeneratorService: { generateContent: ReturnType<typeof vi.fn> };
  let batchDelegate: {
    findFirst: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  let credentialDelegate: { findFirst: ReturnType<typeof vi.fn> };
  let summaryService: {
    toBatchSummary: ReturnType<typeof vi.fn>;
  };

  const baseItem = {
    format: ContentFormat.IMAGE,
    id: 'item-1',
    platform: 'instagram',
    status: BatchItemStatus.PENDING,
  };

  const batchRecord = {
    brandId: 'brand-1',
    config: {
      topics: ['launch week'],
      totalCount: 1,
    },
    id: 'batch-1',
    isDeleted: false,
    items: [baseItem],
    organizationId: 'org-1',
    status: BatchStatus.PROCESSING,
    userId: 'user-1',
  };

  beforeEach(async () => {
    postsService = {
      create: vi.fn().mockResolvedValue({ id: 'post-1' }),
    };
    contentGeneratorService = {
      generateContent: vi
        .fn()
        .mockResolvedValue([
          { content: 'Generated caption about launch week' },
        ]),
    };
    batchDelegate = {
      findFirst: vi.fn().mockResolvedValue({
        ...batchRecord,
        items: [{ ...baseItem }],
        status: BatchStatus.PROCESSING,
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    };
    credentialDelegate = {
      findFirst: vi.fn().mockResolvedValue({ id: 'cred-instagram-1' }),
    };
    summaryService = {
      toBatchSummary: vi.fn().mockResolvedValue({
        completedCount: 1,
        failedCount: 0,
        id: 'batch-1',
        items: [],
        pendingCount: 0,
        status: BatchStatus.COMPLETED,
        totalCount: 1,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BatchGenerationProcessingService,
        {
          provide: PrismaService,
          useValue: {
            batch: batchDelegate,
            credential: credentialDelegate,
          },
        },
        {
          provide: LoggerService,
          useValue: {
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
        { provide: PostsService, useValue: postsService },
        {
          provide: ContentGeneratorService,
          useValue: contentGeneratorService,
        },
        {
          provide: BatchGenerationSummaryService,
          useValue: summaryService,
        },
      ],
    }).compile();

    service = module.get(BatchGenerationProcessingService);
  });

  it('resolves a connected brand credential with Prisma SCREAMING platform', async () => {
    await service.processBatch('batch-1', 'org-1');

    expect(credentialDelegate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { id: true },
        where: expect.objectContaining({
          brandId: 'brand-1',
          isConnected: true,
          isDeleted: false,
          organizationId: 'org-1',
          platform: CredentialPlatform.INSTAGRAM,
        }),
      }),
    );

    expect(postsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brand-1',
        credentialId: 'cred-instagram-1',
        organizationId: 'org-1',
        platform: 'instagram',
        status: PostStatus.DRAFT,
        userId: 'user-1',
      }),
    );
  });

  it('creates an untargeted draft when no credential matches', async () => {
    credentialDelegate.findFirst.mockResolvedValue(null);

    await service.processBatch('batch-1', 'org-1');

    expect(postsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brand-1',
        platform: 'instagram',
        status: PostStatus.DRAFT,
      }),
    );
    expect(postsService.create.mock.calls[0]?.[0]).not.toHaveProperty(
      'credentialId',
    );
  });

  it('stores an actionable failure message when post.create rejects', async () => {
    postsService.create.mockRejectedValue(
      new Error(
        'Null constraint violation on the fields: (`credentialId`)\n    at ri.handleRequestError',
      ),
    );

    await service.processBatch('batch-1', 'org-1');

    expect(batchDelegate.updateMany).toHaveBeenCalled();
    const lastUpdate = batchDelegate.updateMany.mock.calls.at(-1)?.[0];
    const items = lastUpdate?.data?.items as Array<{ error?: string }>;
    expect(items?.[0]?.error).toMatch(/missing or invalid "credentialId"/i);
  });
});

/**
 * Resume path (#2501): an API reload used to leave a batch PROCESSING with
 * nothing left to finish it. These cover the claim, what a resumed run keeps,
 * and what it regenerates.
 */
describe('BatchGenerationProcessingService resume', () => {
  let service: BatchGenerationProcessingService;
  let postsService: { create: ReturnType<typeof vi.fn> };
  let batchDelegate: {
    findFirst: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  let logger: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  /** A batch the previous run got halfway through before it was killed. */
  const strandedItems = [
    {
      format: ContentFormat.IMAGE,
      id: 'item-1',
      platform: 'instagram',
      postId: 'post-already-created',
      status: BatchItemStatus.COMPLETED,
      topic: 'launch week',
    },
    {
      format: ContentFormat.IMAGE,
      id: 'item-2',
      platform: 'instagram',
      status: BatchItemStatus.PROCESSING,
      topic: 'behind the scenes',
    },
  ];

  const strandedBatch = {
    brandId: 'brand-1',
    config: { resumeCount: 1, topics: ['launch week'], totalCount: 2 },
    id: 'batch-1',
    isDeleted: false,
    items: strandedItems,
    organizationId: 'org-1',
    status: BatchStatus.PROCESSING,
    userId: 'user-1',
  };

  beforeEach(async () => {
    postsService = { create: vi.fn().mockResolvedValue({ id: 'post-2' }) };
    logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
    batchDelegate = {
      findFirst: vi.fn().mockResolvedValue({
        ...strandedBatch,
        items: strandedItems.map((item) => ({ ...item })),
      }),
      // First claim (PENDING → PROCESSING) misses; the stale-lease reclaim wins.
      updateMany: vi
        .fn()
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValue({ count: 1 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BatchGenerationProcessingService,
        {
          provide: PrismaService,
          useValue: {
            batch: batchDelegate,
            credential: { findFirst: vi.fn().mockResolvedValue(null) },
          },
        },
        { provide: LoggerService, useValue: logger },
        { provide: PostsService, useValue: postsService },
        {
          provide: ContentGeneratorService,
          useValue: {
            generateContent: vi
              .fn()
              .mockResolvedValue([{ content: 'Resumed caption' }]),
          },
        },
        {
          provide: BatchGenerationSummaryService,
          useValue: {
            toBatchSummary: vi.fn().mockResolvedValue({
              completedCount: 2,
              failedCount: 0,
              id: 'batch-1',
              items: [],
              pendingCount: 0,
              status: BatchStatus.COMPLETED,
              totalCount: 2,
            }),
          },
        },
      ],
    }).compile();

    service = module.get(BatchGenerationProcessingService);
  });

  it('reclaims a PROCESSING batch whose lease has gone stale', async () => {
    await service.processBatch('batch-1', 'org-1');

    const reclaim = batchDelegate.updateMany.mock.calls[1]?.[0];
    expect(reclaim?.where).toEqual(
      expect.objectContaining({
        id: 'batch-1',
        organizationId: 'org-1',
        status: BatchStatus.PROCESSING,
        updatedAt: { lt: expect.any(Date) },
      }),
    );
  });

  it('regenerates only the item the dead run left in flight', async () => {
    await service.processBatch('batch-1', 'org-1');

    // item-1 already landed a post; regenerating it would bill it twice.
    expect(postsService.create).toHaveBeenCalledOnce();
    expect(postsService.create).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1' }),
    );
  });

  it('keeps the finished item and its post id through the resume', async () => {
    await service.processBatch('batch-1', 'org-1');

    const finalUpdate = batchDelegate.updateMany.mock.calls.at(-1)?.[0];
    const items = finalUpdate?.data?.items as Array<{
      postId?: string;
      status: string;
    }>;
    expect(items?.[0]).toEqual(
      expect.objectContaining({
        postId: 'post-already-created',
        status: BatchItemStatus.COMPLETED,
      }),
    );
    expect(items?.[1]?.status).toBe(BatchItemStatus.COMPLETED);
  });

  it('seeds the counters from what was already persisted', async () => {
    await service.processBatch('batch-1', 'org-1');

    const finalUpdate = batchDelegate.updateMany.mock.calls.at(-1)?.[0];
    const config = finalUpdate?.data?.config as {
      completedCount: number;
      failedCount: number;
      resumeCount?: number;
    };
    expect(config.completedCount).toBe(2);
    expect(config.failedCount).toBe(0);
    expect(config.resumeCount).toBe(2);
  });

  it('refuses the batch when neither claim wins', async () => {
    batchDelegate.updateMany.mockReset();
    batchDelegate.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.processBatch('batch-1', 'org-1')).rejects.toThrow(
      /already being processed/iu,
    );
    expect(postsService.create).not.toHaveBeenCalled();
  });
});
