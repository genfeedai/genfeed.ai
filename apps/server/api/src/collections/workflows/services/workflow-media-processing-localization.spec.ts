vi.mock('@api/collections/captions/services/captions.service', () => ({
  CaptionsService: class {},
}));
vi.mock('@api/collections/ingredients/services/ingredients.service', () => ({
  IngredientsService: class {},
}));
vi.mock('@api/collections/metadata/services/metadata.service', () => ({
  MetadataService: class {},
}));
vi.mock('@api/collections/musics/services/musics.service', () => ({
  MusicsService: class {},
}));
vi.mock(
  '@api/collections/videos/services/avatar-video-generation.service',
  () => ({ AvatarVideoGenerationService: class {} }),
);
vi.mock(
  '@api/collections/videos/services/video-music-orchestration.service',
  () => ({ VideoMusicOrchestrationService: class {} }),
);
vi.mock(
  '@api/collections/workflows/services/video-qa-continuity-resolver.service',
  () => ({ VideoQaContinuityResolverService: class {} }),
);
vi.mock(
  '@api/collections/workflows/services/workflow-node-continuation.service',
  () => ({ WorkflowNodeContinuationService: class {} }),
);
vi.mock('@api/services/files-microservice/client/files-client.service', () => ({
  FilesClientService: class {},
}));
vi.mock('@api/services/files-microservice/queue/file-queue.service', () => ({
  FileQueueService: class {},
}));
vi.mock('@api/services/whisper/whisper.service', () => ({
  WhisperService: class {},
}));
vi.mock('@api/shared/services/shared/shared.service', () => ({
  SharedService: class {},
}));
vi.mock('@libs/config/config.service', () => ({ ConfigService: class {} }));
vi.mock('@api/index', () => ({
  scopedWhere: (organizationId: string, where: Record<string, unknown>) => ({
    ...where,
    organizationId,
    isDeleted: false,
  }),
}));

import { WorkflowEngineExecutorHelperService } from '@api/collections/workflows/services/workflow-engine-executor-helper.service';
import { WorkflowMediaProcessingExecutorRegistrarService } from '@api/collections/workflows/services/workflow-media-processing-executor-registrar.service';
import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import type { NodeExecutor, WorkflowEngine } from '@genfeedai/workflows/engine';

function setup() {
  const assets = new Map([
    [
      'clip-1',
      {
        id: 'clip-1',
        brandId: 'brand',
        category: IngredientCategory.VIDEO,
        status: IngredientStatus.GENERATED,
        s3Key: 'ingredients/videos/clip-1.mp4',
      },
    ],
    [
      'clip-2',
      {
        id: 'clip-2',
        brandId: 'brand',
        category: IngredientCategory.VIDEO,
        status: IngredientStatus.GENERATED,
        s3Key: 'ingredients/videos/nested/clip-2.mp4',
      },
    ],
    [
      'speech',
      {
        id: 'speech',
        brandId: 'brand',
        category: IngredientCategory.AUDIO,
        status: IngredientStatus.GENERATED,
        s3Key: 'ingredients/audios/spanish.wav',
      },
    ],
  ]);
  const ingredients = {
    findOne: vi.fn(async ({ id }: { id: string }) => assets.get(id)),
    patch: vi.fn().mockResolvedValue({}),
  };
  const metadata = { patch: vi.fn().mockResolvedValue({}) };
  const shared = {
    createMediaDocumentsInternal: vi.fn().mockResolvedValue({
      ingredientData: { id: 'result' },
      metadataData: { id: 'result-meta' },
    }),
  };
  const config = { ingredientsEndpoint: 'https://cdn.example/ingredients' };
  const helper = new WorkflowEngineExecutorHelperService(
    config as never,
    shared as never,
    metadata as never,
    ingredients as never,
  );
  const files = {
    getPresignedDownloadUrl: vi.fn(
      async (key: string, type: string) =>
        `https://signed.example/${type}/${key}`,
    ),
    audioOverlay: vi.fn().mockResolvedValue({
      publicUrl: 'https://cdn.example/result.mp4',
      s3Key: 'ingredients/videos/result.mp4',
      duration: 30,
    }),
    uploadToS3: vi.fn(),
  };
  const queue = {
    processVideo: vi.fn().mockResolvedValue({ jobId: 'job' }),
    waitForJob: vi.fn().mockResolvedValue({
      success: true,
      s3Key: 'ingredients/videos/result',
      url: 'https://cdn.example/result',
      duration: 6,
      width: 64,
      height: 64,
      size: 100,
    }),
  };
  const executors = new Map<string, NodeExecutor>();
  new WorkflowMediaProcessingExecutorRegistrarService(
    helper,
    config as never,
    undefined,
    undefined,
    queue as never,
    files as never,
    ingredients as never,
    metadata as never,
    undefined,
    shared as never,
  ).register({
    registerExecutor: (type: string, executor: NodeExecutor) =>
      executors.set(type, executor),
  } as unknown as WorkflowEngine);
  const run = (
    type: string,
    inputs: Map<string, unknown>,
    nodeConfig: Record<string, unknown> = {},
  ) => {
    const executor = executors.get(type);
    if (!executor) throw new Error('Executor not registered');
    return executor(
      {
        id: 'node',
        type,
        config: nodeConfig,
        inputs: [],
        label: type,
      } as Parameters<NodeExecutor>[0],
      inputs,
      { organizationId: 'org', userId: 'user' } as Parameters<NodeExecutor>[2],
    );
  };
  return { assets, ingredients, metadata, shared, files, queue, run };
}

