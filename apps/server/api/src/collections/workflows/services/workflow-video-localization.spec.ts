import { WorkflowMediaGenerationExecutorRegistrarService } from '@api/collections/workflows/services/workflow-media-generation-executor-registrar.service';
import { IngredientCategory } from '@genfeedai/contracts';
import type {
  INodeExecutor,
  NodeExecutor,
  WorkflowEngine,
} from '@genfeedai/workflows/engine';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@api/services/generation-brief', () => ({
  runImageGenerationBrief: vi.fn(),
  runVideoGenerationBrief: vi.fn(),
  toRedactedGenerationBriefProviderData: vi.fn(),
  toRedactedVideoGenerationBriefProviderData: vi.fn(),
}));
vi.mock('@libs/logger/logger.service', () => ({ LoggerService: class {} }));
vi.mock('@api/services/media-localization/media-localization.service', () => ({
  MediaLocalizationService: class {},
}));
vi.mock('@api/services/byok/byok.service', () => ({ ByokService: class {} }));
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
vi.mock('@api/services/integrations/heygen/services/heygen.service', () => ({
  HeyGenService: class {},
}));
vi.mock(
  '@api/services/integrations/replicate/services/replicate.service',
  () => ({ ReplicateService: class {} }),
);
vi.mock('@api/services/prompt-builder/prompt-builder.service', () => ({
  PromptBuilderService: class {},
}));

type Arguments = ConstructorParameters<
  typeof WorkflowMediaGenerationExecutorRegistrarService
>;
const context = {
  organizationId: 'org-1',
  userId: 'user-1',
  workflowId: 'workflow-1',
  workflowVersionId: 'version-1',
  runId: 'run-1',
};
function setup(category = IngredientCategory.VIDEO) {
  const handlers = new Map<string, NodeExecutor>();
  const runModel = vi.fn().mockResolvedValue('prediction');
  const photo = vi.fn().mockResolvedValue('heygen-job');
  const output = vi.fn(
    async (args: {
      runProvider: (id: string, continuation: string) => Promise<string>;
    }) => {
      await args.runProvider('new-video', 'continuation');
      return { ingredientId: 'new-video' };
    },
  );
  const requireMediaAsset = vi
    .fn()
    .mockImplementation(async (value: { id: string }) => ({
      id: value.id,
      brandId: 'brand-1',
      category: value.id === 'speech' ? IngredientCategory.AUDIO : category,
      storageKey: `${value.id}.wav`,
      storageType: value.id === 'speech' ? 'audios' : 'videos',
    }));
  const helper = {
    requireMediaAsset,
    readConfigString: (config: Record<string, unknown>, key: string) =>
      config[key],
    createAndLinkProcessingOutput: output,
    buildVideoIngredientUrl: (id: string) => `https://api.test/videos/${id}`,
    wrapEngineExecutor:
      (executor: INodeExecutor): NodeExecutor =>
      async (node, inputs, ctx) =>
        (await executor.execute({ node, inputs, context: ctx })).data,
  };
  const files = {
    getPresignedDownloadUrl: vi
      .fn()
      .mockImplementation(async (key: string) => `https://storage.test/${key}`),
  };
  const byok = {
    resolveApiKey: vi.fn().mockResolvedValue({ apiKey: 'test-provider-key' }),
  };
  new WorkflowMediaGenerationExecutorRegistrarService(
    helper as unknown as Arguments[0],
    { log: vi.fn() } as unknown as Arguments[1],
    undefined,
    { generatePhotoAvatarVideo: photo } as unknown as Arguments[3],
    undefined,
    { runModel } as unknown as Arguments[5],
    files as unknown as Arguments[6],
    byok as unknown as Arguments[7],
  ).register({
    registerExecutor: (name: string, handler: NodeExecutor) =>
      handlers.set(name, handler),
  } as unknown as WorkflowEngine);
  const handler = handlers.get('lipSync');
  if (!handler) throw new Error('Lip-sync executor was not registered');
  const execute = (config: Record<string, unknown> = {}) =>
    handler(
      { id: 'lips', type: 'lipSync', label: 'Lip sync', inputs: [], config },
      new Map<string, unknown>([
        [
          category === IngredientCategory.VIDEO ? 'video' : 'image',
          {
            id: 'source',
            videoUrl: 'https://cdn.test/source.mp4',
            imageUrl: 'https://cdn.test/image.png',
          },
        ],
        ['audio', { id: 'speech', audioUrl: 'https://cdn.test/speech.wav' }],
      ]),
      context,
    );
  return { execute, runModel, photo, requireMediaAsset, files, byok, output };
}
describe('Video localization workflow provider boundary', () => {
  it('reuses a saved video and localized AUDIO artifact through Sync and durable continuation', async () => {
    const state = setup();
    await state.execute({ model: 'sync/lipsync-2', syncMode: 'silence' });
    expect(state.runModel).toHaveBeenCalledWith(
      'sync/lipsync-2',
      {
        video: 'https://storage.test/source.wav',
        audio: 'https://storage.test/speech.wav',
        sync_mode: 'silence',
      },
      'test-provider-key',
      'continuation',
    );
    expect(state.files.getPresignedDownloadUrl).toHaveBeenCalledWith(
      'speech.wav',
      'audios',
    );
    expect(state.photo).not.toHaveBeenCalled();
    expect(state.output).toHaveBeenCalledWith(
      expect.objectContaining({
        continuation: expect.objectContaining({ provider: 'replicate' }),
        output: expect.objectContaining({ references: ['source', 'speech'] }),
      }),
    );
  });
  it('keeps photo animation on HeyGen', async () => {
    const state = setup(IngredientCategory.IMAGE);
    await state.execute({ model: 'heygen/avatar' });
    expect(state.photo).toHaveBeenCalled();
    expect(state.runModel).not.toHaveBeenCalled();
  });
  it('rejects a foreign or unfinished source before any paid dispatch', async () => {
    const state = setup();
    state.requireMediaAsset.mockRejectedValueOnce(
      new Error('Unavailable source'),
    );
    await expect(state.execute()).rejects.toThrow('Unavailable source');
    expect(state.output).not.toHaveBeenCalled();
    expect(state.runModel).not.toHaveBeenCalled();
  });
  it('rejects a mismatched brand before provider dispatch', async () => {
    const state = setup();
    await expect(state.execute({ brandId: 'other-brand' })).rejects.toThrow(
      'brand',
    );
    expect(state.output).not.toHaveBeenCalled();
  });
});

