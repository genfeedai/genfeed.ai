import { youtubeSourceUnavailableError } from '@api/collections/workflows/services/youtube-url.util';
import type { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { PublicYoutubeClipsService } from '@api/endpoints/public/services/public-youtube-clips.service';
import type { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import type {
  PublicClipToolStoreService,
  StoredPublicYoutubeClipSession,
} from '@api/services/public-clip-tool/public-clip-tool-store.service';
import { AGENT_CHAT_MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, GoneException } from '@nestjs/common';

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
  const scheduledAnalysisJobs: unknown[] = [];
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
  let actions: Map<
    string,
    (request: { input: Record<string, unknown> }) => Promise<unknown>
  >;
  let service: PublicYoutubeClipsService;
  let runner: SystemWorkflowRunnerService;

  beforeEach(() => {
    vi.clearAllMocks();
    scheduledAnalysisJobs.length = 0;
    store.createSession.mockResolvedValue({
      isNew: true,
      previewToken: token,
      session: storedSession,
    });
    store.toWorkerProjectId.mockReturnValue(
      `public-youtube-clip-session-${'f'.repeat(64)}`,
    );
    store.getSession.mockResolvedValue(storedSession);
    actions = new Map();
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
            const envelope = sessionEnvelope as {
              analysisJobs?: unknown[];
              previewToken?: string;
            };
            scheduledAnalysisJobs.push(...(envelope.analysisJobs ?? []));
            return {
              provenance: {},
              result: await actions.get('youtube.clip.read-session')?.(
                actionRequest({ previewToken: envelope.previewToken }),
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
    expect(scheduledAnalysisJobs).toContainEqual(
      expect.objectContaining({
        highlightFallback: 'deterministic',
        highlightModel: AGENT_CHAT_MODEL_KEYS.NEMOTRON_3_ULTRA_FREE,
        maxClips: 3,
        projectId: `public-youtube-clip-session-${'f'.repeat(64)}`,
      }),
    );
  });

  it.each([
    'not a url',
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
      expect(runner.runWorkflow).not.toHaveBeenCalled();
      expect(scheduledAnalysisJobs).toHaveLength(0);
    },
  );

  it.each([
    'https://www.youtube.com/watch?v=abc12345',
    'https://youtu.be/abc12345?t=10',
    'https://www.youtube.com/shorts/abc12345',
    'https://www.youtube.com/embed/abc12345',
    'https://www.youtube.com/live/abc12345',
  ])('starts the workflow for supported source %s', async (url) => {
    await service.create(url);

    expect(runner.runWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalId: 'public-youtube-clip.create',
        inputValues: expect.objectContaining({
          youtubeUrl: 'https://www.youtube.com/watch?v=abc12345',
        }),
      }),
    );
  });

  it('maps a coded resolve-source failure to a bounded bad request', async () => {
    const sourceFailure = youtubeSourceUnavailableError();
    vi.mocked(runner.runWorkflow).mockRejectedValueOnce(
      new Error(`Nodes failed: resolve-source: ${sourceFailure.message}`),
    );

    try {
      await service.create('https://youtu.be/abc12345');
      expect.unreachable('Expected create to reject an unavailable source');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toEqual({
        code: 'public_youtube_clip_source_unavailable',
        detail: 'The YouTube video is unavailable, private, or unsupported.',
        title: 'Bad Request',
      });
    }
  });

  it('preserves unrelated workflow failures', async () => {
    const failure = new Error('Redis unavailable');
    vi.mocked(runner.runWorkflow).mockRejectedValueOnce(failure);

    await expect(service.create('https://youtu.be/abc12345')).rejects.toBe(
      failure,
    );
  });

  it('emits a token-free code when the read-session action is gone', async () => {
    store.getSession.mockRejectedValueOnce(
      new GoneException('Expired public clip session'),
    );
    const readSession = actions.get('youtube.clip.read-session');

    try {
      await readSession?.({ input: { previewToken: token } });
      expect.unreachable('Expected the read-session action to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(
        '[public_youtube_clip_expired_or_claimed]',
      );
      expect((error as Error).message).not.toContain(token);
    }
  });

  it.each(['getSession', 'reservePreview'] as const)(
    'emits the session code when reserve-preview %s is gone',
    async (operation) => {
      const highlight = {
        clip_type: 'educational',
        end_time: 40,
        id: 'moment-1',
        start_time: 10,
        summary: 'Useful moment',
        tags: [],
        title: 'Useful moment',
        virality_score: 80,
      };
      if (operation === 'getSession') {
        store.getSession.mockRejectedValueOnce(
          new GoneException('Expired public clip session'),
        );
      } else {
        store.getSession.mockResolvedValueOnce({
          ...storedSession,
          highlights: [highlight],
          status: 'ready',
        });
        store.reservePreview.mockRejectedValueOnce(
          new GoneException('Expired public clip session'),
        );
      }
      const reservePreview = actions.get('youtube.clip.reserve-preview');

      await expect(
        reservePreview?.({
          input: { previewToken: token, recommendationId: 'moment-1' },
        }),
      ).rejects.toThrow('[public_youtube_clip_expired_or_claimed]');
    },
  );

  it('restores a bounded gone response from a coded read-session failure', async () => {
    vi.mocked(runner.runWorkflow).mockRejectedValueOnce(
      new Error(
        'Nodes failed: read-session: [public_youtube_clip_expired_or_claimed]',
      ),
    );

    try {
      await service.read(token);
      expect.unreachable('Expected read to reject an expired session');
    } catch (error) {
      expect(error).toBeInstanceOf(GoneException);
      expect((error as GoneException).getResponse()).toEqual({
        code: 'public_youtube_clip_expired_or_claimed',
        detail: 'This free-tool session has expired or was already claimed.',
        title: 'Gone',
      });
    }
  });

  it.each([
    [
      'create',
      () => service.create('https://www.youtube.com/watch?v=abc12345'),
    ],
    ['preview', () => service.requestPreview(token, 'moment-1')],
  ])(
    'restores a bounded gone response from coded %s failure',
    async (_label, invoke) => {
      vi.mocked(runner.runWorkflow).mockRejectedValueOnce(
        new Error(
          'Nodes failed: operation: [public_youtube_clip_expired_or_claimed]',
        ),
      );

      try {
        await invoke();
        expect.unreachable('Expected the public operation to reject');
      } catch (error) {
        expect(error).toBeInstanceOf(GoneException);
        expect((error as GoneException).getResponse()).toEqual({
          code: 'public_youtube_clip_expired_or_claimed',
          detail: 'This free-tool session has expired or was already claimed.',
          title: 'Gone',
        });
      }
    },
  );

  it('preserves unrelated read workflow failures', async () => {
    const failure = new Error('Redis unavailable');
    vi.mocked(runner.runWorkflow).mockRejectedValueOnce(failure);

    await expect(service.read(token)).rejects.toBe(failure);
  });

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

    expect(scheduledAnalysisJobs).toHaveLength(0);
  });

  it('registers terminal workflow compensation for analysis scheduling failure', async () => {
    const createWorkflow = vi
      .mocked(runner.registerWorkflow)
      .mock.calls.map(([definition]) => definition)
      .find(
        (definition) => definition.canonicalId === 'public-youtube-clip.create',
      );
    expect(createWorkflow?.definition.edges).toContainEqual({
      id: 'analysis-failure-to-release',
      source: 'schedule-analysis',
      sourceHandle: 'failure',
      target: 'release-session',
      targetHandle: 'failure',
    });

    await actions.get('youtube.clip.release-session')?.({
      input: {
        failure: {
          error: 'Redis unavailable',
          failedNodeId: 'schedule-analysis',
          nodeOutputs: {
            'create-session': {
              idempotencyKey: 'request-key-1',
              isNew: true,
              previewToken: token,
              session: storedSession,
            },
          },
        },
      },
    });

    expect(store.releaseFailedSession).toHaveBeenCalledWith(
      token,
      'fingerprint',
      'request-key-1',
    );
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
