import type { ClipProjectsService } from '@api/collections/clip-projects/clip-projects.service';
import type { WhisperService } from '@api/services/whisper/whisper.service';
import type { ClipAnalyzeJobData } from '@genfeedai/queue-contracts';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { HttpService } from '@nestjs/axios';
import { ClipAnalyzeProcessor } from '@workers/processors/api/queues/clip-analyze/clip-analyze.processor';
import { ClipHighlightDetector } from '@workers/processors/api/queues/shared/clip-highlight-detector.service';
import type { Job } from 'bullmq';
import { of } from 'rxjs';

describe('ClipAnalyzeProcessor', () => {
  let processor: ClipAnalyzeProcessor;
  let clipProjectsService: vi.Mocked<ClipProjectsService>;
  let whisperService: vi.Mocked<WhisperService>;
  let httpService: vi.Mocked<HttpService>;
  let configService: vi.Mocked<ConfigService>;
  let logger: vi.Mocked<LoggerService>;

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
                end_time: 100,
                start_time: 0,
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
    } as unknown as vi.Mocked<LoggerService>;

    clipProjectsService = {
      patch: vi.fn().mockResolvedValue({}),
    } as unknown as vi.Mocked<ClipProjectsService>;

    whisperService = {
      transcribeUrl: vi.fn().mockResolvedValue(mockTranscription),
    } as unknown as vi.Mocked<WhisperService>;

    httpService = {
      get: vi.fn(),
      post: vi.fn(),
    } as unknown as vi.Mocked<HttpService>;

    configService = {
      get: vi.fn().mockReturnValue('mock-api-key'),
    } as unknown as vi.Mocked<ConfigService>;

    processor = new ClipAnalyzeProcessor(
      logger,
      clipProjectsService,
      whisperService,
      httpService,
      configService,
      new ClipHighlightDetector(logger, httpService, configService),
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
            result: { outputUrl: 'https://cdn.test/audio.mp3' },
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

    const lastPatchCall = clipProjectsService.patch.mock.calls.at(-1);
    expect(lastPatchCall?.[0]).toBe('proj-123');
    expect(lastPatchCall?.[1]).toMatchObject({
      progress: 100,
      referenceFrames: { status: 'ready' },
      status: 'analyzed',
    });
    expect(lastPatchCall?.[1]).toHaveProperty('highlights');
  });

  it('should assign UUIDs to each highlight', async () => {
    setupHttpMocks();
    await processor.process(createMockJob());

    const lastPatchCall = clipProjectsService.patch.mock.calls.at(-1);
    const highlights = lastPatchCall?.[1]?.highlights as Array<{ id: string }>;
    expect(highlights).toBeDefined();
    for (const h of highlights) {
      expect(h.id).toBeDefined();
      expect(typeof h.id).toBe('string');
      expect(h.id.length).toBeGreaterThan(0);
    }
  });

  it('should filter out highlights below minViralityScore', async () => {
    setupHttpMocks();
    await processor.process(createMockJob());

    const lastPatchCall = clipProjectsService.patch.mock.calls.at(-1);
    const highlights = lastPatchCall?.[1]?.highlights as Array<{
      virality_score: number;
    }>;
    // minViralityScore = 50, so the one scoring 30 should be filtered out
    expect(highlights.length).toBe(2);
    for (const h of highlights) {
      expect(h.virality_score).toBeGreaterThanOrEqual(50);
    }
  });

  it('should save transcript data to the project', async () => {
    setupHttpMocks();
    await processor.process(createMockJob());

    const transcriptPatch = clipProjectsService.patch.mock.calls.find(
      (call) => call[1]?.transcriptText !== undefined,
    );
    expect(transcriptPatch).toBeDefined();
    expect(transcriptPatch?.[1]?.transcriptText).toBe(mockTranscription.text);
    expect(transcriptPatch?.[1]?.transcriptSrt).toBe(mockTranscription.srt);
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
          inputPath: mockJobData.youtubeUrl,
          timestamps: [32.5, 50],
        },
        type: 'extract-reference-frames',
      }),
      expect.any(Object),
    );
    const pendingPatch = clipProjectsService.patch.mock.calls.find(
      (call) => call[1]?.referenceFrames?.status === 'pending',
    );
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

    const lastPatchCall = clipProjectsService.patch.mock.calls.at(-1);
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

    const failedPatch = clipProjectsService.patch.mock.calls.find(
      (call) => call[1]?.status === 'failed',
    );
    expect(failedPatch).toBeDefined();
  });

  it('should not call ClipGenerationService (no avatar generation)', async () => {
    setupHttpMocks();
    await processor.process(createMockJob());

    // Processor should not have any dependency on ClipGenerationService
    // Verify only patch calls happened, no generation-related calls
    const patchCalls = clipProjectsService.patch.mock.calls;
    const statusUpdates = patchCalls
      .map((call) => call[1]?.status)
      .filter(Boolean);
    expect(statusUpdates).not.toContain('clipping');
    expect(statusUpdates).not.toContain('generating');
  });
});
