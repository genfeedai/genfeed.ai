import type { WorkflowEngineExecutorHelperService } from '@api/collections/workflows/services/workflow-engine-executor-helper.service';
import { WorkflowMediaGenerationExecutorRegistrarService } from '@api/collections/workflows/services/workflow-media-generation-executor-registrar.service';
import * as imageGenerationBriefRegistry from '@api/services/generation-brief/image-generation-brief-registry';
import { QWEN_IMAGE_MODEL_KEY } from '@api-types/contracts/generation-capability-profile.contract';
import { MODEL_KEYS } from '@genfeedai/constants';
import {
  createExecutableActionNode,
  type INodeExecutor,
  type NodeExecutor,
  WorkflowEngine,
} from '@genfeedai/workflows/engine';
import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

const wrapEngineExecutor =
  (executor: INodeExecutor) =>
  async (...args: Parameters<NodeExecutor>) =>
    (
      await executor.execute({
        context: args[2],
        inputs: args[1],
        node: args[0],
      })
    ).data;

function getActionExecutor(
  engine: WorkflowEngine,
  actionId: string,
): NodeExecutor | undefined {
  const executor = engine.getExecutor('genfeedAction');
  return executor
    ? (node, inputs, context) =>
        executor(
          createExecutableActionNode({
            actionId,
            id: node.id,
            label: node.label,
            parameters: node.config,
          }),
          inputs,
          context,
        )
    : undefined;
}

