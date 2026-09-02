vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { ContentGeneratorService } from '@api/collections/content-intelligence/services/content-generator.service';
import { PostVariationService } from '@api/collections/posts/services/post-variation.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { TrendReferenceCorpusService } from '@api/collections/trends/services/trend-reference-corpus.service';
import type { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { BatchGenerationService } from '@api/services/batch-generation/batch-generation.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ContentIntelligencePlatform } from '@genfeedai/contracts';

describe('PostVariationService', () => {
  const contentGeneratorService = { generateContent: vi.fn() };
  const batchGenerationService = { createManualReviewBatch: vi.fn() };
  const postsService = { findAllByOrganization: vi.fn() };
  const trendReferenceCorpusService = { recordPostRemixLineage: vi.fn() };
  const cacheInvalidationService = { invalidateByTags: vi.fn() };
  const prisma = {
    brand: { findFirst: vi.fn() },
    post: { updateMany: vi.fn() },
  };
  let service: PostVariationService;

  const baseParams = {
    brandId: 'brand-1',
    count: 3,
    organizationId: 'org-1',
    platform: ContentIntelligencePlatform.LINKEDIN,
    source: {
      id: 'source-post-1',
      kind: 'source-post' as const,
      platform: 'linkedin',
      text: 'A source argument about building a durable content operating system.',
    },
    userId: 'user-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PostVariationService(
      prisma as unknown as PrismaService,
      contentGeneratorService as unknown as ContentGeneratorService,
      batchGenerationService as unknown as BatchGenerationService,
      postsService as unknown as PostsService,
      trendReferenceCorpusService as unknown as TrendReferenceCorpusService,
      cacheInvalidationService as unknown as CacheInvalidationService,
    );
    prisma.brand.findFirst.mockResolvedValue({
      agentConfig: { voice: { style: 'direct and practical' } },
    });
    prisma.post.updateMany.mockResolvedValue({ count: 1 });
    contentGeneratorService.generateContent.mockResolvedValue([
      { content: 'Open with the hidden cost of a scattered content stack.' },
      {
        content: 'Tell the story of one idea moving from research to revenue.',
      },
      { content: 'Use a checklist to explain a durable publishing system.' },
    ]);
    batchGenerationService.createManualReviewBatch.mockImplementation(
      async (dto: { items: Array<{ caption: string }> }) => ({
        id: 'batch-1',
        items: dto.items.map((item, index) => ({
          caption: item.caption,
          id: `item-${index + 1}`,
          postId: `post-${index + 1}`,
        })),
      }),
    );
    cacheInvalidationService.invalidateByTags.mockResolvedValue(0);
    postsService.findAllByOrganization.mockImplementation(
      async (_organizationId: string, filters: { id: string[] }) =>
        filters.id.map((id) => ({
          brandId: 'brand-1',
          description: `Description for ${id}`,
          id,
          organizationId: 'org-1',
          platform: 'linkedin',
        })),
    );
  });

  it('passes N plus bounded source and brand context into generation and groups review drafts', async () => {
    const result = await service.generate(baseParams);

    expect(contentGeneratorService.generateContent).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        additionalContext: expect.arrayContaining([
          expect.stringContaining('Authorized source content'),
          expect.stringContaining('durable content operating system'),
        ]),
        brandId: 'brand-1',
        variationsCount: 3,
      }),
    );
    expect(batchGenerationService.createManualReviewBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({
            sourceActionId: 'source-post-1',
            sourceWorkflowName: 'source-post-variations',
          }),
        ]),
      }),
      'user-1',
      'org-1',
    );
    const updates = prisma.post.updateMany.mock.calls.map(
      ([call]) =>
        (
          call as {
            data: {
              groupId: string;
              order: number;
              sourceActionId: string;
              sourceWorkflowId: string;
              variantId: string;
            };
          }
        ).data,
    );
    expect(new Set(updates.map((update) => update.groupId)).size).toBe(1);
    expect(updates.map((update) => update.order)).toEqual([0, 1, 2]);
    expect(updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceActionId: 'source-post-1',
          sourceWorkflowId: updates[0]?.groupId,
          variantId: `${updates[0]?.groupId}:1/3`,
        }),
      ]),
    );
    expect(result.meta).toMatchObject({
      actualCount: 3,
      creditCost: 3,
      requestedCount: 3,
      reviewBatchId: 'batch-1',
      voiceMode: 'brand-voice',
    });
  });

  it('returns partial success for source copies and duplicates without padding', async () => {
    prisma.brand.findFirst.mockResolvedValue({ agentConfig: {} });
    contentGeneratorService.generateContent.mockResolvedValue([
      { content: baseParams.source.text },
      {
        content:
          'A new operator story about building a repeatable publishing loop.',
      },
      {
        content:
          'A new operator story about building a repeatable publishing loop!',
      },
    ]);

    const result = await service.generate(baseParams);

    expect(result.posts).toHaveLength(1);
    expect(result.meta).toMatchObject({
      actualCount: 1,
      creditCost: 1,
      voiceMode: 'organization-defaults',
      voiceModeLabel: 'Organization defaults (no brand voice configured)',
    });
    expect(result.meta.partialReason).toContain('Generated 1 of 3');
    const batchInput = batchGenerationService.createManualReviewBatch.mock
      .calls[0]?.[0] as { items: unknown[] };
    expect(batchInput.items).toHaveLength(1);
  });

  it('reads the persisted variations with one scoped query and invalidates post caches after the update batch', async () => {
    const result = await service.generate(baseParams);

    expect(postsService.findAllByOrganization).toHaveBeenCalledTimes(1);
    expect(postsService.findAllByOrganization).toHaveBeenCalledWith('org-1', {
      brandId: 'brand-1',
      id: ['post-1', 'post-2', 'post-3'],
    });
    expect(result.posts.map((post) => post.id)).toEqual([
      'post-1',
      'post-2',
      'post-3',
    ]);
    expect(cacheInvalidationService.invalidateByTags).toHaveBeenCalledWith([
      'post',
      'collection:post',
      'query:post',
      'query:paginated:post',
      'posts',
    ]);
    expect(
      cacheInvalidationService.invalidateByTags.mock.invocationCallOrder[0],
    ).toBeGreaterThan(
      prisma.post.updateMany.mock.invocationCallOrder.at(-1) ?? 0,
    );
  });

  it('still reports missing persisted variations as not-found errors', async () => {
    postsService.findAllByOrganization.mockImplementation(
      async (_organizationId: string, filters: { id: string[] }) =>
        filters.id
          .filter((id) => id !== 'post-2')
          .map((id) => ({ description: `Description for ${id}`, id })),
    );

    await expect(service.generate(baseParams)).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.generate(baseParams)).rejects.toThrow(
      "Post with identifier 'post-2' not found",
    );
  });

  it('treats false and zero voice values as no configured brand voice', async () => {
    prisma.brand.findFirst.mockResolvedValue({
      agentConfig: { voice: { enabled: false, intensity: 0 } },
    });

    const result = await service.generate(baseParams);

    expect(result.meta.voiceMode).toBe('organization-defaults');
    expect(result.meta.voiceModeLabel).toBe(
      'Organization defaults (no brand voice configured)',
    );
  });

  it('records tenant-safe imported reference lineage for every persisted variation', async () => {
    const result = await service.generate({
      ...baseParams,
      count: 2,
      source: {
        ...baseParams.source,
        id: 'reference-1',
        kind: 'trend-reference',
        trendId: 'trend-1',
      },
    });

    expect(result.posts).toHaveLength(2);
    expect(
      trendReferenceCorpusService.recordPostRemixLineage,
    ).toHaveBeenCalledTimes(2);
    expect(
      trendReferenceCorpusService.recordPostRemixLineage,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brand-1',
        metadata: {
          sourceReferenceIds: ['reference-1'],
          trendId: 'trend-1',
        },
        organizationId: 'org-1',
      }),
    );
  });
});
