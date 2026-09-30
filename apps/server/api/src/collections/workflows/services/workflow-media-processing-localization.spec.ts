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
import { VideoStitchFixture } from '@api/services/video-stitch/video-stitch.fixture';
import {
  IngredientCategory,
  IngredientStatus,
  JobState,
  VideoTransition,
} from '@genfeedai/contracts';
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
  const stitch = new VideoStitchFixture();
  stitch.addClip({
    brandId: 'brand',
    id: 'clip-1',
    organizationId: 'org',
    s3Key: 'ingredients/videos/clip-1.mp4',
  });
  stitch.addClip({
    brandId: 'brand',
    id: 'clip-2',
    organizationId: 'org',
    s3Key: 'ingredients/videos/nested/clip-2.mp4',
  });
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
    undefined,
    undefined,
    stitch.service,
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
      {
        executionId: 'exec-1',
        organizationId: 'org',
        runId: 'run-1',
        userId: 'user',
      } as Parameters<NodeExecutor>[2],
    );
  };
  return { assets, ingredients, metadata, shared, files, queue, run, stitch };
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
  it('stitches ordered clips through the stitch service with persisted keys', async () => {
    const h = setup();
    h.stitch.completeJob('stitch-output-1', 'ingredients/videos/output-1');
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
      {
        brandId: 'brand',
        transitionDuration: 0.5,
        transitionType: 'crossfade',
      },
    );
    expect(h.stitch.mergeJobs()).toEqual([
      expect.objectContaining({
        id: 'stitch-output-1',
        params: {
          isPersistedOutputOnly: true,
          sourceIds: ['clip-1', 'clip-2'],
          sourceStorageKeys: [
            'ingredients/videos/clip-1.mp4',
            'ingredients/videos/nested/clip-2.mp4',
          ],
          transition: 'fade',
          transitionDuration: 0.5,
        },
      }),
    ]);
    expect(h.stitch.row('output-1')).toMatchObject({
      generationSource: 'video-stitch:workflow',
      s3Key: 'ingredients/videos/output-1',
      sourceActionId: 'workflow:run-1:node',
      status: IngredientStatus.GENERATED,
      workflowExecutionId: 'exec-1',
    });
    expect(result).toMatchObject({ ingredientId: 'output-1' });
    expect(h.queue.processVideo).not.toHaveBeenCalled();
    expect(h.files.uploadToS3).not.toHaveBeenCalled();
    expect(result).toBeDefined();
  });
  it('rejects mixed-brand stitch sources before queueing', async () => {
    const h = setup();
    h.stitch.row('clip-2').brandId = 'other';
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
    ).rejects.toThrow('Found 1 of 2 videos ready to merge');
    expect(h.stitch.queued).toEqual([]);
    expect(h.stitch.outputs()).toEqual([]);
  });
  it('retains a stitch output without a persisted object and accepts its late artifact', async () => {
    const h = setup();
    const inputs = new Map<string, unknown>([
      [
        'videos',
        [
          'https://cdn.example/ingredients/videos/clip-1',
          'https://cdn.example/ingredients/videos/clip-2',
        ],
      ],
    ]);
    h.stitch.jobResults.set('stitch-output-1', {
      outputPath: '/already/deleted.mp4',
      success: true,
    });
    await expect(
      h.run('videoStitch', inputs, { brandId: 'brand' }),
    ).rejects.toThrow('persisted video');
    expect(h.stitch.row('output-1').status).toBe(IngredientStatus.PROCESSING);
    expect(h.stitch.eventsNamed('media.failed')).toEqual([]);
    h.stitch.completeJob('stitch-output-1', 'ingredients/videos/output-1');
    await h.run('videoStitch', inputs, { brandId: 'brand' });
    expect(h.stitch.row('output-1').status).toBe(IngredientStatus.GENERATED);
    expect(h.stitch.mergeJobs()).toHaveLength(1);
    expect(h.files.uploadToS3).not.toHaveBeenCalled();
  });
  it('re-enqueues a processing output whose job was lost when the node reruns', async () => {
    const h = setup();
    const inputs = new Map<string, unknown>([
      [
        'videos',
        [
          'https://cdn.example/ingredients/videos/clip-1',
          'https://cdn.example/ingredients/videos/clip-2',
        ],
      ],
    ]);
    // The API stopped after creating the output, before its job survived.
    await h.stitch.service.stitch({
      brandId: 'brand',
      callerKind: 'workflow',
      clipIds: ['clip-1', 'clip-2'],
      idempotencyKey: 'workflow:run-1:node',
      organizationId: 'org',
      settings: { transition: VideoTransition.NONE },
      userId: 'user',
    });
    h.stitch.dropJob('stitch-output-1');
    h.stitch.jobResults.set('stitch-output-1', {
      s3Key: 'ingredients/videos/output-1',
      success: true,
    });

    await h.run('videoStitch', inputs, { brandId: 'brand' });

    expect(h.stitch.mergeJobs().map((job) => job.id)).toEqual([
      'stitch-output-1',
      'stitch-output-1',
    ]);
    expect(h.stitch.row('output-1').status).toBe(IngredientStatus.GENERATED);
  });
  it('requeues the same output after a confirmed failed worker job', async () => {
    const h = setup();
    const inputs = new Map<string, unknown>([
      [
        'videos',
        [
          'https://cdn.example/ingredients/videos/clip-1',
          'https://cdn.example/ingredients/videos/clip-2',
        ],
      ],
    ]);
    h.stitch.jobStates.set('stitch-output-1', JobState.FAILED);
    h.stitch.failWaitFor.set('stitch-output-1', new Error('ffmpeg exited'));
    await expect(
      h.run('videoStitch', inputs, { brandId: 'brand' }),
    ).rejects.toThrow('ffmpeg exited');
    h.stitch.failWaitFor.delete('stitch-output-1');
    h.stitch.completeJob('stitch-output-1', 'ingredients/videos/output-1');

    await h.run('videoStitch', inputs, { brandId: 'brand' });

    expect(h.stitch.outputs()).toHaveLength(1);
    expect(h.stitch.mergeJobs().map((job) => job.id)).toEqual([
      'stitch-output-1',
      'stitch-output-1',
    ]);
    expect(h.stitch.row('output-1').status).toBe(IngredientStatus.GENERATED);
  });
});