describe('WorkflowMediaGenerationExecutorRegistrarService', () => {
  it('persists native video extension lineage and dispatches the Seedance extension contract', async () => {
    const createAndLinkProcessingOutput = vi.fn(
      async (
        args: Parameters<
          WorkflowEngineExecutorHelperService['createAndLinkProcessingOutput']
        >[0],
      ) => {
        await args.runProvider('ingredient-extended', 'continuation-extended');
        return {
          ingredientId: 'ingredient-extended',
          metadataId: 'metadata-extended',
        };
      },
    );
    const helper = {
      buildVideoIngredientUrl: (ingredientId: string) =>
        `https://api.test/videos/${ingredientId}`,
      createAndLinkProcessingOutput,
      extractIngredientId: (value: unknown) =>
        typeof value === 'string'
          ? value.match(/\/videos\/([^/?#]+)/i)?.[1]
          : undefined,
      requireBrandId: (brandId: unknown) => String(brandId),
      wrapEngineExecutor,
    } as unknown as WorkflowEngineExecutorHelperService;
    const replicateService = {
      runModel: vi.fn().mockResolvedValue('prediction-extended'),
    };
    const filesClientService = {
      getPresignedDownloadUrl: vi
        .fn()
        .mockResolvedValue('https://s3.example.com/source-video-1?sig=signed'),
    };
    const engine = new WorkflowEngine();

    new WorkflowMediaGenerationExecutorRegistrarService(
      helper,
      { log: vi.fn() } as never,
      { buildPrompt: vi.fn() } as never,
      undefined,
      undefined,
      replicateService as never,
      filesClientService as never,
    ).register(engine);

    await getActionExecutor(engine, 'videoGen')?.(
      {
        config: {
          actionVerb: 'extend',
          brandId: 'brand-1',
          duration: 8,
          model: MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5,
          parentIngredientId: 'source-video-1',
          prompt: 'Continue into the next room',
        },
        id: 'video-gen-1',
        inputs: [],
        label: 'Extend video',
        type: 'videoGen',
      },
      new Map([['videoReference', 'https://api.test/videos/source-video-1']]),
      {
        organizationId: 'org-1',
        runId: 'run-1',
        userId: 'user-1',
        workflowId: 'workflow-1',
        workflowVersionId: 'version-1',
      },
    );

    expect(replicateService.runModel).toHaveBeenCalledWith(
      MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5,
      expect.objectContaining({
        aspect_ratio: 'adaptive',
        duration: -1,
        reference_videos: ['https://s3.example.com/source-video-1?sig=signed'],
      }),
      undefined,
      'continuation-extended',
    );
    expect(filesClientService.getPresignedDownloadUrl).toHaveBeenCalledWith(
      'source-video-1',
      'videos',
    );
    expect(createAndLinkProcessingOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        output: expect.objectContaining({
          parentIngredientId: 'source-video-1',
          providerData: expect.objectContaining({
            actionVerb: 'extend',
            dispatchMode: 'native',
            referenceAssetIds: ['source-video-1'],
          }),
          references: ['source-video-1'],
        }),
      }),
    );
  });

  it('preserves compiled negative prompts and canonical provenance in the workflow result and persisted output', async () => {
    const createAndLinkProcessingOutput = vi.fn(
      async (
        args: Parameters<
          WorkflowEngineExecutorHelperService['createAndLinkProcessingOutput']
        >[0],
      ) => {
        await args.runProvider('ingredient-1', 'continuation-1');
        return { ingredientId: 'ingredient-1', metadataId: 'metadata-1' };
      },
    );
    const helper = {
      buildImageIngredientUrl: (ingredientId: string) =>
        `https://api.test/images/${ingredientId}`,
      createAndLinkProcessingOutput,
      requireBrandId: (brandId: unknown) => String(brandId),
      wrapEngineExecutor,
    } as unknown as WorkflowEngineExecutorHelperService;
    const promptBuilderService = { buildPrompt: vi.fn() };
    const replicateService = {
      runModel: vi.fn().mockResolvedValue('prediction-1'),
    };
    const engine = new WorkflowEngine();

    new WorkflowMediaGenerationExecutorRegistrarService(
      helper,
      { log: vi.fn() } as never,
      promptBuilderService as never,
      undefined,
      undefined,
      replicateService as never,
    ).register(engine);

    const result = await getActionExecutor(engine, 'imageGen')?.(
      {
        config: {
          brandId: 'brand-1',
          height: 1024,
          model: QWEN_IMAGE_MODEL_KEY,
          negativePrompt: 'watermark, blurry text',
          prompt: 'A launch poster',
          width: 1024,
        },
        id: 'image-gen-1',
        inputs: [],
        label: 'Generate image',
        type: 'imageGen',
      },
      new Map(),
      {
        organizationId: 'org-1',
        runId: 'run-1',
        userId: 'user-1',
        workflowId: 'workflow-1',
        workflowVersionId: 'version-1',
      },
    );

    expect(promptBuilderService.buildPrompt).not.toHaveBeenCalled();
    expect(replicateService.runModel).toHaveBeenCalledWith(
      QWEN_IMAGE_MODEL_KEY,
      expect.objectContaining({ negative_prompt: 'watermark, blurry text' }),
      undefined,
      'continuation-1',
    );
    expect(createAndLinkProcessingOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        output: expect.objectContaining({
          generationPrompt: 'A launch poster',
          generationSource: expect.stringContaining('generation-brief:v1:'),
          negativePrompt: 'watermark, blurry text',
          providerData: expect.objectContaining({
            compilerId: 'qwen-image-image-compiler',
            status: 'compiled',
            surface: 'workflow',
          }),
        }),
      }),
    );
    expect(result).toMatchObject({
      generationBriefEvidence: {
        compilerId: 'qwen-image-image-compiler',
        status: 'compiled',
        surface: 'workflow',
      },
      generationSource: expect.stringContaining('generation-brief:v1:'),
    });
  });

  it('does not create an output or dispatch a provider request when the required compiler is unavailable', async () => {
    const registryEntry =
      imageGenerationBriefRegistry.getImageGenerationBriefRegistryEntry(
        QWEN_IMAGE_MODEL_KEY,
      );
    if (!registryEntry) {
      throw new Error('Qwen Image registry fixture is missing');
    }
    const registryLookup = vi
      .spyOn(
        imageGenerationBriefRegistry,
        'getImageGenerationBriefRegistryEntry',
      )
      .mockReturnValueOnce(registryEntry)
      .mockReturnValueOnce(undefined);
    const createAndLinkProcessingOutput = vi.fn();
    const replicateService = { runModel: vi.fn() };
    const helper = {
      buildImageIngredientUrl: vi.fn(),
      createAndLinkProcessingOutput,
      requireBrandId: (brandId: unknown) => String(brandId),
      wrapEngineExecutor,
    } as unknown as WorkflowEngineExecutorHelperService;
    const engine = new WorkflowEngine();

    new WorkflowMediaGenerationExecutorRegistrarService(
      helper,
      { log: vi.fn() } as never,
      { buildPrompt: vi.fn() } as never,
      undefined,
      undefined,
      replicateService as never,
    ).register(engine);

    try {
      await expect(
        getActionExecutor(engine, 'imageGen')?.(
          {
            config: {
              brandId: 'brand-1',
              model: QWEN_IMAGE_MODEL_KEY,
              prompt: 'A launch poster',
            },
            id: 'image-gen-1',
            inputs: [],
            label: 'Generate image',
            type: 'imageGen',
          },
          new Map(),
          {
            organizationId: 'org-1',
            runId: 'run-1',
            userId: 'user-1',
            workflowId: 'workflow-1',
            workflowVersionId: 'version-1',
          },
        ),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    } finally {
      registryLookup.mockRestore();
    }

    expect(createAndLinkProcessingOutput).not.toHaveBeenCalled();
    expect(replicateService.runModel).not.toHaveBeenCalled();
  });

  it('registers video generation without a prompt builder and forwards the last frame', async () => {
    const createAndLinkProcessingOutput = vi.fn(
      async (
        args: Parameters<
          WorkflowEngineExecutorHelperService['createAndLinkProcessingOutput']
        >[0],
      ) => {
        await args.runProvider('ingredient-1', 'continuation-1');
        return { ingredientId: 'ingredient-1', metadataId: 'metadata-1' };
      },
    );
    const helper = {
      buildVideoIngredientUrl: (ingredientId: string) =>
        `https://api.test/videos/${ingredientId}`,
      createAndLinkProcessingOutput,
      extractIngredientId: (value: unknown) =>
        typeof value === 'string'
          ? value.match(/\/videos\/([^/?#]+)/i)?.[1]
          : undefined,
      requireBrandId: (brandId: unknown) => String(brandId),
      wrapEngineExecutor,
    } as unknown as WorkflowEngineExecutorHelperService;
    const replicateService = {
      runModel: vi.fn().mockResolvedValue('prediction-1'),
    };
    const engine = new WorkflowEngine();

    new WorkflowMediaGenerationExecutorRegistrarService(
      helper,
      { log: vi.fn() } as never,
      undefined,
      undefined,
      undefined,
      replicateService as never,
    ).register(engine);

    await getActionExecutor(engine, 'videoGen')?.(
      {
        config: {
          brandId: 'brand-1',
          image: 'first-frame-1',
          lastFrame: 'last-frame-1',
          model: MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_VIDEO,
          prompt: 'A product rotates toward camera',
        },
        id: 'video-gen-1',
        inputs: [],
        label: 'Generate video',
        type: 'videoGen',
      },
      new Map(),
      {
        organizationId: 'org-1',
        runId: 'run-1',
        userId: 'user-1',
        workflowId: 'workflow-1',
        workflowVersionId: 'version-1',
      },
    );

    expect(replicateService.runModel).toHaveBeenCalledWith(
      MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_VIDEO,
      expect.objectContaining({
        end_image: 'last-frame-1',
        start_image: 'first-frame-1',
      }),
      undefined,
      'continuation-1',
    );
  });
});
