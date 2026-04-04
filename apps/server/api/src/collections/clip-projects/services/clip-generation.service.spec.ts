import type { ClipResultsService } from '@api/collections/clip-results/clip-results.service';
import type { AvatarVideoService } from '@api/services/avatar-video/avatar-video.service';
import type { AvatarVideoProvider } from '@api/services/avatar-video/avatar-video-provider.interface';
import type { LoggerService } from '@libs/logger/logger.service';
import {
  type ClipGenerationInput,
  ClipGenerationService,
  type ClipHighlight,
} from './clip-generation.service';

function createMockLogger(): LoggerService {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    verbose: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;
}

function createMockClipResultsService(): jest.Mocked<
  Pick<ClipResultsService, 'create' | 'patch'>
> {
  return {
    create: vi.fn().mockResolvedValue({ _id: 'clip-result-1' }),
    patch: vi.fn().mockResolvedValue({}),
  };
}

function createMockProvider(): jest.Mocked<AvatarVideoProvider> {
  return {
    generateVideo: vi.fn().mockResolvedValue({
      jobId: 'heygen-job-1',
      providerName: 'heygen',
      status: 'processing',
    }),
    getStatus: vi.fn().mockResolvedValue({
      jobId: 'heygen-job-1',
      providerName: 'heygen',
      status: 'processing',
    }),
    providerName: 'heygen',
  };
}

function createMockAvatarVideoService(
  provider: AvatarVideoProvider,
): jest.Mocked<Pick<AvatarVideoService, 'getProvider'>> {
  return {
    getProvider: vi.fn().mockReturnValue(provider),
  };
}

function makeHighlight(overrides?: Partial<ClipHighlight>): ClipHighlight {
  return {
    clip_type: 'hook',
    end_time: 45,
    start_time: 15,
    summary: 'A compelling moment',
    tags: ['ai', 'tech'],
    title: 'Test Highlight',
    virality_score: 85,
    ...overrides,
  };
}

function makeInput(
  overrides?: Partial<ClipGenerationInput>,
): ClipGenerationInput {
  return {
    avatarId: 'avatar-123',
    highlights: [makeHighlight()],
    orgId: '507f1f77bcf86cd799439011',
    projectId: '507f1f77bcf86cd799439012',
    userId: '507f1f77bcf86cd799439013',
    voiceId: 'voice-456',
    ...overrides,
  };
}

