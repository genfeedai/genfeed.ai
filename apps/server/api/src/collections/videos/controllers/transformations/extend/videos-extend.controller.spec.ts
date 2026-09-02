import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { VideosExtendController } from '@api/collections/videos/controllers/transformations/extend/videos-extend.controller';
import type { VideosService } from '@api/collections/videos/services/videos.service';
import type { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import type { RequestWithContext as Request } from '@api/common/middleware/request-context.middleware';
import {
  CREDITS_DEFER_MODEL_RESOLUTION_KEY,
  CREDITS_KEY,
} from '@api/helpers/decorators/credits/credits.decorator';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { ModelsGuard } from '@api/helpers/guards/models/models.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import {
  ActivitySource,
  IngredientCategory,
  IngredientStatus,
} from '@genfeedai/contracts';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnNotFound: vi.fn((_source, id) => {
    throw new Error(`${id} not found`);
  }),
  serializeSingle: vi.fn((_request, _serializer, data) => data),
}));

const sourceVideo = {
  brandId: 'brand-1',
  category: IngredientCategory.VIDEO,
  id: 'video-1',
  metadata: { duration: 5 },
  organizationId: 'org-1',
  status: IngredientStatus.GENERATED,
};
const user = {
  brandId: 'brand-1',
  id: 'user-1',
  organizationId: 'org-1',
  userId: 'user-1',
} as unknown as User;

function createHarness() {
  const videosService = { findOne: vi.fn().mockResolvedValue(sourceVideo) };
  const videoGenerationCreditsService = {
    ensureExtensionCredits: vi.fn().mockResolvedValue(undefined),
  };
  const workflowsService = {
    createWorkflow: vi.fn().mockResolvedValue({ id: 'workflow-1' }),
  };
  const controller = new VideosExtendController(
    videoGenerationCreditsService as never,
    videosService as unknown as VideosService,
    workflowsService as unknown as WorkflowsService,
  );
  return {
    controller,
    videoGenerationCreditsService,
    videosService,
    workflowsService,
  };
}

describe('VideosExtendController', () => {
  it('creates a native Seedance extension with source lineage', async () => {
    const {
      controller,
      videoGenerationCreditsService,
      videosService,
      workflowsService,
    } = createHarness();
    const request = {} as Request;

    const result = await controller.extendVideo(request, user, sourceVideo.id, {
      duration: 8,
      model: 'bytedance/seedance-2.5',
      prompt: 'Continue into the next room',
    });

    expect(result).toEqual({ id: 'workflow-1' });
    expect(videosService.findOne).toHaveBeenCalledWith(
      {
        category: IngredientCategory.VIDEO,
        id: sourceVideo.id,
        isDeleted: false,
        organizationId: user.organizationId,
      },
      [{ path: 'metadata', select: ['duration'] }],
    );
    expect(
      videoGenerationCreditsService.ensureExtensionCredits,
    ).toHaveBeenCalledWith(
      { duration: 8 },
      'bytedance/seedance-2.5',
      user.organizationId,
      request,
      'native',
    );
    expect(workflowsService.createWorkflow).toHaveBeenCalledWith(
      user.userId,
      user.organizationId,
      expect.objectContaining({
        metadata: expect.objectContaining({
          actionVerb: 'extend',
          dispatchMode: 'native',
          model: 'bytedance/seedance-2.5',
          sourceVideoId: sourceVideo.id,
        }),
        nodes: expect.arrayContaining([
          expect.objectContaining({ id: 'extension-video' }),
          expect.objectContaining({
            data: expect.objectContaining({
              // Action-backed nodes carry `{actionId, parameters}` (validated
              // against the action's contract), not flattened fields.
              config: expect.objectContaining({
                actionId: 'videoGen',
                parameters: expect.objectContaining({
                  actionVerb: 'extend',
                  parentIngredientId: sourceVideo.id,
                }),
              }),
            }),
            id: 'extension-video',
          }),
        ]),
      }),
      sourceVideo.brandId,
    );
  });

  it('preserves the generation credit gate and success-only settlement metadata', () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      VideosExtendController.prototype,
      'extendVideo',
    );
    const handler = descriptor?.value;

    expect(Reflect.getMetadata(CREDITS_KEY, handler)).toEqual({
      description: 'Video extension',
      source: ActivitySource.VIDEO_GENERATION,
    });
    expect(
      Reflect.getMetadata(CREDITS_DEFER_MODEL_RESOLUTION_KEY, handler),
    ).toBe(true);
    expect(Reflect.getMetadata('__guards__', handler)).toEqual([
      SubscriptionGuard,
      CreditsGuard,
      ModelsGuard,
    ]);
    expect(Reflect.getMetadata('__interceptors__', handler)).toEqual([
      CreditsInterceptor,
    ]);
  });

  it('falls back to extract, generate, and stitch for models without native extension', async () => {
    const { controller, workflowsService } = createHarness();

    await controller.extendVideo({} as Request, user, sourceVideo.id, {
      model: 'google/veo-3.1',
      prompt: 'Continue',
    });

    expect(workflowsService.createWorkflow).toHaveBeenCalledWith(
      user.userId,
      user.organizationId,
      expect.objectContaining({
        metadata: expect.objectContaining({ dispatchMode: 'fabricated' }),
        nodes: expect.arrayContaining([
          expect.objectContaining({ id: 'source-last-frame' }),
          expect.objectContaining({ id: 'extended-video' }),
        ]),
      }),
      sourceVideo.brandId,
    );
  });

  it('rejects a source that is still processing', async () => {
    const { controller, videosService, workflowsService } = createHarness();
    videosService.findOne.mockResolvedValue({
      ...sourceVideo,
      status: IngredientStatus.PROCESSING,
    });

    await expect(
      controller.extendVideo({} as Request, user, sourceVideo.id, {
        model: 'bytedance/seedance-2.5',
        prompt: 'Continue',
      }),
    ).rejects.toThrow('Only completed videos can be extended');
    expect(workflowsService.createWorkflow).not.toHaveBeenCalled();
  });

  it('accepts a validated keep as a completed source', async () => {
    const { controller, videosService, workflowsService } = createHarness();
    videosService.findOne.mockResolvedValue({
      ...sourceVideo,
      status: IngredientStatus.VALIDATED,
    });

    await controller.extendVideo({} as Request, user, sourceVideo.id, {
      model: 'bytedance/seedance-2.5',
      prompt: 'Continue',
    });

    expect(workflowsService.createWorkflow).toHaveBeenCalledOnce();
  });

  it('rejects a source longer than the native extension model accepts', async () => {
    const { controller, videosService, workflowsService } = createHarness();
    videosService.findOne.mockResolvedValue({
      ...sourceVideo,
      metadata: { duration: 31 },
    });

    await expect(
      controller.extendVideo({} as Request, user, sourceVideo.id, {
        model: 'bytedance/seedance-2.5',
        prompt: 'Continue',
      }),
    ).rejects.toThrow('between 1 and 30 seconds');
    expect(workflowsService.createWorkflow).not.toHaveBeenCalled();
  });

  it('rejects a source shorter than the native extension model accepts', async () => {
    const { controller, videosService, workflowsService } = createHarness();
    videosService.findOne.mockResolvedValue({
      ...sourceVideo,
      metadata: { duration: 0.5 },
    });

    await expect(
      controller.extendVideo({} as Request, user, sourceVideo.id, {
        model: 'bytedance/seedance-2.5',
        prompt: 'Continue',
      }),
    ).rejects.toThrow('between 1 and 30 seconds');
    expect(workflowsService.createWorkflow).not.toHaveBeenCalled();
  });
});
