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

    const finalUpdate = batchDelegate.updateMany.mock.calls.find((call) =>
      Boolean(call[0]?.data?.items),
    )?.[0];
    const failedItem = finalUpdate?.data?.items?.[0] as
      | { error?: string; status?: string }
      | undefined;
    expect(failedItem?.status).toBe(BatchItemStatus.FAILED);
    expect(failedItem?.error).toMatch(/credentialId/i);
    expect(failedItem?.error).not.toMatch(/handleRequestError/);
  });
});
