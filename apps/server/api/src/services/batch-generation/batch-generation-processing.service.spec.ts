import { ContentGeneratorService } from '@api/collections/content-intelligence/services/content-generator.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { BatchGenerationProcessingService } from '@api/services/batch-generation/batch-generation-processing.service';
import { BatchGenerationSummaryService } from '@api/services/batch-generation/batch-generation-summary.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  BatchItemStatus,
  BatchStatus,
  ContentFormat,
  Platform,
  PostVisibility,
  TargetExecutionState,
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
  let credentialDelegate: { findMany: ReturnType<typeof vi.fn> };
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

  /**
   * Repoint the batch delegate at a specific item set so a test can exercise
   * multi-item batches or per-item platform shapes. `totalCount` follows the
   * item count so the PARTIAL/COMPLETED branch resolves the way it does in
   * production.
   */
  function useBatchItems(items: Array<Record<string, unknown>>): void {
    batchDelegate.findFirst.mockImplementation(() =>
      Promise.resolve({
        ...batchRecord,
        config: { ...batchRecord.config, totalCount: items.length },
        items: items.map((item) => ({ ...item })),
        status: BatchStatus.PROCESSING,
      }),
    );
  }

  /** Data written by the finalizing `updateMany` at the end of processBatch. */
  function finalUpdatePayload(): {
    config?: { completedCount?: number; failedCount?: number };
    items?: Array<{ error?: string; status?: string }>;
    status?: string;
  } {
    return batchDelegate.updateMany.mock.calls.at(-1)?.[0]?.data ?? {};
  }

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
      findMany: vi.fn().mockResolvedValue([{ id: 'cred-instagram-1' }]),
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
            batchItem: { upsert: vi.fn().mockResolvedValue({}) },
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

    expect(credentialDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: 'asc' },
        select: { id: true },
        take: 2,
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
        targetExecutionState: TargetExecutionState.DRAFT,
        userId: 'user-1',
        visibility: PostVisibility.PUBLIC,
      }),
    );
  });

  it('creates an untargeted draft when no credential matches', async () => {
    credentialDelegate.findMany.mockResolvedValue([]);

    await service.processBatch('batch-1', 'org-1');

    expect(postsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brand-1',
        platform: 'instagram',
        targetExecutionState: TargetExecutionState.DRAFT,
        visibility: PostVisibility.PUBLIC,
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

  it('fails the item for an unmappable platform without generating content (#2696)', async () => {
    // Malformed platforms must not burn LLM credits or create posts. Create-time
    // normalize should catch most cases; this is the process-time backstop.
    useBatchItems([{ ...baseItem, platform: 'myspace' }]);

    await service.processBatch('batch-1', 'org-1');

    expect(contentGeneratorService.generateContent).not.toHaveBeenCalled();
    expect(credentialDelegate.findMany).not.toHaveBeenCalled();
    expect(postsService.create).not.toHaveBeenCalled();
    expect(finalUpdatePayload().items?.[0]?.status).toBe(
      BatchItemStatus.FAILED,
    );
    expect(finalUpdatePayload().items?.[0]?.error).toMatch(
      /Invalid batch item platform/i,
    );
  });

  it('expands empty topics into distinct angles and passes prior captions', async () => {
    contentGeneratorService.generateContent
      .mockResolvedValueOnce([{ content: 'First unique caption about A' }])
      .mockResolvedValueOnce([{ content: 'Second unique caption about B' }]);

    useBatchItems([
      { ...baseItem, id: 'item-1', platform: 'twitter' },
      {
        ...baseItem,
        format: ContentFormat.IMAGE,
        id: 'item-2',
        platform: 'twitter',
        status: BatchItemStatus.PENDING,
      },
    ]);
    batchDelegate.findFirst.mockImplementation(() =>
      Promise.resolve({
        ...batchRecord,
        config: {
          platforms: ['twitter'],
          style: 'bold creator voice',
          topics: [],
          totalCount: 2,
        },
        items: [
          {
            format: ContentFormat.IMAGE,
            id: 'item-1',
            platform: 'twitter',
            status: BatchItemStatus.PENDING,
          },
          {
            format: ContentFormat.IMAGE,
            id: 'item-2',
            platform: 'twitter',
            status: BatchItemStatus.PENDING,
          },
        ],
        status: BatchStatus.PROCESSING,
      }),
    );

    await service.processBatch('batch-1', 'org-1');

    expect(contentGeneratorService.generateContent).toHaveBeenCalledTimes(2);

    const firstCall =
      contentGeneratorService.generateContent.mock.calls[0]?.[1];
    const secondCall =
      contentGeneratorService.generateContent.mock.calls[1]?.[1];

    expect(firstCall.topic).toContain('bold creator voice');
    expect(firstCall.topic).not.toBe(secondCall.topic);
    expect(secondCall.additionalContext?.join('\n')).toContain(
      'First unique caption about A',
    );
    expect(secondCall.additionalContext?.join('\n')).toContain(
      'do not rewrite',
    );
  });

  it('skips the credential lookup when the item has a blank platform', async () => {
    useBatchItems([{ ...baseItem, platform: '   ' }]);

    await service.processBatch('batch-1', 'org-1');

    expect(credentialDelegate.findMany).not.toHaveBeenCalled();
    const created = postsService.create.mock.calls[0]?.[0];
    expect(created).not.toHaveProperty('credentialId');
    expect(created?.platform).toBeUndefined();
  });

  it('normalizes a hyphenated platform for both the credential and the post', async () => {
    useBatchItems([{ ...baseItem, platform: 'google-ads' }]);
    credentialDelegate.findMany.mockResolvedValue([
      { id: 'cred-google-ads-1' },
    ]);

    await service.processBatch('batch-1', 'org-1');

    expect(credentialDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          platform: CredentialPlatform.GOOGLE_ADS,
        }),
      }),
    );
    expect(postsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        credentialId: 'cred-google-ads-1',
        platform: 'google_ads',
      }),
    );
  });

  it('persists the canonical DEVTO domain spelling, not a lowercased raw value', async () => {
    // Lowercasing the raw input yields `dev_to`; the domain value is `devto`.
    // Two spellings in `posts.platform` for one platform means every
    // platform-filtered read misses half the rows.
    useBatchItems([{ ...baseItem, platform: 'dev-to' }]);
    credentialDelegate.findMany.mockResolvedValue([{ id: 'cred-devto-1' }]);

    await service.processBatch('batch-1', 'org-1');

    expect(credentialDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          platform: CredentialPlatform.DEVTO,
        }),
      }),
    );
    expect(postsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        credentialId: 'cred-devto-1',
        platform: Platform.DEV_TO,
      }),
    );
  });

  it('resolves the "x" alias to twitter on both the credential and the post', async () => {
    useBatchItems([{ ...baseItem, platform: 'X' }]);
    credentialDelegate.findMany.mockResolvedValue([{ id: 'cred-twitter-1' }]);

    await service.processBatch('batch-1', 'org-1');

    expect(credentialDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          platform: CredentialPlatform.TWITTER,
        }),
      }),
    );
    expect(postsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        credentialId: 'cred-twitter-1',
        platform: Platform.TWITTER,
      }),
    );
  });

  it('surfaces only the first line of a generic error, not the raw stack dump', async () => {
    postsService.create.mockRejectedValue(
      new Error(
        'Post creation rejected by validation\n    at PostsService.create\n    at processTicksAndRejections',
      ),
    );

    await service.processBatch('batch-1', 'org-1');

    const error = finalUpdatePayload().items?.[0]?.error;
    expect(error).toBe('Post creation rejected by validation');
    expect(error).not.toContain('at PostsService.create');
  });

  it('isolates per-item failures and finalizes a mixed batch as PARTIAL', async () => {
    useBatchItems([
      { ...baseItem, id: 'item-1' },
      { ...baseItem, id: 'item-2' },
    ]);
    postsService.create
      .mockResolvedValueOnce({ id: 'post-1' })
      .mockRejectedValueOnce(
        new Error('Null constraint violation on the fields: (`credentialId`)'),
      );

    await service.processBatch('batch-1', 'org-1');

    const payload = finalUpdatePayload();
    expect(payload.status).toBe('PARTIAL');
    expect(payload.config?.completedCount).toBe(1);
    expect(payload.config?.failedCount).toBe(1);

    // The failure must stay attached to the item that caused it.
    expect(payload.items?.[0]?.status).toBe(BatchItemStatus.COMPLETED);
    expect(payload.items?.[0]?.error).toBeUndefined();
    expect(payload.items?.[1]?.status).toBe(BatchItemStatus.FAILED);
    expect(payload.items?.[1]?.error).toMatch(
      /missing or invalid "credentialId"/i,
    );
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
        // `config` is mutated in place on resume, so each test needs its own
        // copy — a shared reference makes resumeCount accumulate across tests.
        config: { ...strandedBatch.config },
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
            batchItem: { upsert: vi.fn().mockResolvedValue({}) },
            credential: { findMany: vi.fn().mockResolvedValue([]) },
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
