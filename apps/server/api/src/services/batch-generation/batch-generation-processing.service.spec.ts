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

  it('skips the credential lookup for an unmappable platform', async () => {
    // `toPrismaCredentialPlatform` returns undefined for unknown platforms.
    // Querying anyway would put `platform: undefined` into the where clause,
    // which `normalizeWhere` drops — silently matching ANY connected credential
    // for the brand and cross-wiring the draft to the wrong account.
    useBatchItems([{ ...baseItem, platform: 'myspace' }]);

    await service.processBatch('batch-1', 'org-1');

    expect(credentialDelegate.findFirst).not.toHaveBeenCalled();
    expect(postsService.create.mock.calls[0]?.[0]).not.toHaveProperty(
      'credentialId',
    );
  });

  it('skips the credential lookup when the item has a blank platform', async () => {
    useBatchItems([{ ...baseItem, platform: '   ' }]);

    await service.processBatch('batch-1', 'org-1');

    expect(credentialDelegate.findFirst).not.toHaveBeenCalled();
    const created = postsService.create.mock.calls[0]?.[0];
    expect(created).not.toHaveProperty('credentialId');
    expect(created?.platform).toBeUndefined();
  });

  it('normalizes a hyphenated platform for both the credential and the post', async () => {
    useBatchItems([{ ...baseItem, platform: 'google-ads' }]);
    credentialDelegate.findFirst.mockResolvedValue({ id: 'cred-google-ads-1' });

    await service.processBatch('batch-1', 'org-1');

    expect(credentialDelegate.findFirst).toHaveBeenCalledWith(
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
