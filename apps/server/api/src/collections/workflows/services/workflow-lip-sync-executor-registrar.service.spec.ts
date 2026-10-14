import { WorkflowLipSyncExecutorRegistrarService } from '@api/collections/workflows/services/workflow-lip-sync-executor-registrar.service';
import type { WorkflowLipSyncFunding } from '@api/collections/workflows/services/workflow-lip-sync-funding.service';
import { HeyGenSubmissionRejectedError } from '@api/services/integrations/heygen/errors/heygen-submission-rejected.error';
import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
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
vi.mock('@api/services/integrations/heygen/services/heygen.service', () => ({
  HeyGenService: class {},
}));
vi.mock(
  '@api/services/integrations/replicate/services/replicate.service',
  () => ({ ReplicateService: class {} }),
);

type Arguments = ConstructorParameters<
  typeof WorkflowLipSyncExecutorRegistrarService
>;

const context = {
  organizationId: 'org-1',
  runId: 'run-1',
  userId: 'user-1',
  workflowId: 'workflow-1',
  workflowVersionId: 'version-1',
};

function fundingDouble(overrides: Partial<WorkflowLipSyncFunding> = {}) {
  const order: string[] = [];
  const funding: WorkflowLipSyncFunding = {
    apiKey: 'connection-key',
    isByok: false,
    bind: vi.fn(async () => {
      order.push('bind');
    }),
    reject: vi.fn(async () => {
      order.push('reject');
    }),
    releasePool: vi.fn(async () => {
      order.push('releasePool');
    }),
    ...overrides,
  };
  return { funding, order };
}

function setup(options: {
  category?: IngredientCategory;
  funding?: WorkflowLipSyncFunding;
  fundingError?: Error;
  photo?: ReturnType<typeof vi.fn>;
  runModel?: ReturnType<typeof vi.fn>;
  isAuthorizedMediaDeliveryEnabled?: boolean;
  issuer?: { issueServerPublish: ReturnType<typeof vi.fn> };
}) {
  const category = options.category ?? IngredientCategory.IMAGE;
  const { funding, order } = options.funding
    ? { funding: options.funding, order: [] as string[] }
    : fundingDouble();
  const handlers = new Map<string, NodeExecutor>();
  const photo =
    options.photo ??
    vi.fn(async () => {
      order.push('submit');
      return 'heygen-job';
    });
  const runModel =
    options.runModel ??
    vi.fn(async () => {
      order.push('submit');
      return 'prediction';
    });
  const failProviderContinuationSubmission = vi.fn();
  const createAndLinkProcessingOutput = vi.fn(
    async (args: {
      runProvider: (id: string, continuation: string) => Promise<unknown>;
    }) => {
      await args.runProvider('output-1', 'continuation-1');
      return { ingredientId: 'output-1', metadataId: 'metadata-1' };
    },
  );
  const requireMediaAsset = vi.fn(async (value: unknown) => ({
    brandId: 'brand-1',
    category: value === 'speech' ? IngredientCategory.AUDIO : category,
    id: String(value),
    storageKey: `${String(value)}-key`,
    storageType: value === 'speech' ? 'audios' : 'images',
  }));
  const helper = {
    buildVideoIngredientUrl: (id: string) => `https://api.test/videos/${id}`,
    createAndLinkProcessingOutput,
    failProviderContinuationSubmission,
    readConfigString: (config: Record<string, unknown>, key: string) =>
      config[key],
    requireMediaAsset,
    wrapEngineExecutor:
      (executor: INodeExecutor): NodeExecutor =>
      async (node, inputs, ctx) =>
        (await executor.execute({ context: ctx, inputs, node })).data,
  };
  const fundingService = {
    fundPhotoAnimation: options.fundingError
      ? vi.fn().mockRejectedValue(options.fundingError)
      : vi.fn().mockResolvedValue(funding),
    fundVideoLipSync: options.fundingError
      ? vi.fn().mockRejectedValue(options.fundingError)
      : vi.fn().mockResolvedValue(funding),
  };
  const files = {
    getPresignedDownloadUrl: vi.fn(
      async (key: string) => `https://storage.test/${key}`,
    ),
  };
  new WorkflowLipSyncExecutorRegistrarService(
    helper as unknown as Arguments[0],
    fundingService as unknown as Arguments[1],
    { generatePhotoAvatarVideo: photo } as unknown as Arguments[2],
    { runModel } as unknown as Arguments[3],
    files as unknown as Arguments[4],
    {
      isAuthorizedMediaDeliveryEnabled:
        options.isAuthorizedMediaDeliveryEnabled ?? false,
    } as unknown as Arguments[5],
    options.issuer as unknown as Arguments[6],
  ).register({
    registerExecutor: (name: string, handler: NodeExecutor) =>
      handlers.set(name, handler),
  } as unknown as WorkflowEngine);
  const handler = handlers.get('lipSync');
  if (!handler) throw new Error('Lip-sync executor was not registered');
  const execute = (config: Record<string, unknown> = {}) =>
    handler(
      { config, id: 'lips', inputs: [], label: 'Lip sync', type: 'lipSync' },
      new Map<string, unknown>([
        [category === IngredientCategory.VIDEO ? 'video' : 'image', 'source'],
        ['audio', 'speech'],
      ]),
      context,
    );
  return {
    createAndLinkProcessingOutput,
    execute,
    failProviderContinuationSubmission,
    files,
    funding,
    fundingService,
    order,
    photo,
    requireMediaAsset,
    runModel,
  };
}

