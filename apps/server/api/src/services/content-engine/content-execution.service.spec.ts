import { ContentDraftStatus } from '@api/collections/content-drafts/schemas/content-draft.schema';
import { ContentExecutionService } from '@api/services/content-engine/content-execution.service';
import {
  ContentPlanItemStatus,
  ContentPlanItemType,
  ContentPlanStatus,
  ImageTaskModel,
  VideoTaskModel,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeItem(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    pipelineSteps: [],
    plan: new Types.ObjectId(),
    platforms: ['instagram'],
    prompt: 'Write about cats',
    skillSlug: 'content-writing',
    topic: 'cats',
    type: ContentPlanItemType.SKILL,
    ...overrides,
  };
}

describe('ContentExecutionService', () => {
  let service: ContentExecutionService;
  let mockContentPlansService: Record<string, ReturnType<typeof vi.fn>>;
  let mockContentPlanItemsService: Record<string, ReturnType<typeof vi.fn>>;
  let mockContentDraftsService: Record<string, ReturnType<typeof vi.fn>>;
  let mockSkillExecutorService: Record<string, ReturnType<typeof vi.fn>>;
  let mockContentOrchestrationService: Record<string, ReturnType<typeof vi.fn>>;
  let mockLogger: Record<string, ReturnType<typeof vi.fn>>;

  const orgId = new Types.ObjectId().toString();
  const brandId = new Types.ObjectId().toString();
  const userId = new Types.ObjectId().toString();
  const planId = new Types.ObjectId().toString();

  const mockDraft = { _id: new Types.ObjectId() };

  beforeEach(() => {
    mockContentPlansService = {
      getByIdOrFail: vi.fn().mockResolvedValue({ _id: planId }),
      incrementExecutedCount: vi.fn().mockResolvedValue(undefined),
      updateStatus: vi.fn().mockResolvedValue(undefined),
    };

    mockContentPlanItemsService = {
      getByIdOrFail: vi.fn(),
      listPendingByPlan: vi.fn().mockResolvedValue([]),
      updateStatus: vi.fn().mockResolvedValue(undefined),
    };

    mockContentDraftsService = {
      createFromContentEngine: vi.fn().mockResolvedValue(mockDraft),
    };

    mockSkillExecutorService = {
      execute: vi.fn(),
    };

    mockContentOrchestrationService = {
      generateAndPublish: vi.fn(),
    };

    mockLogger = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    service = new ContentExecutionService(
      mockContentPlansService as any,
      mockContentPlanItemsService as any,
      mockContentDraftsService as any,
      mockSkillExecutorService as any,
      mockContentOrchestrationService as any,
      mockLogger as unknown as LoggerService,
    );
  });

  // ---------------------------------------------------------------------------
  // executePlan
  // ---------------------------------------------------------------------------
  describe('executePlan', () => {
    it('should validate the plan exists before executing', async () => {
      await service.executePlan(orgId, brandId, planId, userId);

      expect(mockContentPlansService.getByIdOrFail).toHaveBeenCalledWith(
        orgId,
        planId,
      );
    });

    it('should set plan status to EXECUTING at the start', async () => {
      await service.executePlan(orgId, brandId, planId, userId);

      expect(mockContentPlansService.updateStatus).toHaveBeenCalledWith(
        orgId,
        planId,
        ContentPlanStatus.EXECUTING,
      );
    });

    it('should return empty results with summary when no pending items', async () => {
      const result = await service.executePlan(orgId, brandId, planId, userId);

      expect(result.results).toEqual([]);
      expect(result.summary).toEqual({ completed: 0, failed: 0, total: 0 });
    });

    it('should set final status to COMPLETED when all items succeed', async () => {
      const item = makeItem();
      mockContentPlanItemsService.listPendingByPlan.mockResolvedValue([item]);
      mockSkillExecutorService.execute.mockResolvedValue({
        draft: {
          confidence: 0.9,
          content: 'hi',
          mediaUrls: [],
          metadata: {},
          type: 'text',
        },
        source: 'skill',
      });

      await service.executePlan(orgId, brandId, planId, userId);

      const updateStatusCalls = mockContentPlansService.updateStatus.mock.calls;
      const lastCall = updateStatusCalls[updateStatusCalls.length - 1];
      expect(lastCall).toEqual([orgId, planId, ContentPlanStatus.COMPLETED]);
    });

    it('should set final status to ACTIVE when all items fail', async () => {
      const item = makeItem();
      mockContentPlanItemsService.listPendingByPlan.mockResolvedValue([item]);
      mockSkillExecutorService.execute.mockRejectedValue(
        new Error('skill error'),
      );

      await service.executePlan(orgId, brandId, planId, userId);

      const updateStatusCalls = mockContentPlansService.updateStatus.mock.calls;
      const lastCall = updateStatusCalls[updateStatusCalls.length - 1];
      expect(lastCall).toEqual([orgId, planId, ContentPlanStatus.ACTIVE]);
    });

    it('should set COMPLETED when at least one item succeeds (mixed results)', async () => {
      const item1 = makeItem();
      const item2 = makeItem();
      mockContentPlanItemsService.listPendingByPlan.mockResolvedValue([
        item1,
        item2,
      ]);

      mockSkillExecutorService.execute
        .mockResolvedValueOnce({
          draft: {
            confidence: 0.9,
            content: 'hi',
            mediaUrls: [],
            metadata: {},
            type: 'text',
          },
          source: 'skill',
        })
        .mockRejectedValueOnce(new Error('fail'));

      const result = await service.executePlan(orgId, brandId, planId, userId);

      expect(result.summary).toMatchObject({
        completed: 1,
        failed: 1,
        total: 2,
      });

      const updateStatusCalls = mockContentPlansService.updateStatus.mock.calls;
      const lastCall = updateStatusCalls[updateStatusCalls.length - 1];
      expect(lastCall[2]).toBe(ContentPlanStatus.COMPLETED);
    });

    it('should increment executed count for each completed item', async () => {
      const item = makeItem();
      mockContentPlanItemsService.listPendingByPlan.mockResolvedValue([item]);
      mockSkillExecutorService.execute.mockResolvedValue({
        draft: {
          confidence: 0.9,
          content: 'hi',
          mediaUrls: [],
          metadata: {},
          type: 'text',
        },
        source: 'skill',
      });

      await service.executePlan(orgId, brandId, planId, userId);

      expect(
        mockContentPlansService.incrementExecutedCount,
      ).toHaveBeenCalledWith(orgId, planId);
    });

    it('should propagate error when plan is not found', async () => {
      mockContentPlansService.getByIdOrFail.mockRejectedValue(
        new Error('Plan not found'),
      );

      await expect(
        service.executePlan(orgId, brandId, planId, userId),
      ).rejects.toThrow('Plan not found');
    });
  });

  // ---------------------------------------------------------------------------
  // executeSingleItem
  // ---------------------------------------------------------------------------
  describe('executeSingleItem', () => {
    it('should fetch the item and execute it', async () => {
      const item = makeItem();
      const itemId = String(item._id);
      mockContentPlanItemsService.getByIdOrFail.mockResolvedValue(item);
      mockSkillExecutorService.execute.mockResolvedValue({
        draft: {
          confidence: 0.9,
          content: 'hi',
          mediaUrls: [],
          metadata: {},
          type: 'text',
        },
        source: 'skill',
      });

      const result = await service.executeSingleItem(
        orgId,
        brandId,
        userId,
        itemId,
      );

      expect(mockContentPlanItemsService.getByIdOrFail).toHaveBeenCalledWith(
        orgId,
        itemId,
      );
      expect(result.status).toBe(ContentPlanItemStatus.COMPLETED);
      expect(result.itemId).toBe(itemId);
    });

    it('should increment plan executed count on success', async () => {
      const item = makeItem();
      const itemId = String(item._id);
      mockContentPlanItemsService.getByIdOrFail.mockResolvedValue(item);
      mockSkillExecutorService.execute.mockResolvedValue({
        draft: {
          confidence: 0.9,
          content: 'hi',
          mediaUrls: [],
          metadata: {},
          type: 'text',
        },
        source: 'skill',
      });

      await service.executeSingleItem(orgId, brandId, userId, itemId);

      expect(
        mockContentPlansService.incrementExecutedCount,
      ).toHaveBeenCalledWith(orgId, String(item.plan));
    });

    it('should not increment plan count on failure', async () => {
      const item = makeItem();
      const itemId = String(item._id);
      mockContentPlanItemsService.getByIdOrFail.mockResolvedValue(item);
      mockSkillExecutorService.execute.mockRejectedValue(new Error('fail'));

      const result = await service.executeSingleItem(
        orgId,
        brandId,
        userId,
        itemId,
      );

      expect(result.status).toBe(ContentPlanItemStatus.FAILED);
      expect(
        mockContentPlansService.incrementExecutedCount,
      ).not.toHaveBeenCalled();
    });

    it('should throw when item is not found', async () => {
      mockContentPlanItemsService.getByIdOrFail.mockRejectedValue(
        new Error('Item not found'),
      );

      await expect(
        service.executeSingleItem(orgId, brandId, userId, 'bad-id'),
      ).rejects.toThrow('Item not found');
    });
  });

  // ---------------------------------------------------------------------------
  // executeItem (via executePlan) — SKILL type
  // ---------------------------------------------------------------------------
  describe('executeItem (SKILL type)', () => {
    it('should set item status to EXECUTING, then COMPLETED on success', async () => {
      const item = makeItem({ skillSlug: 'seo-blog' });
      mockContentPlanItemsService.listPendingByPlan.mockResolvedValue([item]);
      mockSkillExecutorService.execute.mockResolvedValue({
        draft: {
          confidence: 0.95,
          content: 'blog post',
          mediaUrls: [],
          metadata: {},
          type: 'text',
        },
        source: 'skill',
      });

      await service.executePlan(orgId, brandId, planId, userId);

      expect(mockContentPlanItemsService.updateStatus).toHaveBeenCalledWith(
        orgId,
        String(item._id),
        ContentPlanItemStatus.EXECUTING,
      );
      expect(mockContentPlanItemsService.updateStatus).toHaveBeenCalledWith(
        orgId,
        String(item._id),
        ContentPlanItemStatus.COMPLETED,
        expect.objectContaining({ contentDraftId: String(mockDraft._id) }),
      );
    });

    it('should use default skill slug "content-writing" when skillSlug is not set', async () => {
      const item = makeItem({ skillSlug: undefined });
      mockContentPlanItemsService.listPendingByPlan.mockResolvedValue([item]);
      mockSkillExecutorService.execute.mockResolvedValue({
        draft: {
          confidence: 0.8,
          content: 'hi',
          mediaUrls: [],
          metadata: {},
          type: 'text',
        },
        source: 'skill',
      });

      await service.executePlan(orgId, brandId, planId, userId);

      expect(mockSkillExecutorService.execute).toHaveBeenCalledWith(
        'content-writing',
        expect.anything(),
        expect.anything(),
      );
    });

    it('should create a content draft with correct fields', async () => {
      const item = makeItem({ platforms: ['twitter'], skillSlug: 'seo-blog' });
      mockContentPlanItemsService.listPendingByPlan.mockResolvedValue([item]);
      mockSkillExecutorService.execute.mockResolvedValue({
        draft: {
          confidence: 0.88,
          content: 'SEO blog content',
          mediaUrls: ['https://cdn.example.com/img.jpg'],
          metadata: { keywords: ['seo'] },
          type: 'text',
        },
        source: 'cache',
      });

      await service.executePlan(orgId, brandId, planId, userId);

      expect(
        mockContentDraftsService.createFromContentEngine,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          confidence: 0.88,
          content: 'SEO blog content',
          generatedBy: 'content-engine:seo-blog',
          platforms: ['twitter'],
          skillSlug: 'seo-blog',
          status: ContentDraftStatus.PENDING,
        }),
      );
    });

    it('should set item status to FAILED when skill executor throws', async () => {
      const item = makeItem();
      mockContentPlanItemsService.listPendingByPlan.mockResolvedValue([item]);
      mockSkillExecutorService.execute.mockRejectedValue(
        new Error('skill exploded'),
      );

      const result = await service.executePlan(orgId, brandId, planId, userId);

      expect(result.results[0]).toMatchObject({
        error: 'skill exploded',
        status: ContentPlanItemStatus.FAILED,
      });
      expect(mockContentPlanItemsService.updateStatus).toHaveBeenCalledWith(
        orgId,
        String(item._id),
        ContentPlanItemStatus.FAILED,
        { error: 'skill exploded' },
      );
    });

    it('should handle non-Error thrown values gracefully', async () => {
      const item = makeItem();
      mockContentPlanItemsService.listPendingByPlan.mockResolvedValue([item]);
      mockSkillExecutorService.execute.mockRejectedValue('string error');

      const result = await service.executePlan(orgId, brandId, planId, userId);

      expect(result.results[0].error).toBe('Unknown execution error');
    });
  });

  // ---------------------------------------------------------------------------
  // executeItem — MEDIA_PIPELINE type
  // ---------------------------------------------------------------------------
  describe('executeItem (media pipeline type)', () => {
    const pipelineItem = makeItem({
      pipelineSteps: [
        {
          aspectRatio: '1:1',
          model: ImageTaskModel.FAL,
          prompt: 'a cat',
          type: 'text-to-image',
        },
        {
          duration: 5,
          imageUrl: 'https://cdn.example.com/cat.jpg',
          model: VideoTaskModel.HIGGSFIELD,
          type: 'image-to-video',
        },
      ],
      type: ContentPlanItemType.MEDIA_PIPELINE,
    });

    beforeEach(() => {
      mockContentPlanItemsService.listPendingByPlan.mockResolvedValue([
        pipelineItem,
      ]);
    });

    it('should call contentOrchestrationService.generateAndPublish with mapped steps', async () => {
      mockContentOrchestrationService.generateAndPublish.mockResolvedValue({
        postIds: [],
        status: 'completed',
        steps: [{ result: { url: 'https://cdn.example.com/video.mp4' } }],
      });

      await service.executePlan(orgId, brandId, planId, userId);

      expect(
        mockContentOrchestrationService.generateAndPublish,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          brandId,
          organizationId: orgId,
          personaId: brandId,
          platforms: pipelineItem.platforms,
          publishMode: 'none',
        }),
      );
    });

    it('should create a draft with mediaUrls from pipeline steps', async () => {
      mockContentOrchestrationService.generateAndPublish.mockResolvedValue({
        postIds: [],
        status: 'completed',
        steps: [
          { result: { url: 'https://cdn.example.com/video.mp4' } },
          { result: null },
        ],
      });

      await service.executePlan(orgId, brandId, planId, userId);

      expect(
        mockContentDraftsService.createFromContentEngine,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          generatedBy: 'content-engine:media-pipeline',
          mediaUrls: ['https://cdn.example.com/video.mp4'],
          skillSlug: 'media-pipeline',
          status: ContentDraftStatus.PENDING,
        }),
      );
    });

    it('should fail the item when pipeline status is "failed"', async () => {
      mockContentOrchestrationService.generateAndPublish.mockResolvedValue({
        postIds: [],
        status: 'failed',
        steps: [{ error: { message: 'Model timeout' } }],
      });

      const result = await service.executePlan(orgId, brandId, planId, userId);

      expect(result.results[0]).toMatchObject({
        error: 'Model timeout',
        status: ContentPlanItemStatus.FAILED,
      });
    });

    it('should use fallback error message when pipeline fails with no step error', async () => {
      mockContentOrchestrationService.generateAndPublish.mockResolvedValue({
        postIds: [],
        status: 'failed',
        steps: [],
      });

      const result = await service.executePlan(orgId, brandId, planId, userId);

      expect(result.results[0].error).toBe('Pipeline execution failed');
    });

    it('should throw when pipelineSteps is empty', async () => {
      const itemNoPipeline = makeItem({
        pipelineSteps: [],
        type: ContentPlanItemType.MEDIA_PIPELINE,
      });
      mockContentPlanItemsService.listPendingByPlan.mockResolvedValue([
        itemNoPipeline,
      ]);

      const result = await service.executePlan(orgId, brandId, planId, userId);

      expect(result.results[0].status).toBe(ContentPlanItemStatus.FAILED);
      expect(result.results[0].error).toContain('at least one pipeline step');
    });

    it('should map text-to-speech pipeline step correctly', async () => {
      const item = makeItem({
        pipelineSteps: [
          {
            model: 'eleven_multilingual_v2',
            text: 'Hello world',
            type: 'text-to-speech',
            voiceId: 'voice-123',
          },
        ],
        type: ContentPlanItemType.MEDIA_PIPELINE,
      });
      mockContentPlanItemsService.listPendingByPlan.mockResolvedValue([item]);
      mockContentOrchestrationService.generateAndPublish.mockResolvedValue({
        postIds: [],
        status: 'completed',
        steps: [{ result: { url: 'https://cdn.example.com/audio.mp3' } }],
      });

      await service.executePlan(orgId, brandId, planId, userId);

      const callArgs =
        mockContentOrchestrationService.generateAndPublish.mock.calls[0][0];
      expect(callArgs.steps[0]).toMatchObject({
        text: 'Hello world',
        type: 'text-to-speech',
        voiceId: 'voice-123',
      });
    });

    it('should map text-to-music pipeline step correctly', async () => {
      const item = makeItem({
        pipelineSteps: [
          {
            duration: 30,
            model: 'musicgen',
            prompt: 'upbeat jazz',
            type: 'text-to-music',
          },
        ],
        type: ContentPlanItemType.MEDIA_PIPELINE,
      });
      mockContentPlanItemsService.listPendingByPlan.mockResolvedValue([item]);
      mockContentOrchestrationService.generateAndPublish.mockResolvedValue({
        postIds: [],
        status: 'completed',
        steps: [{ result: { url: 'https://cdn.example.com/music.mp3' } }],
      });

      await service.executePlan(orgId, brandId, planId, userId);

      const callArgs =
        mockContentOrchestrationService.generateAndPublish.mock.calls[0][0];
      expect(callArgs.steps[0]).toMatchObject({
        duration: 30,
        prompt: 'upbeat jazz',
        type: 'text-to-music',
      });
    });

    it('should fall back to item.prompt when step.prompt is missing for unknown step type', async () => {
      const item = makeItem({
        pipelineSteps: [
          {
            model: ImageTaskModel.FAL,
            type: 'unknown-type',
          },
        ],
        prompt: 'fallback prompt',
        type: ContentPlanItemType.MEDIA_PIPELINE,
      });
      mockContentPlanItemsService.listPendingByPlan.mockResolvedValue([item]);
      mockContentOrchestrationService.generateAndPublish.mockResolvedValue({
        postIds: [],
        status: 'completed',
        steps: [{ result: { url: 'https://cdn.example.com/img.png' } }],
      });

      await service.executePlan(orgId, brandId, planId, userId);

      const callArgs =
        mockContentOrchestrationService.generateAndPublish.mock.calls[0][0];
      expect(callArgs.steps[0].prompt).toBe('fallback prompt');
    });
  });
});
