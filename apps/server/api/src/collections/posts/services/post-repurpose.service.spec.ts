import { ContentGeneratorService } from '@api/collections/content-intelligence/services/content-generator.service';
import { PostGroupPersistenceService } from '@api/collections/post-groups/services/post-group-persistence.service';
import { PostRepurposeService } from '@api/collections/posts/services/post-repurpose.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { BatchGenerationService } from '@api/services/batch-generation/batch-generation.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  IngredientCategory,
  IngredientStatus,
  Platform,
  PostRepurposeMode,
  TargetExecutionState,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

describe('PostRepurposeService', () => {
  let service: PostRepurposeService;

  const userId = 'user_1';
  const organizationId = 'org_1';
  const brandId = 'brand_1';
  const postId = 'post_1';
  const groupId = 'group_1';
  const credentialId = 'credential_1';

  const baseSourcePost = {
    brandId,
    category: 'TEXT',
    credentialId: null,
    description:
      'We shipped the new scheduler today. Releases now roll every channel from one draft.',
    groupId: null,
    id: postId,
    ingredients: [],
    label: 'Scheduler launch',
    organizationId,
    platform: Platform.LINKEDIN,
    timezone: 'UTC',
    userId,
  };

  const postsService = {
    count: vi.fn(),
    create: vi.fn(),
    findOne: vi.fn(),
  };

  const prisma = {
    credential: { findFirst: vi.fn() },
    ingredient: { findFirst: vi.fn() },
    post: { count: vi.fn(), updateMany: vi.fn() },
  };

  const contentGeneratorService = { generateContent: vi.fn() };
  const batchGenerationService = { createManualReviewBatch: vi.fn() };
  const postGroupPersistenceService = { hydrateWithDerivedStatus: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostRepurposeService,
        { provide: PostsService, useValue: postsService },
        { provide: PrismaService, useValue: prisma },
        { provide: ContentGeneratorService, useValue: contentGeneratorService },
        { provide: BatchGenerationService, useValue: batchGenerationService },
        {
          provide: PostGroupPersistenceService,
          useValue: postGroupPersistenceService,
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

    service = module.get(PostRepurposeService);

    postsService.findOne.mockResolvedValue({ ...baseSourcePost });
    postsService.create.mockImplementation(async (dto: unknown) => ({
      id: 'draft_1',
      ...(dto as Record<string, unknown>),
    }));
    prisma.post.count.mockResolvedValue(0);
    prisma.post.updateMany.mockResolvedValue({ count: 1 });
    prisma.ingredient.findFirst.mockResolvedValue(null);
  });

  describe('deterministic mode', () => {
    it('creates a standalone draft linked via originalPostId', async () => {
      const result = await service.repurpose({
        mode: PostRepurposeMode.DETERMINISTIC,
        organizationId,
        platform: Platform.TWITTER,
        postId,
        userId,
      });

      expect(postsService.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          id: postId,
          isDeleted: false,
          organizationId,
        }),
        expect.anything(),
      );
      expect(postsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          brandId,
          credentialId: null,
          groupId: undefined,
          organizationId,
          originalPostId: postId,
          platform: Platform.TWITTER,
          targetExecutionState: TargetExecutionState.DRAFT,
          userId,
        }),
      );
      expect(result.draft.id).toBe('draft_1');
      expect(
        postGroupPersistenceService.hydrateWithDerivedStatus,
      ).not.toHaveBeenCalled();
    });

    it('truncates the caption to the target channel limit', async () => {
      postsService.findOne.mockResolvedValue({
        ...baseSourcePost,
        description: `Launch update ${'growth '.repeat(80)}metrics`,
      });

      const result = await service.repurpose({
        mode: PostRepurposeMode.DETERMINISTIC,
        organizationId,
        platform: Platform.TWITTER,
        postId,
        userId,
      });

      const created = postsService.create.mock.calls[0]?.[0] as {
        description: string;
      };
      expect(Array.from(created.description).length).toBeLessThanOrEqual(280);
      expect(result.adjustments).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'channel_repurpose.caption_truncated',
          }),
        ]),
      );
    });

    it('adds a draft channel target to the source post group', async () => {
      postsService.findOne.mockResolvedValue({
        ...baseSourcePost,
        groupId,
      });
      prisma.post.count.mockResolvedValue(3);

      await service.repurpose({
        mode: PostRepurposeMode.DETERMINISTIC,
        organizationId,
        platform: Platform.TWITTER,
        postId,
        userId,
      });

      expect(postsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          groupId,
          order: 3,
          originalPostId: postId,
        }),
      );
      expect(
        postGroupPersistenceService.hydrateWithDerivedStatus,
      ).toHaveBeenCalledWith(prisma, organizationId, groupId);
    });

    it('rejects incompatible media with an actionable message', async () => {
      postsService.findOne.mockResolvedValue({
        ...baseSourcePost,
        ingredients: Array.from({ length: 5 }, (_, index) => ({
          category: IngredientCategory.IMAGE,
          id: `ingredient_${index}`,
          status: IngredientStatus.GENERATED,
        })),
      });

      await expect(
        service.repurpose({
          mode: PostRepurposeMode.DETERMINISTIC,
          organizationId,
          platform: Platform.TWITTER,
          postId,
          userId,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(postsService.create).not.toHaveBeenCalled();
    });

    it('passes compatible media through to the draft', async () => {
      postsService.findOne.mockResolvedValue({
        ...baseSourcePost,
        ingredients: [
          {
            category: IngredientCategory.IMAGE,
            id: 'ingredient_1',
            status: IngredientStatus.GENERATED,
          },
          {
            category: IngredientCategory.MUSIC,
            id: 'ingredient_2',
            status: IngredientStatus.GENERATED,
          },
        ],
      });

      await service.repurpose({
        mode: PostRepurposeMode.DETERMINISTIC,
        organizationId,
        platform: Platform.TWITTER,
        postId,
        userId,
      });

      expect(postsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ ingredients: ['ingredient_1'] }),
      );
    });
  });

  describe('access control and credential checks', () => {
    it('rejects a post outside the organization as not found', async () => {
      postsService.findOne.mockResolvedValue(null);

      await expect(
        service.repurpose({
          mode: PostRepurposeMode.DETERMINISTIC,
          organizationId: 'other_org',
          platform: Platform.TWITTER,
          postId,
          userId,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects a credential on the wrong platform', async () => {
      prisma.credential.findFirst.mockResolvedValue({
        brandId,
        id: credentialId,
        isConnected: true,
        platform: 'LINKEDIN',
      });

      await expect(
        service.repurpose({
          credentialId,
          mode: PostRepurposeMode.DETERMINISTIC,
          organizationId,
          platform: Platform.TWITTER,
          postId,
          userId,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('agent mode', () => {
    beforeEach(() => {
      contentGeneratorService.generateContent.mockResolvedValue([
        { content: 'Rewritten for the target channel.', hashtags: [] },
      ]);
      batchGenerationService.createManualReviewBatch.mockResolvedValue({
        id: 'batch_1',
        items: [{ id: 'item_1', postId: 'draft_agent_1' }],
      });
      postsService.findOne
        .mockResolvedValueOnce({ ...baseSourcePost })
        .mockResolvedValueOnce({
          id: 'draft_agent_1',
          reviewBatchId: 'batch_1',
          reviewItemId: 'item_1',
        });
    });

    it('routes the rewrite through the manual review batch', async () => {
      const result = await service.repurpose({
        mode: PostRepurposeMode.AGENT,
        organizationId,
        platform: Platform.TWITTER,
        postId,
        userId,
      });

      expect(contentGeneratorService.generateContent).toHaveBeenCalledWith(
        organizationId,
        expect.objectContaining({
          brandId,
          platform: Platform.TWITTER,
          variationsCount: 1,
        }),
      );
      expect(
        batchGenerationService.createManualReviewBatch,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          brandId,
          items: [
            expect.objectContaining({
              caption: 'Rewritten for the target channel.',
              format: 'post',
              platform: Platform.TWITTER,
              sourceActionId: postId,
            }),
          ],
        }),
        userId,
        organizationId,
      );
      expect(prisma.post.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            originalPostId: postId,
            targetExecutionState: TargetExecutionState.DRAFT,
          }),
          where: expect.objectContaining({
            id: 'draft_agent_1',
            organizationId,
          }),
        }),
      );
      expect(result.reviewBatchId).toBe('batch_1');
      expect(result.reviewItemId).toBe('item_1');
      expect(result.draft.id).toBe('draft_agent_1');
    });

    it('rejects target channels the content engine does not cover', async () => {
      await expect(
        service.repurpose({
          mode: PostRepurposeMode.AGENT,
          organizationId,
          platform: Platform.YOUTUBE,
          postId,
          userId,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(contentGeneratorService.generateContent).not.toHaveBeenCalled();
    });
  });
});