describe('ClipGenerationService', () => {
  let service: ClipGenerationService;
  let clipResultsService: ReturnType<typeof createMockClipResultsService>;
  let avatarVideoService: ReturnType<typeof createMockAvatarVideoService>;
  let provider: ReturnType<typeof createMockProvider>;
  let logger: LoggerService;

  beforeEach(() => {
    clipResultsService = createMockClipResultsService();
    provider = createMockProvider();
    avatarVideoService = createMockAvatarVideoService(provider);
    logger = createMockLogger();

    service = new ClipGenerationService(
      clipResultsService as unknown as ClipResultsService,
      avatarVideoService as unknown as AvatarVideoService,
      logger,
    );
  });

  it('should create ClipResult records for each highlight', async () => {
    const input = makeInput({
      highlights: [makeHighlight(), makeHighlight({ title: 'Second' })],
    });

    clipResultsService.create
      .mockResolvedValueOnce({ _id: 'cr-1' })
      .mockResolvedValueOnce({ _id: 'cr-2' });

    const result = await service.generateClips(input);

    expect(clipResultsService.create).toHaveBeenCalledTimes(2);
    expect(result.clipResultIds).toEqual(['cr-1', 'cr-2']);
  });

  it('should dispatch avatar generation via the correct provider', async () => {
    const input = makeInput({ provider: 'heygen' });

    await service.generateClips(input);

    expect(avatarVideoService.getProvider).toHaveBeenCalledWith('heygen');
    expect(provider.generateVideo).toHaveBeenCalledTimes(1);
    expect(provider.generateVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        avatarId: 'avatar-123',
        callbackId: 'clip-result-1',
        voiceId: 'voice-456',
      }),
    );
  });

  it('should default to heygen when no provider specified', async () => {
    const input = makeInput();
    delete (input as Record<string, unknown>).provider;

    await service.generateClips(input);

    expect(avatarVideoService.getProvider).toHaveBeenCalledWith('heygen');
  });

  it('should set clip status to extracting before firing generation', async () => {
    await service.generateClips(makeInput());

    expect(clipResultsService.patch).toHaveBeenCalledWith('clip-result-1', {
      status: 'extracting',
    });
  });

  it('should persist provider metadata when a job is queued successfully', async () => {
    await service.generateClips(makeInput());

    expect(clipResultsService.patch).toHaveBeenCalledWith('clip-result-1', {
      providerJobId: 'heygen-job-1',
      providerName: 'heygen',
    });
  });

  it('should mark clip as failed when provider errors', async () => {
    provider.generateVideo.mockRejectedValueOnce(new Error('API timeout'));

    const result = await service.generateClips(makeInput());

    expect(clipResultsService.patch).toHaveBeenCalledWith('clip-result-1', {
      providerName: 'heygen',
      status: 'failed',
    });
    expect(result.providerJobIds).toEqual(['']);
    expect(result.queuedClipCount).toBe(0);
  });

  it('should mark clip as failed when provider returns failed status', async () => {
    provider.generateVideo.mockResolvedValueOnce({
      error: 'Insufficient credits',
      jobId: '',
      providerName: 'heygen',
      status: 'failed',
    });

    const result = await service.generateClips(makeInput());

    expect(clipResultsService.patch).toHaveBeenCalledWith('clip-result-1', {
      providerName: 'heygen',
      status: 'failed',
    });
    expect(result.providerJobIds).toEqual(['']);
    expect(result.queuedClipCount).toBe(0);
  });

  it('should return provider job IDs for successful generations', async () => {
    provider.generateVideo
      .mockResolvedValueOnce({
        jobId: 'job-a',
        providerName: 'heygen',
        status: 'processing',
      })
      .mockResolvedValueOnce({
        jobId: 'job-b',
        providerName: 'heygen',
        status: 'processing',
      });

    clipResultsService.create
      .mockResolvedValueOnce({ _id: 'cr-1' })
      .mockResolvedValueOnce({ _id: 'cr-2' });

    const result = await service.generateClips(
      makeInput({
        highlights: [makeHighlight(), makeHighlight({ title: 'Two' })],
      }),
    );

    expect(result.providerJobIds).toEqual(['job-a', 'job-b']);
    expect(result.queuedClipCount).toBe(2);
  });

  it('should build script from highlight title + summary', async () => {
    const highlight = makeHighlight({
      summary: 'This is why it matters',
      title: 'The Big Reveal',
    });

    await service.generateClips(makeInput({ highlights: [highlight] }));

    expect(provider.generateVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        script: 'The Big Reveal. This is why it matters',
      }),
    );
  });

  it('should continue processing remaining clips when one fails', async () => {
    provider.generateVideo
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce({
        jobId: 'job-ok',
        providerName: 'heygen',
        status: 'processing',
      });

    clipResultsService.create
      .mockResolvedValueOnce({ _id: 'cr-1' })
      .mockResolvedValueOnce({ _id: 'cr-2' });

    const result = await service.generateClips(
      makeInput({
        highlights: [makeHighlight(), makeHighlight({ title: 'Two' })],
      }),
    );

    expect(result.clipResultIds).toEqual(['cr-1', 'cr-2']);
    expect(result.providerJobIds).toEqual(['', 'job-ok']);
    expect(result.queuedClipCount).toBe(1);
    // First clip failed, second succeeded
    expect(clipResultsService.patch).toHaveBeenCalledWith('cr-1', {
      providerName: 'heygen',
      status: 'failed',
    });
  });
});