describe('WorkflowLipSyncExecutorRegistrarService photo animation', () => {
  it('holds the voice length before output, binds before HeyGen sees the job, and dispatches with the resolved connection key', async () => {
    const state = setup({});

    const result = await state.execute({ model: MODEL_KEYS.HEYGEN_AVATAR });

    expect(state.fundingService.fundPhotoAnimation).toHaveBeenCalledWith({
      audioIngredientId: 'speech',
      brandId: 'brand-1',
      organizationId: 'org-1',
      userId: 'user-1',
    });
    expect(state.fundingService.fundVideoLipSync).not.toHaveBeenCalled();
    expect(state.funding.bind).toHaveBeenCalledWith('output-1');
    expect(state.photo).toHaveBeenCalledWith(
      'output-1',
      'https://storage.test/source-key',
      'https://storage.test/speech-key',
      'org-1',
      'user-1',
      'connection-key',
    );
    expect(state.order).toEqual(['bind', 'submit', 'releasePool']);
    expect(state.funding.reject).not.toHaveBeenCalled();
    expect(state.createAndLinkProcessingOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        continuation: expect.objectContaining({
          actionId: 'lipSync',
          isByok: false,
          provider: 'heygen',
        }),
      }),
    );
    expect(result).toMatchObject({
      id: 'output-1',
      status: IngredientStatus.PROCESSING,
    });
  });

  it('records a customer HeyGen key as BYOK on the continuation', async () => {
    const { funding } = fundingDouble({
      apiKey: 'customer-key',
      isByok: true,
    });
    const state = setup({ funding });

    await state.execute();

    expect(state.photo).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(String),
      'org-1',
      'user-1',
      'customer-key',
    );
    expect(state.createAndLinkProcessingOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        continuation: expect.objectContaining({ isByok: true }),
      }),
    );
  });

  it('returns the hold when HeyGen definitively rejects the submission', async () => {
    const rejected = new HeyGenSubmissionRejectedError();
    const state = setup({ photo: vi.fn().mockRejectedValue(rejected) });

    await expect(state.execute()).rejects.toBe(rejected);

    expect(state.funding.reject).toHaveBeenCalledWith('output-1');
    expect(state.funding.releasePool).toHaveBeenCalledTimes(1);
    // The helper fails the continuation for a provider rejection itself.
    expect(state.failProviderContinuationSubmission).not.toHaveBeenCalled();
  });

  it('keeps the hold when the submission outcome is ambiguous', async () => {
    const state = setup({
      photo: vi.fn().mockRejectedValue(new Error('socket hang up')),
    });

    await expect(state.execute()).rejects.toThrow('socket hang up');

    expect(state.funding.reject).not.toHaveBeenCalled();
    expect(state.funding.releasePool).toHaveBeenCalledTimes(1);
  });

  it('fails the continuation and returns the hold when binding fails before dispatch', async () => {
    const { funding } = fundingDouble({
      bind: vi.fn().mockRejectedValue(new Error('bind failed')),
    });
    const state = setup({ funding });

    await expect(state.execute()).rejects.toThrow('bind failed');

    expect(state.photo).not.toHaveBeenCalled();
    expect(state.failProviderContinuationSubmission).toHaveBeenCalledWith({
      continuationId: 'continuation-1',
      error: 'bind failed',
      organizationId: 'org-1',
    });
    expect(funding.reject).toHaveBeenCalledWith('output-1');
  });

  it('creates no output and dispatches nothing when funding is refused', async () => {
    const state = setup({ fundingError: new Error('Insufficient credits') });

    await expect(state.execute()).rejects.toThrow('Insufficient credits');

    expect(state.createAndLinkProcessingOutput).not.toHaveBeenCalled();
    expect(state.photo).not.toHaveBeenCalled();
  });
});

