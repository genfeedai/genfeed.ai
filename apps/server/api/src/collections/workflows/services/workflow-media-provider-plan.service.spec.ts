import type { WorkflowEngineExecutorHelperService } from '@api/collections/workflows/services/workflow-engine-executor-helper.service';
import { WorkflowMediaProviderPlanService } from '@api/collections/workflows/services/workflow-media-provider-plan.service';
import type { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { runImageGenerationBrief } from '@api/services/generation-brief';
import type { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { IngredientCategory, ModelCategory } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import {
  createExecutableActionNode,
  type ExecutionContext,
} from '@genfeedai/workflows/engine';
import type { LoggerService } from '@libs/logger/logger.service';
import { describe, expect, it, vi } from 'vitest';

vi.mock(
  '@api/collections/workflows/services/workflow-engine-executor-helper.service',
  () => ({ WorkflowEngineExecutorHelperService: class {} }),
);
vi.mock('@api/services/files-microservice/client/files-client.service', () => ({
  FilesClientService: class {},
}));
vi.mock('@api/services/prompt-builder/prompt-builder.service', () => ({
  PromptBuilderService: class {},
}));
vi.mock('@libs/logger/logger.service', () => ({ LoggerService: class {} }));

const context: ExecutionContext = {
  organizationId: 'org-1',
  userId: 'user-1',
  runId: 'run-1',
  workflowId: 'workflow-1',
  workflowVersionId: 'version-1',
};
function fixture() {
  const sideEffects = {
    createAndLinkProcessingOutput: vi.fn(),
    createWorkflowOutputIngredient: vi.fn(),
    createProviderContinuation: vi.fn(),
  };
  const requireMediaAsset = vi.fn().mockResolvedValue({
    id: 'identity-1',
    brandId: 'brand-1',
    category: IngredientCategory.IMAGE,
  });
  const helper = {
    ...sideEffects,
    requireMediaAsset,
    requireBrandId: (brandId: unknown) => String(brandId),
    extractIngredientId: (value: unknown) =>
      typeof value === 'string'
        ? value.match(/\/(?:videos|images)\/([^/?#]+)/i)?.[1]
        : undefined,
    buildMediaIngredientUrl: (id: string) => `https://api.test/images/${id}`,
  } as unknown as WorkflowEngineExecutorHelperService;
  const buildPrompt = vi.fn().mockResolvedValue({
    input: { prompt: 'legacy-built', width: 512, height: 512 },
  });
  const getPresignedDownloadUrl = vi
    .fn()
    .mockResolvedValue('https://storage.test/source.mp4?signed=1');
  const service = new WorkflowMediaProviderPlanService(
    helper,
    { warn: vi.fn() } as unknown as LoggerService,
    { buildPrompt } as unknown as PromptBuilderService,
    { getPresignedDownloadUrl } as unknown as FilesClientService,
  );
  return {
    service,
    buildPrompt,
    getPresignedDownloadUrl,
    requireMediaAsset,
    sideEffects,
  };
}

function node(
  actionId: 'imageGen' | 'videoGen',
  parameters: Record<string, unknown>,
) {
  return createExecutableActionNode({
    actionId,
    id: 'media-1',
    parameters: { brandId: 'brand-1', ...parameters },
  });
}

describe('WorkflowMediaProviderPlanService', () => {
  it('prepares the actual image envelope with upstream precedence and final reference/strength patches without creating output or dispatch', async () => {
    const f = fixture();
    const prepared = await f.service.prepareNode(
      node('imageGen', {
        model: MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_SCHNELL,
        prompt: 'stored',
        image: 'stored-image',
        strength: 0.4,
      }),
      new Map([
        ['prompt', 'upstream'],
        ['image', 'https://api.test/images/ref-1'],
      ]),
      context,
    );
    const compiled = runImageGenerationBrief({
      model: MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_SCHNELL,
      objective: 'upstream',
      height: 1024,
      width: 1024,
      referenceIds: [],
      surface: 'workflow',
    });
    expect(prepared.input).toEqual({
      ...compiled.dispatch,
      image: 'https://api.test/images/ref-1',
      strength: 0.4,
    });
    expect(prepared.input.num_outputs).toBe(1);
    expect(prepared.generationBriefEvidence).toEqual(compiled.evidence);
    expect(prepared.output).toMatchObject({
      brandId: 'brand-1',
      organizationId: 'org-1',
      userId: 'user-1',
      generationPrompt: 'upstream',
      generationSource: compiled.generationSource,
    });
    expect(prepared.target).toEqual({
      model: MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_SCHNELL,
    });
    expect(f.buildPrompt).not.toHaveBeenCalled();
    for (const effect of Object.values(f.sideEffects))
      expect(effect).not.toHaveBeenCalled();
  });

  it('retains the real prompt-builder fallback and immutable version target for exempt image models', async () => {
    const f = fixture();
    const prepared = await f.service.prepareNode(
      node('imageGen', {
        model: 'private/model:exact-version',
        prompt: 'legacy',
        seed: 0,
      }),
      new Map(),
      context,
    );
    expect(f.buildPrompt).toHaveBeenCalledWith(
      'private/model:exact-version',
      expect.objectContaining({
        height: 1024,
        width: 1024,
        prompt: 'legacy',
        seed: 0,
        modelCategory: ModelCategory.IMAGE,
      }),
      undefined,
    );
    expect(prepared.input).toEqual({
      prompt: 'legacy-built',
      width: 512,
      height: 512,
    });
    expect(prepared.target).toEqual({ version: 'exact-version' });
    expect(prepared.generationBriefEvidence).toMatchObject({
      status: 'exempted',
      compilerVersion: null,
      profileVersion: null,
    });
  });

  it('keeps exempt video input as prompt only instead of inventing node dimensions or output cardinality', async () => {
    const f = fixture();
    const prepared = await f.service.prepareNode(
      node('videoGen', {
        model: 'private/video:version',
        prompt: 'legacy',
        duration: 8,
        width: 1280,
        height: 720,
      }),
      new Map(),
      context,
    );
    expect(prepared.input).toEqual({ prompt: 'legacy' });
    expect(prepared).not.toHaveProperty('quantities');
    expect(prepared).not.toHaveProperty('quote');
    expect(f.buildPrompt).not.toHaveBeenCalled();
    for (const effect of Object.values(f.sideEffects))
      expect(effect).not.toHaveBeenCalled();
  });

  it('keeps native extension duration unknown and resolves references before returning the exact provider input', async () => {
    const f = fixture();
    const prepared = await f.service.prepareNode(
      node('videoGen', {
        model: MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5,
        prompt: 'extend',
        actionVerb: 'extend',
        duration: 8,
        parentIngredientId: 'source-video-1',
      }),
      new Map([['videoReference', 'https://api.test/videos/source-video-1']]),
      context,
    );
    expect(prepared.input).toMatchObject({
      aspect_ratio: 'adaptive',
      duration: -1,
      reference_videos: ['https://storage.test/source.mp4?signed=1'],
    });
    expect(prepared.output).toMatchObject({
      parentIngredientId: 'source-video-1',
      references: ['source-video-1'],
    });
    expect(f.getPresignedDownloadUrl).toHaveBeenCalledWith(
      'source-video-1',
      'videos',
    );
  });

  it('rejects foreign-brand identity references during preparation before any output exists', async () => {
    const f = fixture();
    f.requireMediaAsset.mockResolvedValueOnce({
      id: 'identity-1',
      brandId: 'foreign-brand',
      category: IngredientCategory.IMAGE,
    });
    await expect(
      f.service.prepareNode(
        node('videoGen', {
          model: MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5,
          identityReferences: [{ assetId: 'identity-1', role: 'character' }],
        }),
        new Map(),
        context,
      ),
    ).rejects.toThrow('does not belong to the run brand');
    expect(f.requireMediaAsset).toHaveBeenCalledWith('identity-1', 'org-1', [
      IngredientCategory.IMAGE,
      IngredientCategory.AVATAR,
    ]);
    for (const effect of Object.values(f.sideEffects))
      expect(effect).not.toHaveBeenCalled();
  });

  it('exposes preparation availability and rejects actions without this provider preparation contract', async () => {
    const f = fixture();
    expect(f.service.canPrepareImage).toBe(true);
    await expect(
      f.service.prepareNode(
        createExecutableActionNode({ actionId: 'upscale', id: 'upscale-1' }),
        new Map(),
        context,
      ),
    ).rejects.toThrow('No direct Replicate media preparation contract');
    const absent = new WorkflowMediaProviderPlanService(
      {} as WorkflowEngineExecutorHelperService,
      {} as LoggerService,
    );
    expect(absent.canPrepareImage).toBe(false);
    await expect(
      absent.prepareNode(
        node('imageGen', {
          model: MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_SCHNELL,
        }),
        new Map(),
        context,
      ),
    ).rejects.toThrow('prompt preparation is unavailable');
  });
});
