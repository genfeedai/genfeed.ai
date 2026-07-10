import type { ClipResultsService } from '@api/collections/clip-results/clip-results.service';
import type { AvatarVideoService } from '@api/services/avatar-video/avatar-video.service';
import type { AvatarVideoProvider } from '@api/services/avatar-video/avatar-video-provider.interface';
import type { LoggerService } from '@libs/logger/logger.service';
import type { Mocked } from 'vitest';
import {
  type ClipGenerationInput,
  ClipGenerationService,
  type ClipHighlight,
} from './clip-generation.service';
import type { RawCutClipService } from './raw-cut-clip.service';

function createMockLogger(): LoggerService {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    verbose: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;
}

function createMockClipResultsService(): Mocked<
  Pick<ClipResultsService, 'create' | 'patch'>
> {
  return {
    create: vi.fn().mockResolvedValue({ id: 'clip-result-1' }),
    patch: vi.fn().mockResolvedValue({}),
  };
}

function createMockProvider(): Mocked<AvatarVideoProvider> {
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
): Mocked<Pick<AvatarVideoService, 'getProvider'>> {
  return {
    getProvider: vi.fn().mockReturnValue(provider),
  };
}

function createMockRawCutClipService(): Mocked<
  Pick<RawCutClipService, 'dispatchClip'>
