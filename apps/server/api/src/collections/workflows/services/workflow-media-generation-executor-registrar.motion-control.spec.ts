import type { WorkflowEngineExecutorHelperService } from '@api/collections/workflows/services/workflow-engine-executor-helper.service';
import { WorkflowMediaGenerationExecutorRegistrarService } from '@api/collections/workflows/services/workflow-media-generation-executor-registrar.service';
import type { WorkflowMediaProviderPlanService } from '@api/collections/workflows/services/workflow-media-provider-plan.service';
import { IngredientStatus } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import {
  createExecutableActionNode,
  type ExecutionContext,
  type INodeExecutor,
  type NodeExecutor,
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

const MODEL = MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_MOTION_CONTROL;
const context: ExecutionContext = {
  organizationId: 'org-1',
  runId: 'run-1',
  userId: 'user-1',
  workflowId: 'workflow-1',
  workflowVersionId: 'version-1',
};
const prepared = {
  actionId: 'motionControl',
  input: {
    character_orientation: 'image',
    image: 'https://api.test/images/image-1',
    keep_original_sound: true,
    mode: 'pro',
    prompt: '',
    video: 'https://api.test/videos/video-1',
  },
  model: MODEL,
  output: { brandId: 'brand-1', organizationId: 'org-1', userId: 'user-1' },
  provider: 'replicate',
};

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

function fixture(
  options: {
    byokKey?: string;
    providerFails?: boolean;
    withReplicate?: boolean;
  } = {},
) {
  // What the provider and the output record were given, kept as plain data.
  const providerCalls: unknown[][] = [];
  const outputs: Array<{ isByok: unknown; provider: unknown }> = [];
  const runModel = async (...args: unknown[]) => {
    providerCalls.push(args);
    return 'prediction-1';
  };
  const helper = {
    buildVideoIngredientUrl: (id: string) => `https://api.test/videos/${id}`,
    createAndLinkProcessingOutput: async (args: {
      continuation: { isByok: unknown; provider: unknown };
      runProvider: (ingredientId: string, continuationId: string) => unknown;
    }) => {
      if (options.providerFails) throw new Error('Replicate is unavailable');
      outputs.push({
        isByok: args.continuation.isByok,
        provider: args.continuation.provider,
      });
      await args.runProvider('ingredient-1', 'continuation-1');
      return { ingredientId: 'ingredient-1', metadataId: 'metadata-1' };
    },
    wrapEngineExecutor,
  } as unknown as WorkflowEngineExecutorHelperService;
  const plan = {
    authorizeProviderInput: async (input: Record<string, unknown>) => ({
      ...input,
      video: 'https://signed.test/video-1',
    }),
    prepareMotionControl: async () => prepared,
  } as unknown as WorkflowMediaProviderPlanService;
  const engine = new WorkflowEngine();
  new WorkflowMediaGenerationExecutorRegistrarService(
    helper,
    { log: () => undefined } as never,
    plan,
    undefined,
    options.withReplicate === false ? undefined : ({ runModel } as never),
    {
      resolveApiKey: async () =>
        options.byokKey ? { apiKey: options.byokKey } : undefined,
    } as never,
  ).register(engine);
  return { engine, outputs, providerCalls };
}

function run(engine: WorkflowEngine) {
  const executor = engine.getExecutor('genfeedAction');
  return executor?.(
    createExecutableActionNode({
      actionId: 'motionControl',
      id: 'motion-1',
      parameters: { brandId: 'brand-1', model: MODEL },
    }),
    new Map<string, unknown>([
      ['image', 'image-1'],
      ['video', 'video-1'],
    ]),
    context,
  );
}

describe('motion control executor registration', () => {
  it('returns the pending video and sends the provider the signed input', async () => {
    const f = fixture();

    const result = await run(f.engine);

    expect(result).toMatchObject({
      id: 'ingredient-1',
      model: MODEL,
      provider: 'replicate',
      status: IngredientStatus.PROCESSING,
      videoUrl: 'https://api.test/videos/ingredient-1',
    });
    expect(f.outputs).toEqual([{ isByok: false, provider: 'replicate' }]);
    expect(f.providerCalls).toEqual([
      [
        MODEL,
        { ...prepared.input, video: 'https://signed.test/video-1' },
        undefined,
        'continuation-1',
      ],
    ]);
  });

  it('runs on the organization Replicate key and marks the run as BYOK', async () => {
    const f = fixture({ byokKey: 'byok-secret' });

    await run(f.engine);

    expect(f.outputs).toEqual([{ isByok: true, provider: 'replicate' }]);
    expect(f.providerCalls.map((call) => call[2])).toEqual(['byok-secret']);
  });

  it('surfaces a provider failure so the node fails instead of reporting a video', async () => {
    const f = fixture({ providerFails: true });

    await expect(run(f.engine)).rejects.toThrow('Replicate is unavailable');
    expect(f.providerCalls).toEqual([]);
  });

  it('registers no motion control executor without a Replicate service', () => {
    const f = fixture({ withReplicate: false });

    expect(() => run(f.engine)).toThrow('No executor registered');
    expect(f.outputs).toEqual([]);
  });
});
