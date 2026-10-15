import { WorkflowMediaGenerationExecutorRegistrarService } from '@api/collections/workflows/services/workflow-media-generation-executor-registrar.service';
import type { WorkflowUpscaleFunding } from '@api/collections/workflows/services/workflow-upscale-funding.service';
import { ReplicateProviderError } from '@api/services/integrations/replicate/errors/replicate-provider.error';
import {
  AgentFailureReason,
  IngredientCategory,
  IngredientStatus,
} from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type {
  INodeExecutor,
  NodeExecutor,
  WorkflowEngine,
} from '@genfeedai/workflows/engine';
import { describe, expect, it, vi } from 'vitest';

vi.mock(
  '@api/collections/workflows/services/workflow-engine-executor-helper.service',
  () => ({ WorkflowEngineExecutorHelperService: class {} }),
);
vi.mock('@api/services/files-microservice/client/files-client.service', () => ({
  FilesClientService: class {},
}));
vi.mock(
  '@api/services/integrations/elevenlabs/services/elevenlabs.service',
  () => ({ ElevenLabsService: class {} }),
);
vi.mock(
  '@api/services/integrations/replicate/services/replicate.service',
  () => ({ ReplicateService: class {} }),
);
vi.mock('@api/services/prompt-builder/prompt-builder.service', () => ({
  PromptBuilderService: class {},
}));
vi.mock('@libs/logger/logger.service', () => ({ LoggerService: class {} }));
vi.mock('@api/services/media-localization/media-localization.service', () => ({
  MediaLocalizationService: class {},
}));
vi.mock('@api/services/byok/byok.service', () => ({ ByokService: class {} }));

type Arguments = ConstructorParameters<
  typeof WorkflowMediaGenerationExecutorRegistrarService
>;

const context = {
  organizationId: 'org-1',
  runId: 'run-1',
  userId: 'user-1',
  workflowId: 'workflow-1',
  workflowVersionId: 'version-1',
};

function setup(
  options: {
    category?: IngredientCategory;
    fundError?: Error;
    runModel?: ReturnType<typeof vi.fn>;
    hasFunding?: boolean;
  } = {},
) {
  const category = options.category ?? IngredientCategory.IMAGE;
  const isVideo = category === IngredientCategory.VIDEO;
  const order: string[] = [];
  const funding: WorkflowUpscaleFunding = {
    model: isVideo
      ? MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE
      : MODEL_KEYS.REPLICATE_TOPAZ_IMAGE_UPSCALE,
    providerInput: isVideo
      ? { target_fps: 30, target_resolution: '1080p' }
      : { upscale_factor: '2x' },
    bind: vi.fn(async () => {
      order.push('bind');
    }),
    reject: vi.fn(async () => {
      order.push('reject');
    }),
    releasePool: vi.fn(async () => {
      order.push('releasePool');
    }),
  };
  const fund = options.fundError
    ? vi.fn().mockRejectedValue(options.fundError)
    : vi.fn().mockResolvedValue(funding);
  const runModel =
    options.runModel ??
    vi.fn(async () => {
      order.push('submit');
      return 'prediction-1';
    });
  const failProviderContinuationSubmission = vi.fn();
  const createAndLinkProcessingOutput = vi.fn(
    async (args: {
      runProvider: (id: string, continuation: string) => Promise<unknown>;
    }) => {
      order.push('output');
      await args.runProvider('output-1', 'continuation-1');
      return { ingredientId: 'output-1', metadataId: 'metadata-1' };
    },
  );
  const requireMediaAsset = vi.fn(async (value: unknown) => ({
    brandId: 'brand-1',
    category,
    id: 'source-1',
    storageKey: `${String(value)}-key`,
    storageType: isVideo ? 'videos' : 'images',
  }));
  const helper = {
    buildMediaIngredientUrl: (id: string, kind: string) =>
      `https://api.test/${kind}/${id}`,
    createAndLinkProcessingOutput,
    failProviderContinuationSubmission,
    readConfigString: (config: Record<string, unknown>, key: string) =>
      config[key],
    requireMediaAsset,
    resolveBrandIdFromInputOrFail: vi.fn(async () => 'brand-1'),
    wrapEngineExecutor:
      (executor: INodeExecutor): NodeExecutor =>
      async (node, inputs, ctx) =>
        (await executor.execute({ context: ctx, inputs, node })).data,
  };
  const handlers = new Map<string, NodeExecutor>();
  new WorkflowMediaGenerationExecutorRegistrarService(
    helper as unknown as Arguments[0],
    { log: vi.fn() } as unknown as Arguments[1],
    {} as unknown as Arguments[2],
    undefined,
    { runModel } as unknown as Arguments[4],
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    options.hasFunding === false
      ? undefined
      : ({ fund } as unknown as Arguments[10]),
  ).register({
    registerExecutor: (name: string, handler: NodeExecutor) =>
      handlers.set(name, handler),
  } as unknown as WorkflowEngine);
  const handler = handlers.get('upscale');
  if (!handler) throw new Error('Upscale executor was not registered');
  const execute = (config: Record<string, unknown> = {}) =>
    handler(
      {
        config: { model: 'topaz', scale: '2x', ...config },
        id: 'upscale-1',
        inputs: [],
        label: 'Upscale',
        type: 'upscale',
      },
      new Map<string, unknown>([['media', 'https://api.test/images/source-1']]),
      context,
    );
  return {
    createAndLinkProcessingOutput,
    execute,
    failProviderContinuationSubmission,
    fund,
    funding,
    order,
    requireMediaAsset,
    runModel,
  };
}