> {
  return {
    dispatchClip: vi.fn().mockResolvedValue({
      jobId: 'trim-job-1',
      providerName: 'raw-cut',
      status: 'queued',
    }),
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
  let rawCutClipService: ReturnType<typeof createMockRawCutClipService>;
  let provider: ReturnType<typeof createMockProvider>;
  let logger: LoggerService;

  beforeEach(() => {
    clipResultsService = createMockClipResultsService();
    provider = createMockProvider();
    avatarVideoService = createMockAvatarVideoService(provider);
    rawCutClipService = createMockRawCutClipService();
    logger = createMockLogger();

    service = new ClipGenerationService(
      clipResultsService as unknown as ClipResultsService,
      avatarVideoService as unknown as AvatarVideoService,
      rawCutClipService as unknown as RawCutClipService,
      logger,
    );
  });

  it('should create ClipResult records for each highlight', async () => {
    const input = makeInput({
      highlights: [makeHighlight(), makeHighlight({ title: 'Second' })],
    });

    clipResultsService.create
      .mockResolvedValueOnce({ id: 'cr-1' })
      .mockResolvedValueOnce({ id: 'cr-2' });

    const result = await service.generateClips(input);

    expect(clipResultsService.create).toHaveBeenCalledTimes(2);
    expect(result.clipResultIds).toEqual(['cr-1', 'cr-2']);
  });

  it('persists mode "avatar" on every clip-result it creates', async () => {
    await service.generateClips(
      makeInput({
        highlights: [makeHighlight(), makeHighlight({ title: 'Second' })],
      }),
    );

    expect(clipResultsService.create).toHaveBeenCalledTimes(2);
    for (const call of clipResultsService.create.mock.calls) {
      expect(call[0]).toEqual(expect.objectContaining({ mode: 'avatar' }));
    }
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
      .mockResolvedValueOnce({ id: 'cr-1' })
      .mockResolvedValueOnce({ id: 'cr-2' });

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
      .mockResolvedValueOnce({ id: 'cr-1' })
      .mockResolvedValueOnce({ id: 'cr-2' });

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

  // Guards the shared runGenerationLoop skeleton: the extracting-status patch is
  // issued per highlight before dispatch, regardless of the dispatch outcome.
  it('marks every clip extracting even when a dispatch fails', async () => {
    provider.generateVideo
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce({
        jobId: 'job-ok',
        providerName: 'heygen',
        status: 'processing',
      });

    clipResultsService.create
      .mockResolvedValueOnce({ id: 'cr-1' })
      .mockResolvedValueOnce({ id: 'cr-2' });

    await service.generateClips(
      makeInput({
        highlights: [makeHighlight(), makeHighlight({ title: 'Two' })],
      }),
    );

    expect(clipResultsService.patch).toHaveBeenCalledWith('cr-1', {
      status: 'extracting',
    });
    expect(clipResultsService.patch).toHaveBeenCalledWith('cr-2', {
      status: 'extracting',
    });
  });
});

describe('ClipGenerationService (raw-cut mode)', () => {
  let service: ClipGenerationService;
  let clipResultsService: ReturnType<typeof createMockClipResultsService>;
  let avatarVideoService: ReturnType<typeof createMockAvatarVideoService>;
  let rawCutClipService: ReturnType<typeof createMockRawCutClipService>;
  let logger: LoggerService;

  beforeEach(() => {
    clipResultsService = createMockClipResultsService();
    avatarVideoService = createMockAvatarVideoService(createMockProvider());
    rawCutClipService = createMockRawCutClipService();
    logger = createMockLogger();

    service = new ClipGenerationService(
      clipResultsService as unknown as ClipResultsService,
      avatarVideoService as unknown as AvatarVideoService,
      rawCutClipService as unknown as RawCutClipService,
      logger,
    );
  });

  function makeRawCutInput(
    overrides?: Partial<ClipGenerationInput>,
  ): ClipGenerationInput {
    return {
      highlights: [makeHighlight()], // start_time 15, end_time 45
      mode: 'raw-cut',
      orgId: '507f1f77bcf86cd799439011',
      projectId: '507f1f77bcf86cd799439012',
      sourceVideoS3Key: 'videos/source.mp4',
      transcriptSegments: [
        { end: 25, start: 20, text: 'Inside window' },
        { end: 105, start: 100, text: 'Outside window' },
      ],
      userId: '507f1f77bcf86cd799439013',
      ...overrides,
    };
  }

  // Highlight [15, 45] with a segment [20, 25] → offset to [5, 10] of the cut.
  const EXPECTED_SRT = '1\n00:00:05,000 --> 00:00:10,000\nInside window';

  it('persists mode "raw-cut" on every clip-result it creates', async () => {
    await service.generateClips(
      makeRawCutInput({
        highlights: [makeHighlight(), makeHighlight({ title: 'Second' })],
      }),
    );

    expect(clipResultsService.create).toHaveBeenCalledTimes(2);
    for (const call of clipResultsService.create.mock.calls) {
      expect(call[0]).toEqual(expect.objectContaining({ mode: 'raw-cut' }));
    }
  });

  it('creates one clip-result and dispatches one cut per selected highlight', async () => {
    clipResultsService.create
      .mockResolvedValueOnce({ id: 'cr-1' })
      .mockResolvedValueOnce({ id: 'cr-2' });

    const result = await service.generateClips(
      makeRawCutInput({
        highlights: [makeHighlight(), makeHighlight({ title: 'Second' })],
      }),
    );

    expect(clipResultsService.create).toHaveBeenCalledTimes(2);
    expect(rawCutClipService.dispatchClip).toHaveBeenCalledTimes(2);
    expect(result.clipResultIds).toEqual(['cr-1', 'cr-2']);
    expect(result.queuedClipCount).toBe(2);
  });

  it('does not require avatar/voice inputs and never touches the avatar provider', async () => {
    const input = makeRawCutInput();
    expect(input.avatarId).toBeUndefined();
    expect(input.voiceId).toBeUndefined();

    await service.generateClips(input);

    expect(avatarVideoService.getProvider).not.toHaveBeenCalled();
    expect(rawCutClipService.dispatchClip).toHaveBeenCalledTimes(1);
  });

  it('dispatches the highlight window, source reference, and generated SRT', async () => {
    await service.generateClips(makeRawCutInput());

    expect(rawCutClipService.dispatchClip).toHaveBeenCalledWith(
      expect.objectContaining({
        captionSrt: EXPECTED_SRT,
        clipResultId: 'clip-result-1',
        endTime: 45,
        organizationId: '507f1f77bcf86cd799439011',
        sourceVideoS3Key: 'videos/source.mp4',
        startTime: 15,
        userId: '507f1f77bcf86cd799439013',
      }),
    );
  });

  it('marks the clip extracting, then persists the caption SRT and job handle', async () => {
    await service.generateClips(makeRawCutInput());

    expect(clipResultsService.patch).toHaveBeenCalledWith('clip-result-1', {
      status: 'extracting',
    });
    expect(clipResultsService.patch).toHaveBeenCalledWith('clip-result-1', {
      captionSrt: EXPECTED_SRT,
      providerJobId: 'trim-job-1',
      providerName: 'raw-cut',
    });
  });

  it('isolates a per-highlight failure and continues the batch', async () => {
    rawCutClipService.dispatchClip
      .mockRejectedValueOnce(new Error('files service unavailable'))
      .mockResolvedValueOnce({
        jobId: 'trim-job-2',
        providerName: 'raw-cut',
        status: 'queued',
      });

    clipResultsService.create
      .mockResolvedValueOnce({ id: 'cr-1' })
      .mockResolvedValueOnce({ id: 'cr-2' });

    const result = await service.generateClips(
      makeRawCutInput({
        highlights: [makeHighlight(), makeHighlight({ title: 'Two' })],
      }),
    );

    expect(result.clipResultIds).toEqual(['cr-1', 'cr-2']);
    expect(result.providerJobIds).toEqual(['', 'trim-job-2']);
    expect(result.queuedClipCount).toBe(1);
    expect(clipResultsService.patch).toHaveBeenCalledWith('cr-1', {
      providerName: 'raw-cut',
      status: 'failed',
    });
  });
});