describe('Text-to-speech workflow input ports', () => {
  it('passes connected language, voice, brand and speed to the real registrar resolver', async () => {
    const handlers = new Map<string, NodeExecutor>();
    const generateAndUploadAudio = vi.fn().mockResolvedValue({
      audioUrl: 'https://cdn.test/spanish.mp3',
      duration: 30,
      uploadResult: {},
    });
    const createWorkflowOutputIngredient = vi.fn().mockResolvedValue({
      ingredientId: 'generated-audio',
      metadataId: 'audio-metadata',
    });
    const helper = {
      requireBrandId: (value: string) => value,
      readConfigString: (config: Record<string, unknown>, key: string) =>
        config[key],
      createWorkflowOutputIngredient,
      patchMetadata: vi.fn(),
      patchIngredient: vi.fn(),
      buildMusicIngredientUrl: (id: string) => `https://api.test/musics/${id}`,
      wrapEngineExecutor:
        (executor: INodeExecutor): NodeExecutor =>
        async (node, inputs, ctx) =>
          (await executor.execute({ node, inputs, context: ctx })).data,
    };
    new WorkflowMediaGenerationExecutorRegistrarService(
      helper as unknown as Arguments[0],
      { log: vi.fn() } as unknown as Arguments[1],
      undefined,
      undefined,
      { generateAndUploadAudio } as unknown as Arguments[4],
    ).register({
      registerExecutor: (name: string, handler: NodeExecutor) =>
        handlers.set(name, handler),
    } as unknown as WorkflowEngine);
    const handler = handlers.get('textToSpeech');
    if (!handler) throw new Error('TTS handler not registered');
    await handler(
      {
        id: 'tts',
        type: 'textToSpeech',
        label: 'Speech',
        inputs: [],
        config: {
          voiceId: 'old-voice',
          language: 'en',
          brandId: 'old-brand',
          speed: 1,
        },
      },
      new Map<string, unknown>([
        ['text', 'Hola Genfeed'],
        ['voiceId', 'spanish-voice'],
        ['brandId', 'selected-brand'],
        ['language', 'es'],
        ['speed', 1.1],
      ]),
      context,
    );
    expect(createWorkflowOutputIngredient).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: 'selected-brand' }),
    );
    expect(generateAndUploadAudio).toHaveBeenCalledWith(
      'spanish-voice',
      'Hola Genfeed',
      'generated-audio',
      'org-1',
      'user-1',
      undefined,
      { languageCode: 'es', speed: 1.1 },
    );
  });
});
