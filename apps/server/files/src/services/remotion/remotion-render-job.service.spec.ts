vi.mock('node:fs', () => ({
  statSync: vi.fn().mockReturnValue({ size: 4096 }),
}));
vi.mock('node:fs/promises', () => ({
  rm: vi.fn().mockResolvedValue(undefined),
}));

import { rm } from 'node:fs/promises';
import { JOB_TYPES } from '@files/queues/queue.constants';
import { BRANDED_AVATAR_RENDER_FIXTURE } from '@files/services/remotion/fixtures/branded-avatar.fixture';
import { RemotionRenderJobService } from '@files/services/remotion/remotion-render-job.service';
import type { VideoJobData } from '@files/shared/interfaces/job.interface';
import { EDITOR_RENDERER_VERSION } from '@genfeedai/interfaces';
import type { Job } from 'bullmq';

describe('RemotionRenderJobService', () => {
  const ffmpegService = {
    cleanupTempFiles: vi.fn(),
    getTempPath: vi.fn().mockReturnValue('/tmp/editor-render-output'),
  };
  const remotionRendererService = {
    render: vi.fn().mockImplementation(async (_params, _output, onProgress) => {
      onProgress(0.5);
    }),
  };
  const s3Service = {
    generateS3Key: vi.fn().mockReturnValue('videos/output-123.mp4'),
    getPublicUrl: vi
      .fn()
      .mockReturnValue('https://cdn.example.com/videos/output-123.mp4'),
    uploadFile: vi.fn().mockResolvedValue(undefined),
  };
  const webSocketService = {
    emitError: vi.fn(),
    emitProgress: vi.fn(),
    emitSuccess: vi.fn(),
  };
  const redisService = { publish: vi.fn().mockResolvedValue(1) };
  const logger = { error: vi.fn() };

  const data = {
    authProviderUserId: 'auth-user',
    createdAt: new Date(),
    id: 'job-data-123',
    ingredientId: 'output-123',
    metadata: { websocketUrl: '/videos/output-123' },
    organizationId: 'org-123',
    params: {
      ...BRANDED_AVATAR_RENDER_FIXTURE,
      editorRender: {
        authProviderUserId: 'auth-user',
        ingredientId: 'output-123',
        jobId: 'job-123',
        metadataId: 'metadata-123',
        projectId: 'project-123',
        room: 'user-room',
      },
    },
    room: 'user-room',
    type: JOB_TYPES.RENDER_EDITOR_COMPOSITION,
    userId: 'database-user',
  } as unknown as VideoJobData;

  const makeJob = (attemptsMade = 1): Job<VideoJobData> =>
    ({
      attemptsMade,
      data,
      id: 'job-123',
      name: JOB_TYPES.RENDER_EDITOR_COMPOSITION,
      opts: { attempts: 2 },
      updateProgress: vi.fn().mockResolvedValue(undefined),
    }) as unknown as Job<VideoJobData>;

  const makeService = () =>
    new RemotionRenderJobService(
      ffmpegService as never,
      remotionRendererService as never,
      s3Service as never,
      webSocketService as never,
      redisService as never,
      logger as never,
    );

  afterEach(() => {
    vi.clearAllMocks();
    remotionRendererService.render.mockImplementation(
      async (_params, _output, onProgress) => {
        onProgress(0.5);
      },
    );
  });

  it('renders, uploads, reports progress, and returns durable metadata', async () => {
    const job = makeJob();

    const result = await makeService().process(job);

    expect(remotionRendererService.render).toHaveBeenCalledWith(
      expect.objectContaining({ rendererVersion: EDITOR_RENDERER_VERSION }),
      '/tmp/editor-render-output/composition.mp4',
      expect.any(Function),
    );
    expect(job.updateProgress).toHaveBeenCalledWith(50);
    expect(s3Service.uploadFile).toHaveBeenCalledWith(
      'videos/output-123.mp4',
      '/tmp/editor-render-output/composition.mp4',
      'video/mp4',
    );
    expect(result).toEqual({
      durationFrames: 300,
      durationSeconds: 10,
      fps: 30,
      height: 1920,
      rendererVersion: EDITOR_RENDERER_VERSION,
      s3Key: 'videos/output-123.mp4',
      size: 4096,
      success: true,
      url: 'https://cdn.example.com/videos/output-123.mp4',
      width: 1080,
    });
    expect(rm).toHaveBeenCalledWith('/tmp/editor-render-output', {
      force: true,
      recursive: true,
    });
  });

  it('publishes a failed terminal event and removes temporary output', async () => {
    remotionRendererService.render.mockRejectedValueOnce(
      new Error('renderer failed'),
    );

    await expect(makeService().process(makeJob())).rejects.toThrow(
      'renderer failed',
    );

    expect(webSocketService.emitError).toHaveBeenCalled();
    expect(redisService.publish).toHaveBeenCalledWith(
      'video-processing-complete',
      expect.objectContaining({ status: 'failed' }),
    );
    expect(rm).toHaveBeenCalledWith('/tmp/editor-render-output', {
      force: true,
      recursive: true,
    });
  });

  it('leaves a retryable first-attempt failure non-terminal', async () => {
    remotionRendererService.render.mockRejectedValueOnce(
      new Error('transient renderer failure'),
    );

    await expect(makeService().process(makeJob(0))).rejects.toThrow(
      'transient renderer failure',
    );

    expect(webSocketService.emitError).not.toHaveBeenCalled();
    expect(redisService.publish).not.toHaveBeenCalledWith(
      'video-processing-complete',
      expect.objectContaining({ status: 'failed' }),
    );
  });
});
