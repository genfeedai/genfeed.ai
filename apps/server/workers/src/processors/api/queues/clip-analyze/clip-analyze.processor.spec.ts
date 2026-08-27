import type { ClipProjectsService } from '@server/collections/clip-projects/clip-projects.service';
import type { PublicClipToolStoreService } from '@server/services/public-clip-tool/public-clip-tool-store.service';
import type { WhisperService } from '@server/services/whisper/whisper.service';
import type { ClipAnalyzeJobData } from '@genfeedai/queue-contracts';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { HttpService } from '@nestjs/axios';
import { ClipAnalyzeProcessor } from '@workers/processors/api/queues/clip-analyze/clip-analyze.processor';
import { ClipHighlightDetector } from '@workers/processors/api/queues/shared/clip-highlight-detector.service';
import type { Job } from 'bullmq';
import { of } from 'rxjs';

type ClipProjectPatchPayload = {
  highlights?: Array<{ id: string; virality_score: number }>;
  progress?: number;
  referenceFrames?: {
    candidates: Array<{ id: string }>;
    status?: string;
  };
  status?: string;
  transcriptSrt?: string;
  transcriptText?: string;
};

type ClipProjectPatchCall = [string, ClipProjectPatchPayload, ...unknown[]];

describe('ClipAnalyzeProcessor', () => {
  let processor: ClipAnalyzeProcessor;
  let clipProjectsService: { patch: ReturnType<typeof vi.fn> };
  let whisperService: { transcribeUrl: ReturnType<typeof vi.fn> };
  let httpService: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
  };
  let configService: { get: ReturnType<typeof vi.fn> };
  let logger: LoggerService;
  let publicClipToolStore: {
    patchByWorkerProjectId: ReturnType<typeof vi.fn>;
  };

  const mockJobData: ClipAnalyzeJobData = {
    language: 'en',
    maxClips: 5,
    minViralityScore: 50,
    orgId: 'org-123',
    projectId: 'proj-123',
    userId: 'user-123',
    youtubeUrl: 'https://www.youtube.com/watch?v=test123',
  };

  const mockTranscription = {
    duration: 120,
    segments: [
      { end: 10, start: 0, text: 'Hello world' },
      { end: 30, start: 10, text: 'This is a test segment' },
    ],
    srt: '1\n00:00:00,000 --> 00:00:10,000\nHello world',
    text: 'Hello world. This is a test segment.',
  };

  const mockHighlightsResponse = {
    data: {
      choices: [
        {
          message: {
            content: JSON.stringify([
              {
                clip_type: 'hook',
                end_time: 90,
                start_time: 10,
                summary: 'Great opening',
                tags: ['intro'],
                title: 'Epic intro',
                virality_score: 85,
              },
              {
                clip_type: 'educational',
                end_time: 40,
                start_time: 25,
                summary: 'Key insight',
                tags: ['learning'],
                title: 'Mind blowing fact',
                virality_score: 72,
              },
              {
                clip_type: 'quote',
                end_time: 90,
                start_time: 55,
                summary: 'Below threshold',
                tags: ['quote'],
                title: 'Low scorer',
                virality_score: 30,
              },
            ]),
          },
        },
      ],
    },
  };

  beforeEach(() => {
    logger = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as LoggerService;

    clipProjectsService = {
      patch: vi.fn().mockResolvedValue({}),
    };

    whisperService = {
      transcribeUrl: vi.fn().mockResolvedValue(mockTranscription),
    };

    httpService = {
      get: vi.fn(),
      post: vi.fn(),
    };

    configService = {
      get: vi.fn().mockReturnValue('mock-api-key'),
    };

    publicClipToolStore = {
      patchByWorkerProjectId: vi.fn().mockResolvedValue(undefined),
    };

    processor = new ClipAnalyzeProcessor(
      logger,
      clipProjectsService as unknown as ClipProjectsService,
      whisperService as unknown as WhisperService,
      httpService as unknown as HttpService,
      configService as unknown as ConfigService,
      new ClipHighlightDetector(
        logger,
        httpService as unknown as HttpService,
        configService as unknown as ConfigService,
      ),
      publicClipToolStore as unknown as PublicClipToolStoreService,
    );
  });

  function createMockJob(
    data: ClipAnalyzeJobData = mockJobData,
  ): Job<ClipAnalyzeJobData> {
    return { data, id: 'job-1' } as unknown as Job<ClipAnalyzeJobData>;
  }

  function setupHttpMocks() {
    // Audio download POST
    httpService.post
      .mockReturnValueOnce(of({ data: { jobId: 'audio-job-1' } }) as never)
      // OpenRouter LLM call
      .mockReturnValueOnce(of(mockHighlightsResponse) as never)
      // Reference frame extraction POST
      .mockReturnValueOnce(of({ data: { jobId: 'frames-job-1' } }) as never);

    // Audio job poll GET
    httpService.get
      .mockReturnValueOnce(
        of({
          data: {
            result: {
              outputUrl: 'https://cdn.test/audio.mp3',
              sourceS3Key: 'clips/sources/proj-123.mp4',
              sourceUrl: 'https://cdn.test/source.mp4',
            },
            state: 'completed',
          },
        }) as never,
      )
      .mockReturnValueOnce(
        of({
          data: {
            result: {
              referenceFrames: {
                candidates: [
                  {
                    assetId: 'frame-1-32500',
                    diagnostics: [],
                    id: 'frame-1-32500',
                    status: 'available',
                    timestampSeconds: 32.5,
                    url: 'https://cdn.test/frame.jpg',
                  },
                ],
                diagnostics: [],
                schemaVersion: 1,
                selectedCandidateId: null,
                status: 'ready',
              },
            },
            state: 'completed',
          },
        }) as never,
      );
  }

  it('should complete the analysis pipeline and set status to analyzed', async () => {
    setupHttpMocks();
    await processor.process(createMockJob());

    const lastPatchCall = clipProjectsService.patch.mock.calls.at(-1) as
      | ClipProjectPatchCall
      | undefined;
    expect(lastPatchCall?.[0]).toBe('proj-123');
    expect(lastPatchCall?.[1]).toMatchObject({
      progress: 100,
      referenceFrames: { status: 'ready' },
      status: 'analyzed',
    });
    expect(lastPatchCall?.[1]).toHaveProperty('highlights');
  });

  it('routes the durable source artifact and ready state to the public session', async () => {
    setupHttpMocks();
    const projectId = `public-youtube-clip-session-${'f'.repeat(64)}`;

    await processor.process(
      createMockJob({
        ...mockJobData,
        highlightFallback: 'deterministic',
        highlightModel: 'openrouter/free',
        projectId,
      }),
    );

    expect(clipProjectsService.patch).not.toHaveBeenCalled();
    expect(publicClipToolStore.patchByWorkerProjectId).toHaveBeenCalledWith(
      projectId,
      expect.objectContaining({
        sourceArtifact: expect.objectContaining({
          contentType: 'video/mp4',
          mediaUrl: 'https://cdn.test/source.mp4',
          storageKey: 'clips/sources/proj-123.mp4',
        }),
        sourceVideoS3Key: 'clips/sources/proj-123.mp4',
        sourceVideoUrl: 'https://cdn.test/source.mp4',
      }),
    );
    expect(publicClipToolStore.patchByWorkerProjectId).toHaveBeenLastCalledWith(
      projectId,
      expect.objectContaining({ status: 'ready' }),
    );
  });

  it('should assign UUIDs to each highlight', async () => {
    setupHttpMocks();
    await processor.process(createMockJob());

    const lastPatchCall = clipProjectsService.patch.mock.calls.at(-1) as
      | ClipProjectPatchCall
      | undefined;
    const highlights = lastPatchCall?.[1]?.highlights ?? [];
    expect(highlights.length).toBeGreaterThan(0);
    for (const h of highlights) {
      expect(h.id).toBeDefined();
      expect(typeof h.id).toBe('string');
      expect(h.id.length).toBeGreaterThan(0);
    }
  });

  it('should filter out highlights below minViralityScore', async () => {
    setupHttpMocks();
    await processor.process(createMockJob());

    const lastPatchCall = clipProjectsService.patch.mock.calls.at(-1) as
      | ClipProjectPatchCall
      | undefined;
    const highlights = lastPatchCall?.[1]?.highlights ?? [];
    // minViralityScore = 50, so the one scoring 30 should be filtered out
    expect(highlights.length).toBe(2);
    for (const h of highlights) {
      expect(h.virality_score).toBeGreaterThanOrEqual(50);
    }
  });

  it('should save transcript data to the project', async () => {
    setupHttpMocks();
    await processor.process(createMockJob());

    const transcriptPatch = (
      clipProjectsService.patch.mock.calls as ClipProjectPatchCall[]
    ).find((call) => call[1]?.transcriptText !== undefined);
    expect(transcriptPatch).toBeDefined();
    expect(transcriptPatch?.[1]?.transcriptText).toBe(mockTranscription.text);
    expect(transcriptPatch?.[1]?.transcriptSrt).toBe(mockTranscription.srt);
  });

  it('transcribes an uploaded audio source from its current durable artifact', async () => {
    httpService.post.mockReturnValue(of(mockHighlightsResponse) as never);
    const data: ClipAnalyzeJobData = {
      ...mockJobData,
      source: {
        artifact: {
          contentType: 'audio/mpeg',
          mediaUrl: 'https://cdn.test/current-audio.mp3',
          storageKey: 'audio/current-audio.mp3',
        },
        contentType: 'audio/mpeg',
        fingerprint: 'sha256:audio',
        flow: 'review',
        kind: 'upload',
        maxRetries: 3,
        retryCount: 0,
        schemaVersion: 1,
        status: 'queued',
        updatedAt: '2026-08-27T00:00:00.000Z',
      },
      youtubeUrl: 'https://cdn.test/stale-audio.mp3',
    };

    await processor.process(createMockJob(data));

    expect(whisperService.transcribeUrl).toHaveBeenCalledWith(
      'https://cdn.test/current-audio.mp3',
      'en',
    );
    expect(httpService.post).not.toHaveBeenCalledWith(
      expect.stringContaining('/v1/files/process/video'),
      expect.anything(),
      expect.anything(),
    );
  });

  it('should derive bounded reference timestamps from accepted highlights', async () => {
    setupHttpMocks();
    await processor.process(createMockJob());

    expect(httpService.post).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('/v1/files/process/video'),
      expect.objectContaining({
        ingredientId: 'proj-123',
        params: {
          inputPath: 'https://cdn.test/source.mp4',
          timestamps: [32.5, 50],
        },
        type: 'extract-reference-frames',
      }),
      expect.any(Object),
    );
    const pendingPatch = (
      clipProjectsService.patch.mock.calls as ClipProjectPatchCall[]
    ).find((call) => call[1]?.referenceFrames?.status === 'pending');
    expect(pendingPatch?.[1]).toMatchObject({ progress: 75 });
    expect(
      pendingPatch?.[1]?.referenceFrames?.candidates.map(
        (candidate) => candidate.id,
      ),
    ).toEqual(['frame-1-32500', 'frame-2-50000']);
  });

  it('should preserve analysis when reference extraction fails', async () => {
    setupHttpMocks();
    httpService.get.mockReset();
    httpService.get
      .mockReturnValueOnce(
        of({
          data: {
            result: { outputUrl: 'https://cdn.test/audio.mp3' },
            state: 'completed',
          },
        }) as never,
      )
      .mockReturnValueOnce(of({ data: { state: 'failed' } }) as never);

    await processor.process(createMockJob());

    const lastPatchCall = clipProjectsService.patch.mock.calls.at(-1) as
      | ClipProjectPatchCall
      | undefined;
    expect(lastPatchCall?.[1]).toMatchObject({
      progress: 100,
      referenceFrames: {
        status: 'unavailable',
      },
      status: 'analyzed',
    });
    expect(lastPatchCall?.[1]).toHaveProperty('highlights');
  });

  it('should set status to failed on error', async () => {
    httpService.post.mockReturnValueOnce(of({ data: {} }) as never);

    await expect(processor.process(createMockJob())).rejects.toThrow();

    const failedPatch = (
      clipProjectsService.patch.mock.calls as ClipProjectPatchCall[]
    ).find((call) => call[1]?.status === 'failed');
    expect(failedPatch).toBeDefined();
  });

  it('should not call ClipGenerationService (no avatar generation)', async () => {
    setupHttpMocks();
    await processor.process(createMockJob());

    // Processor should not have any dependency on ClipGenerationService
    // Verify only patch calls happened, no generation-related calls
    const patchCalls = clipProjectsService.patch.mock
      .calls as ClipProjectPatchCall[];
    const statusUpdates = patchCalls
      .map((call) => call[1]?.status)
      .filter(Boolean);
    expect(statusUpdates).not.toContain('clipping');
    expect(statusUpdates).not.toContain('generating');
  });

  describe('files service URL resolution', () => {
    it('fails loud outside development when the files service URL is unset', async () => {
      configService.get.mockImplementation((key: string) =>
        key === 'GENFEEDAI_MICROSERVICES_FILES_URL' ? undefined : 'api-key',
      );
      Object.assign(configService, { isDevelopment: false });

      await expect(processor.process(createMockJob())).rejects.toThrow(
        'GENFEEDAI_MICROSERVICES_FILES_URL is not configured',
      );

      expect(httpService.post).not.toHaveBeenCalled();
    });

    it('uses the development fallback for audio and reference extraction', async () => {
      configService.get.mockImplementation((key: string) =>
        key === 'GENFEEDAI_MICROSERVICES_FILES_URL' ? undefined : 'api-key',
      );
      Object.assign(configService, { isDevelopment: true });
      setupHttpMocks();

      await processor.process(createMockJob());

      expect(httpService.post).toHaveBeenNthCalledWith(
        1,
        'http://localhost:3012/v1/files/process/video',
        expect.anything(),
        expect.anything(),
      );
      expect(httpService.post).toHaveBeenNthCalledWith(
        3,
        'http://localhost:3012/v1/files/process/video',
        expect.anything(),
        expect.anything(),
      );
    });
  });
});