describe('workflow upscale node funding', () => {
  it('prices the stored source, binds the hold before Replicate sees the job and releases the pool', async () => {
    const state = setup();

    const result = await state.execute();

    expect(state.requireMediaAsset).toHaveBeenCalledWith(
      'https://api.test/images/source-1',
      'org-1',
      [IngredientCategory.IMAGE, IngredientCategory.VIDEO],
    );
    expect(state.fund).toHaveBeenCalledWith({
      brandId: 'brand-1',
      category: IngredientCategory.IMAGE,
      organizationId: 'org-1',
      scale: '2x',
      sourceIngredientId: 'source-1',
      targetFps: undefined,
      targetResolution: undefined,
      userId: 'user-1',
    });
    expect(state.runModel).toHaveBeenCalledWith(
      MODEL_KEYS.REPLICATE_TOPAZ_IMAGE_UPSCALE,
      { image: 'https://api.test/images/source-1', upscale_factor: '2x' },
      undefined,
      'continuation-1',
    );
    expect(state.order).toEqual(['output', 'bind', 'submit', 'releasePool']);
    expect(state.funding.reject).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      id: 'output-1',
      status: IngredientStatus.PROCESSING,
    });
  });

  it('prices a video from the node resolution and frame rate and runs the priced settings', async () => {
    const state = setup({ category: IngredientCategory.VIDEO });

    await state.execute({ fps: 30, resolution: '1080p' });

    expect(state.fund).toHaveBeenCalledWith(
      expect.objectContaining({
        category: IngredientCategory.VIDEO,
        targetFps: 30,
        targetResolution: '1080p',
      }),
    );
    expect(state.runModel).toHaveBeenCalledWith(
      MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE,
      {
        target_fps: 30,
        target_resolution: '1080p',
        video: 'https://api.test/images/source-1',
      },
      undefined,
      'continuation-1',
    );
  });

  it('refuses before output or provider when the source cannot be priced', async () => {
    const state = setup({ fundError: new Error('size unknown') });

    await expect(state.execute()).rejects.toThrow('size unknown');

    expect(state.createAndLinkProcessingOutput).not.toHaveBeenCalled();
    expect(state.runModel).not.toHaveBeenCalled();
  });

  it('refuses when funding is not wired instead of dispatching unfunded', async () => {
    const state = setup({ hasFunding: false });

    await expect(state.execute()).rejects.toThrow(
      'Upscale funding is unavailable',
    );

    expect(state.createAndLinkProcessingOutput).not.toHaveBeenCalled();
    expect(state.runModel).not.toHaveBeenCalled();
  });

  it('returns the hold when Replicate definitively rejects the job', async () => {
    const runModel = vi
      .fn()
      .mockRejectedValue(
        new ReplicateProviderError(
          AgentFailureReason.INSUFFICIENT_CREDITS,
          'rejected',
          { isRetryable: false, statusCode: 402 },
        ),
      );
    const state = setup({ runModel });

    await expect(state.execute()).rejects.toThrow('rejected');

    expect(state.funding.reject).toHaveBeenCalledWith('output-1');
    expect(state.funding.releasePool).toHaveBeenCalledTimes(1);
  });

  it('keeps the hold when the outcome at Replicate is ambiguous', async () => {
    const runModel = vi.fn().mockRejectedValue(new Error('socket hang up'));
    const state = setup({ runModel });

    await expect(state.execute()).rejects.toThrow('socket hang up');

    expect(state.funding.reject).not.toHaveBeenCalled();
    expect(state.funding.releasePool).toHaveBeenCalledTimes(1);
  });

  it('fails the continuation and returns the hold when it cannot bind', async () => {
    const state = setup();
    vi.mocked(state.funding.bind).mockRejectedValue(new Error('bind failed'));

    await expect(state.execute()).rejects.toThrow('bind failed');

    expect(state.runModel).not.toHaveBeenCalled();
    expect(state.failProviderContinuationSubmission).toHaveBeenCalledWith({
      continuationId: 'continuation-1',
      error: 'bind failed',
      organizationId: 'org-1',
    });
    expect(state.funding.reject).toHaveBeenCalledWith('output-1');
  });
});