describe('workflow media composition integration', () => {
  it.each(['replace', 'mix', 'background'])(
    'soundOverlay %s resolves artifact IDs to stored audio/video keys and persists output',
    async (mixMode) => {
      const h = setup();
      const result = await h.run(
        'soundOverlay',
        new Map<string, unknown>([
          [
            'videoUrl',
            { id: 'clip-1', videoUrl: 'https://untrusted.example/video.mp4' },
          ],
          [
            'soundUrl',
            { id: 'speech', audioUrl: 'https://untrusted.example/audio.wav' },
          ],
        ]),
        { mixMode, audioVolume: 65, videoVolume: 20, fadeIn: 0.5, fadeOut: 1 },
      );
      expect(h.ingredients.findOne).toHaveBeenCalledWith({
        id: 'speech',
        organizationId: 'org',
        isDeleted: false,
      });
      expect(h.files.getPresignedDownloadUrl).toHaveBeenCalledWith(
        'clip-1.mp4',
        'videos',
      );
      expect(h.files.getPresignedDownloadUrl).toHaveBeenCalledWith(
        'spanish.wav',
        'audios',
      );
      expect(h.files.audioOverlay).toHaveBeenCalledWith({
        videoUrl: 'https://signed.example/videos/clip-1.mp4',
        audioUrl: 'https://signed.example/audios/spanish.wav',
        mixMode,
        audioVolume: 65,
        videoVolume: 20,
        fadeIn: 0.5,
        fadeOut: 1,
        outputKey: 'result.mp4',
      });
      expect(h.shared.createMediaDocumentsInternal).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org',
          brandId: 'brand',
          parentId: 'clip-1',
          sourceIds: ['clip-1', 'speech'],
        }),
      );
      expect(h.metadata.patch).toHaveBeenCalledWith(
        'result-meta',
        expect.objectContaining({
          duration: 30,
          s3Key: 'ingredients/videos/result.mp4',
          publicUrl: 'https://cdn.example/result.mp4',
        }),
      );
      expect(h.ingredients.patch).toHaveBeenCalledWith(
        'result',
        expect.objectContaining({
          status: IngredientStatus.GENERATED,
          s3Key: 'ingredients/videos/result.mp4',
        }),
      );
      expect(result).toMatchObject({
        id: 'result',
        videoUrl: 'https://cdn.example/ingredients/videos/result',
      });
    },
  );
  it('marks soundtrack output failed when encoding fails', async () => {
    const h = setup();
    h.files.audioOverlay.mockRejectedValue(new Error('encoding failed'));
    await expect(
      h.run(
        'soundOverlay',
        new Map<string, unknown>([
          ['videoUrl', { id: 'clip-1' }],
          ['soundUrl', { id: 'speech' }],
        ]),
      ),
    ).rejects.toThrow('encoding failed');
    expect(h.ingredients.patch).toHaveBeenCalledWith('result', {
      status: IngredientStatus.FAILED,
    });
    expect(h.metadata.patch).not.toHaveBeenCalled();
  });
  it('rejects an incompatible soundtrack output brand before creating media', async () => {
    const h = setup();
    await expect(
      h.run(
        'soundOverlay',
        new Map<string, unknown>([
          ['videoUrl', { id: 'clip-1' }],
          ['soundUrl', { id: 'speech' }],
        ]),
        { brandId: 'other' },
      ),
    ).rejects.toThrow('brand');
    expect(h.shared.createMediaDocumentsInternal).not.toHaveBeenCalled();
  });
  it('stitches ordered persisted keys and consumes uploaded queue result without reopening a deleted temp file', async () => {
    const h = setup();
    const result = await h.run(
      'videoStitch',
      new Map<string, unknown>([
        [
          'video-2',
          { videoUrl: 'https://cdn.example/ingredients/videos/clip-2' },
        ],
        [
          'video-1',
          { videoUrl: 'https://cdn.example/ingredients/videos/clip-1' },
        ],
      ]),
      { brandId: 'brand', transitionType: 'cut' },
    );
    expect(h.queue.processVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          isPersistedOutputOnly: true,
          sourceIds: ['clip-1', 'clip-2'],
          sourceStorageKeys: [
            'ingredients/videos/clip-1.mp4',
            'ingredients/videos/nested/clip-2.mp4',
          ],
        }),
      }),
    );
    expect(h.files.uploadToS3).not.toHaveBeenCalled();
    expect(h.ingredients.patch).toHaveBeenCalledWith(
      'result',
      expect.objectContaining({
        s3Key: 'ingredients/videos/result',
        status: IngredientStatus.GENERATED,
      }),
    );
    expect(h.metadata.patch).toHaveBeenCalledWith(
      'result-meta',
      expect.objectContaining({
        duration: 6,
        publicUrl: 'https://cdn.example/result',
        s3Key: 'ingredients/videos/result',
      }),
    );
    expect(result).toBeDefined();
  });
  it('rejects mixed-brand stitch sources before queueing', async () => {
    const h = setup();
    const source = h.assets.get('clip-2');
    if (source) source.brandId = 'other';
    await expect(
      h.run(
        'videoStitch',
        new Map<string, unknown>([
          [
            'videos',
            [
              'https://cdn.example/ingredients/videos/clip-1',
              'https://cdn.example/ingredients/videos/clip-2',
            ],
          ],
        ]),
        { brandId: 'brand' },
      ),
    ).rejects.toThrow('selected brand');
    expect(h.queue.processVideo).not.toHaveBeenCalled();
    expect(h.shared.createMediaDocumentsInternal).not.toHaveBeenCalled();
  });
  it('marks a stitch output failed when the queue returns no persisted object', async () => {
    const h = setup();
    h.queue.waitForJob.mockResolvedValueOnce({
      success: true,
      outputPath: '/already/deleted.mp4',
    } as never);
    await expect(
      h.run(
        'videoStitch',
        new Map<string, unknown>([
          [
            'videos',
            [
              'https://cdn.example/ingredients/videos/clip-1',
              'https://cdn.example/ingredients/videos/clip-2',
            ],
          ],
        ]),
        { brandId: 'brand' },
      ),
    ).rejects.toThrow('persisted video');
    expect(h.ingredients.patch).toHaveBeenCalledWith('result', {
      status: IngredientStatus.FAILED,
    });
    expect(h.files.uploadToS3).not.toHaveBeenCalled();
  });
});