describe('WorkflowLipSyncExecutorRegistrarService video lip-sync', () => {
  it('funds the Sync model at the voice length and dispatches through a durable continuation', async () => {
    const state = setup({ category: IngredientCategory.VIDEO });

    await state.execute({ model: 'sync/lipsync-2', syncMode: 'silence' });

    expect(state.fundingService.fundVideoLipSync).toHaveBeenCalledWith({
      audioIngredientId: 'speech',
      brandId: 'brand-1',
      model: 'sync/lipsync-2',
      organizationId: 'org-1',
      userId: 'user-1',
    });
    expect(state.runModel).toHaveBeenCalledWith(
      'sync/lipsync-2',
      {
        audio: 'https://storage.test/speech-key',
        sync_mode: 'silence',
        video: 'https://storage.test/source-key',
      },
      'connection-key',
      'continuation-1',
    );
    expect(state.order).toEqual(['bind', 'submit', 'releasePool']);
    expect(state.photo).not.toHaveBeenCalled();
    expect(state.createAndLinkProcessingOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        continuation: expect.objectContaining({ provider: 'replicate' }),
        output: expect.objectContaining({ references: ['source', 'speech'] }),
      }),
    );
  });

  it.each(['granted', 'denied'] as const)(
    'delegates activated lip-sync media to the scoped issuer (%s)',
    async (grant) => {
      const issuer = {
        issueServerPublish: vi.fn(
          async (_organizationId: string, ids: readonly string[]) => {
            if (grant === 'denied') throw new Error('Scoped media unavailable');
            return new Map(
              ids.map((id) => [
                id,
                `https://authorized.test/${id}?signature=grant`,
              ]),
            );
          },
        ),
      };
      const state = setup({
        category: IngredientCategory.VIDEO,
        isAuthorizedMediaDeliveryEnabled: true,
        issuer,
      });
      const pending = state.execute({ mode: 'video' });
      if (grant === 'denied') {
        await expect(pending).rejects.toThrow('Scoped media unavailable');
        expect(state.fundingService.fundVideoLipSync).not.toHaveBeenCalled();
        expect(state.runModel).not.toHaveBeenCalled();
      } else {
        await pending;
        expect(state.runModel).toHaveBeenCalledWith(
          'sync/lipsync-2',
          expect.objectContaining({
            audio: 'https://authorized.test/speech?signature=grant',
            video: 'https://authorized.test/source?signature=grant',
          }),
          'connection-key',
          'continuation-1',
        );
      }
      expect(state.files.getPresignedDownloadUrl).not.toHaveBeenCalled();
    },
  );

  it('rejects a foreign or unfinished source before any funding or dispatch', async () => {
    const state = setup({ category: IngredientCategory.VIDEO });
    state.requireMediaAsset.mockRejectedValueOnce(
      new Error('Unavailable source'),
    );

    await expect(state.execute()).rejects.toThrow('Unavailable source');

    expect(state.fundingService.fundVideoLipSync).not.toHaveBeenCalled();
    expect(state.createAndLinkProcessingOutput).not.toHaveBeenCalled();
  });

  it('rejects a mismatched brand before funding', async () => {
    const state = setup({ category: IngredientCategory.VIDEO });

    await expect(state.execute({ brandId: 'other-brand' })).rejects.toThrow(
      'brand',
    );

    expect(state.fundingService.fundVideoLipSync).not.toHaveBeenCalled();
    expect(state.createAndLinkProcessingOutput).not.toHaveBeenCalled();
  });

  it('rejects source media and audio from different brands', async () => {
    const state = setup({ category: IngredientCategory.VIDEO });
    state.requireMediaAsset.mockImplementation(async (value: unknown) => ({
      brandId: value === 'speech' ? 'brand-2' : 'brand-1',
      category:
        value === 'speech'
          ? IngredientCategory.AUDIO
          : IngredientCategory.VIDEO,
      id: String(value),
      storageKey: 'key',
      storageType: 'videos',
    }));

    await expect(state.execute()).rejects.toThrow(
      'Lip-sync source media and audio must belong to the same brand',
    );

    expect(state.files.getPresignedDownloadUrl).not.toHaveBeenCalled();
    expect(state.fundingService.fundVideoLipSync).not.toHaveBeenCalled();
  });
});
