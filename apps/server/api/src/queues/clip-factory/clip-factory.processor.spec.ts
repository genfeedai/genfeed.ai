import type { ClipProjectsService } from '@api/collections/clip-projects/clip-projects.service';
import type { ClipGenerationService } from '@api/collections/clip-projects/services/clip-generation.service';
import type { ConfigService } from '@api/config/config.service';
import type { ClipFactoryJobData } from '@api/queues/clip-factory/clip-factory.constants';
import type { WhisperService } from '@api/services/whisper/whisper.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { HttpService } from '@nestjs/axios';
import type { Job } from 'bullmq';
import { of } from 'rxjs';
import { ClipFactoryProcessor } from './clip-factory.processor';

function createMockLogger(): LoggerService {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    verbose: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;
}

function makeJobData(
  overrides?: Partial<ClipFactoryJobData>,
): ClipFactoryJobData {
  return {
    avatarId: 'avatar-1',
    avatarProvider: 'heygen',
    language: 'en',
    maxClips: 10,
    minViralityScore: 50,
    orgId: '507f1f77bcf86cd799439011',
    projectId: '507f1f77bcf86cd799439012',
    userId: '507f1f77bcf86cd799439013',
    voiceId: 'voice-1',
    youtubeUrl: 'https://www.youtube.com/watch?v=test123',
    ...overrides,
  };
}

function makeJob(data: ClipFactoryJobData): Job<ClipFactoryJobData> {
  return { data, id: 'job-1' } as Job<ClipFactoryJobData>;
}

describe('ClipFactoryProcessor', () => {
  let processor: ClipFactoryProcessor;
  let logger: LoggerService;
  let clipProjectsService: { patch: ReturnType<typeof vi.fn> };
  let clipGenerationService: { generateClips: ReturnType<typeof vi.fn> };
  let whisperService: { transcribeUrl: ReturnType<typeof vi.fn> };
  let httpService: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
  };
  let configService: { get: ReturnType<typeof vi.fn> };

  const transcriptionResult = {
    duration: 120,
    language: 'en',
    segments: [
      { end: 10, start: 0, text: 'Hello world' },
      { end: 20, start: 10, text: 'This is great content' },
      { end: 45, start: 15, text: 'Amazing hook right here' },
    ],
    srt: '1\n00:00:00,000 --> 00:00:10,000\nHello world',
    text: 'Hello world. This is great content. Amazing hook right here.',
  };

  const highlightsResponse = {
    data: {
      choices: [
        {
          message: {
            content: JSON.stringify([
              {
                clip_type: 'hook',
                end_time: 45,
                start_time: 15,
                summary: 'A compelling moment',
                tags: ['ai'],
                title: 'Great Hook',
                virality_score: 85,
              },
            ]),
          },
        },
      ],
    },
  };

  beforeEach(() => {
    logger = createMockLogger();

    clipProjectsService = { patch: vi.fn().mockResolvedValue({}) };
    clipGenerationService = {
      generateClips: vi.fn().mockResolvedValue({
        clipResultIds: ['cr-1'],
        providerJobIds: ['job-1'],
        queuedClipCount: 1,
      }),
    };
    whisperService = {
      transcribeUrl: vi.fn().mockResolvedValue(transcriptionResult),
    };

    httpService = {
      get: vi.fn(),
      post: vi.fn(),
    };

    configService = {
      get: vi.fn().mockReturnValue('http://localhost:3012'),
    };

    // Mock audio download: POST to files service, then GET for polling
    httpService.post.mockImplementation((url: string) => {
      if (url.includes('/v1/files/process/video')) {
        return of({ data: { jobId: 'audio-job-1' } });
      }
      // OpenRouter LLM call
      return of(highlightsResponse);
    });

    httpService.get.mockReturnValue(
      of({
        data: {
          result: { outputUrl: 'https://cdn.example.com/audio.mp3' },
          status: 'completed',
        },
      }),
    );

    processor = new ClipFactoryProcessor(
      logger,
      clipProjectsService as unknown as ClipProjectsService,
      clipGenerationService as unknown as ClipGenerationService,
      whisperService as unknown as WhisperService,
      httpService as unknown as HttpService,
      configService as unknown as ConfigService,
    );
  });

  it('should complete the full pipeline successfully', async () => {
    const data = makeJobData();
    await processor.process(makeJob(data));

    // Verify status progression
    expect(clipProjectsService.patch).toHaveBeenCalledWith(
      data.projectId,
      expect.objectContaining({ status: 'transcribing' }),
    );
    expect(clipProjectsService.patch).toHaveBeenCalledWith(
      data.projectId,
      expect.objectContaining({ status: 'analyzing' }),
    );
    expect(clipProjectsService.patch).toHaveBeenCalledWith(
      data.projectId,
      expect.objectContaining({ status: 'clipping' }),
    );
    expect(clipProjectsService.patch).toHaveBeenCalledWith(
      data.projectId,
      expect.objectContaining({ progress: 60, status: 'generating' }),
    );
  });

  it('should call whisperService.transcribeUrl with the audio URL', async () => {
    await processor.process(makeJob(makeJobData()));

    expect(whisperService.transcribeUrl).toHaveBeenCalledWith(
      'https://cdn.example.com/audio.mp3',
      'en',
    );
  });

  it('should filter highlights by minViralityScore', async () => {
    const lowScoreResponse = {
      data: {
        choices: [
          {
            message: {
              content: JSON.stringify([
                {
                  clip_type: 'hook',
                  end_time: 45,
                  start_time: 15,
                  summary: 'Low score',
                  tags: [],
                  title: 'Low',
                  virality_score: 20,
                },
              ]),
            },
          },
        ],
      },
    };

    // Override the OpenRouter call to return low-score highlight
    httpService.post.mockImplementation((url: string) => {
      if (url.includes('/v1/files/process/video')) {
        return of({ data: { jobId: 'audio-job-1' } });
      }
      return of(lowScoreResponse);
    });

    await processor.process(makeJob(makeJobData({ minViralityScore: 50 })));

    // Should complete without generating clips
    expect(clipGenerationService.generateClips).not.toHaveBeenCalled();
    expect(clipProjectsService.patch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ status: 'completed' }),
    );
  });

  it('should fail the project when no provider jobs are queued', async () => {
    clipGenerationService.generateClips.mockResolvedValueOnce({
      clipResultIds: ['cr-1'],
      providerJobIds: [''],
      queuedClipCount: 0,
    });

    await processor.process(makeJob(makeJobData()));

    expect(clipProjectsService.patch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        error: 'Clip generation failed before any provider job was queued.',
        status: 'failed',
      }),
    );
  });

  it('should set project to failed when audio download fails', async () => {
    httpService.post.mockReturnValue(of({ data: {} }));

    await expect(processor.process(makeJob(makeJobData()))).rejects.toThrow();

    expect(clipProjectsService.patch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ status: 'failed' }),
    );
  });

  it('should set project to failed when transcription fails', async () => {
    whisperService.transcribeUrl.mockRejectedValueOnce(
      new Error('Transcription timeout'),
    );

    await expect(processor.process(makeJob(makeJobData()))).rejects.toThrow(
      'Transcription timeout',
    );

    expect(clipProjectsService.patch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ status: 'failed' }),
    );
  });

  it('should pass avatarProvider to clipGenerationService', async () => {
    await processor.process(makeJob(makeJobData({ avatarProvider: 'heygen' })));

    expect(clipGenerationService.generateClips).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'heygen' }),
    );
  });
});
