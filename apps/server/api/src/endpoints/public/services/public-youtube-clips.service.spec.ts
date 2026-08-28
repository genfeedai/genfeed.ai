import { PublicYoutubeClipsService } from '@api/endpoints/public/services/public-youtube-clips.service';
import type { ClipAnalyzeQueueService } from '@api/queues/clip-analyze/clip-analyze.queue.service';
import { AGENT_CHAT_MODEL_KEYS } from '@genfeedai/constants';
import type { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';
import type { SystemWorkflowRunnerService } from '@server/collections/workflows/system-workflow-runner.service';
import type { FileQueueService } from '@server/services/files-microservice/queue/file-queue.service';
import type {
  PublicClipToolStoreService,
  StoredPublicYoutubeClipSession,
} from '@server/services/public-clip-tool/public-clip-tool-store.service';

const token = 'a'.repeat(43);
const storedSession: StoredPublicYoutubeClipSession = {
  createdAt: '2026-08-26T10:00:00.000Z',
  expiresAt: '2026-08-26T12:00:00.000Z',
  highlights: [],
  id: 'session-1',
  language: 'en',
  preview: { status: 'available' },
  progress: 0,
  sourceFingerprint: 'fingerprint',
  sourceVideoUrl: 'https://www.youtube.com/watch?v=abc12345',
  status: 'queued',
  transcriptSegments: [],
};

describe('PublicYoutubeClipsService', () => {
  const queue = { enqueue: vi.fn() };
  const files = { getJobStatus: vi.fn(), processVideo: vi.fn() };
  const logger = { error: vi.fn(), warn: vi.fn() };
  const store = {
    createSession: vi.fn(),
    deleteSession: vi.fn(),
    getSession: vi.fn(),
    patchByToken: vi.fn(),
    releaseFailedSession: vi.fn(),
    reservePreview: vi.fn(),
    toWorkerProjectId: vi.fn(),
  };
  let service: PublicYoutubeClipsService;
  let runner: SystemWorkflowRunnerService;

  beforeEach(() => {
    vi.clearAllMocks();
    store.createSession.mockResolvedValue({
      isNew: true,
      previewToken: token,
      session: storedSession,
    });
    store.toWorkerProjectId.mockReturnValue(
      `public-youtube-clip-session-${'f'.repeat(64)}`,
    );
    queue.enqueue.mockResolvedValue({ id: 'analysis-job' });
    const actions = new Map<
      string,
      (request: { input: Record<string, unknown> }) => Promise<unknown>
    >();
    const actionRequest = (input: Record<string, unknown>) => ({ input });
    runner = {
      registerAction: vi.fn(
        (
          actionId: string,
          executor: (request: {
            input: Record<string, unknown>;
          }) => Promise<unknown>,
        ) => {
          actions.set(actionId, executor);
        },
      ),
      registerWorkflow: vi.fn(),
      runWorkflow: vi.fn(
        async (input: {
          canonicalId: string;
          inputValues?: Record<string, unknown>;
        }) => {
          if (input.canonicalId === 'public-youtube-clip.create') {
            const youtubeUrl = String(input.inputValues?.youtubeUrl ?? '');
            if (!youtubeUrl.includes('youtube.com/watch?v=')) {
              throw new BadRequestException('Unsupported YouTube URL');
            }
            const sessionEnvelope = await actions.get(
              'youtube.clip.create-session',
            )?.(
              actionRequest({
                idempotencyKey: input.inputValues?.idempotencyKey,
                source: {
                  title: 'Public video',
                  videoId: 'abc12345',
                  youtubeUrl,
                },
              }),
            );
            return {
              provenance: {},
              result: await actions.get('youtube.clip.dispatch-analysis')?.(
                actionRequest({ sessionEnvelope }),
              ),
            };
          }
          if (input.canonicalId === 'public-youtube-clip.preview') {
            const previewEnvelope = await actions.get(
              'youtube.clip.reserve-preview',
            )?.(
              actionRequest({
                previewToken: input.inputValues?.previewToken,
                recommendationId: input.inputValues?.recommendationId,
              }),
            );
            return {
              provenance: {},
              result: await actions.get('youtube.clip.dispatch-preview')?.(
                actionRequest({ previewEnvelope }),
              ),
            };
          }
          return {
            provenance: {},
            result: await actions.get('youtube.clip.read-session')?.(
              actionRequest({ previewToken: input.inputValues?.previewToken }),
            ),
          };
        },
      ),
    } as unknown as SystemWorkflowRunnerService;
    service = new PublicYoutubeClipsService(
      queue as unknown as ClipAnalyzeQueueService,
      files as unknown as FileQueueService,
      logger as unknown as LoggerService,
      runner,
      store as unknown as PublicClipToolStoreService,
    );
    service.onModuleInit();
  });

  it('uses the workflow-resolved YouTube source and the free analysis model', async () => {
    await service.create(
      'https://www.youtube.com/watch?v=abc12345',
      'request-key-1',
    );

    expect(store.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'request-key-1',
        sourceVideoUrl: 'https://www.youtube.com/watch?v=abc12345',
      }),
    );
    expect(queue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        highlightFallback: 'deterministic',
        highlightModel: AGENT_CHAT_MODEL_KEYS.OPENROUTER_FREE,
        maxClips: 3,
        projectId: `public-youtube-clip-session-${'f'.repeat(64)}`,
      }),
    );
  });

  it.each([
    'https://evil.example/watch?v=abc12345',
    'https://youtube.com.evil.example/watch?v=abc12345',
    'file:///etc/passwd',
    'https://www.youtube.com/channel/abc12345',
  ])(
    'rejects unsupported source %s before any cost-bearing work',
    async (url) => {
      await expect(service.create(url)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(queue.enqueue).not.toHaveBeenCalled();
    },
  );

  it('does not enqueue a second analysis for an idempotent replay', async () => {
    store.createSession.mockResolvedValue({
      isNew: false,
      previewToken: token,
      session: storedSession,
    });

    await service.create(
      'https://www.youtube.com/watch?v=abc12345',
      'request-key-1',
    );

    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('releases only the failed enqueue reservations so retries stay safe', async () => {
    queue.enqueue.mockRejectedValueOnce(new Error('queue unavailable'));

    await expect(
      service.create(
        'https://www.youtube.com/watch?v=abc12345',
        'request-key-1',
      ),
    ).rejects.toMatchObject({ status: 503 });

    expect(store.releaseFailedSession).toHaveBeenCalledWith(
      token,
      storedSession.sourceFingerprint,
      'request-key-1',
    );
    expect(store.deleteSession).not.toHaveBeenCalled();
  });

  it('renders the one preview from the durable source artifact', async () => {
    const readySession = {
      ...storedSession,
      highlights: [
        {
          clip_type: 'educational',
          end_time: 40,
          id: 'moment-1',
          start_time: 10,
          summary: 'Useful moment',
          tags: [],
          title: 'Useful moment',
          virality_score: 80,
        },
      ],
      sourceVideoS3Key: 'videos/public-source.mp4',
      status: 'ready' as const,
      transcriptSegments: [{ end: 40, start: 0, text: 'Transcript' }],
    };
    store.getSession.mockResolvedValue(readySession);
    store.reservePreview.mockResolvedValue({
      ...readySession,
      preview: {
        jobId: 'public-youtube-preview-session-1',
        recommendationId: 'moment-1',
        status: 'queued',
      },
    });
    files.processVideo.mockResolvedValue({
      ingredientId: 'public-youtube-preview-session-1',
      jobId: 'public-youtube-preview-session-1',
      status: 'queued',
      type: 'clip-trim',
    });
    store.patchByToken.mockResolvedValue({
      ...readySession,
      preview: {
        jobId: 'public-youtube-preview-session-1',
        recommendationId: 'moment-1',
        status: 'generating',
      },
    });

    await service.requestPreview(token, 'moment-1');

    expect(files.processVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          endTime: 40,
          s3Key: 'videos/public-source.mp4',
          startTime: 10,
        }),
      }),
    );
    expect(files.processVideo.mock.calls[0][0].params).not.toHaveProperty(
      'inputPath',
    );
  });
});
