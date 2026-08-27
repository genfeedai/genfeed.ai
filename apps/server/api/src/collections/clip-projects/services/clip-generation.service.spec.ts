import type { ClipResultsService } from '@api/collections/clip-results/clip-results.service';
import type { AvatarVideoService } from '@api/services/avatar-video/avatar-video.service';
import type { AvatarVideoProvider } from '@api/services/avatar-video/avatar-video-provider.interface';
import type { ClipOrchestratorService } from '@api/services/clip-orchestrator/clip-orchestrator.service';
import { ClipRunState } from '@api/services/clip-orchestrator/clip-run-state.enum';
import type { ClipReferenceProvenance } from '@genfeedai/interfaces';
import { testId } from '@helpers/testing/test-id.helper';
import type { LoggerService } from '@libs/logger/logger.service';
import type { Mocked } from 'vitest';
import {
  type ClipGenerationInput,
  ClipGenerationService,
  type ClipHighlight,
} from './clip-generation.service';
import type { RawCutClipService } from './raw-cut-clip.service';

const orgId = testId('org');
const projectId = testId('project');
const userId = testId('user');

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
  Pick<
    ClipResultsService,
    'create' | 'createGenerated' | 'patch' | 'transitionProviderTerminal'
  >
> {
  return {
    create: vi.fn().mockResolvedValue({ id: 'clip-result-1' }),
    createGenerated: vi.fn().mockResolvedValue({ id: 'clip-result-1' }),
    patch: vi.fn().mockResolvedValue({}),
    transitionProviderTerminal: vi.fn().mockResolvedValue(true),
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
      jobId: 'raw-cut-trim-clip-result-1',
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
    hookApprovalRequired: false,
    orgId,
    projectId,
    userId,
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

  it('dispatches only the hook and stores the remaining immutable plan when approval is required', async () => {
    const orchestrator = {
      startRun: vi.fn().mockResolvedValue({ id: 'run-1' }),
      transition: vi.fn().mockResolvedValue({}),
      updateMetadata: vi.fn().mockResolvedValue({}),
    };
    service = new ClipGenerationService(
      clipResultsService as unknown as ClipResultsService,
      avatarVideoService as unknown as AvatarVideoService,
      rawCutClipService as unknown as RawCutClipService,
      logger,
      orchestrator as unknown as ClipOrchestratorService,
    );
    const hook = makeHighlight({ title: 'Hook' });
    const body = makeHighlight({ clip_type: 'body', title: 'Body' });
    const productReference = Object.freeze({
      assetId: 'product-1',
      description: 'Ceramic mug',
      role: 'product' as const,
      url: 'https://cdn.example.com/product.png',
    });

    const result = await service.generateClips(
      makeInput({
        highlights: [body, hook],
        hookApprovalRequired: undefined,
        runReferences: Object.freeze([productReference]),
      }),
    );

    expect(provider.generateVideo).toHaveBeenCalledTimes(1);
    expect(provider.generateVideo).toHaveBeenCalledWith(
      expect.objectContaining({ script: 'Hook. A compelling moment' }),
    );
    expect(result.clipResultIds).toEqual(['clip-result-1']);
    expect(orchestrator.transition).toHaveBeenCalledWith(
      'run-1',
      ClipRunState.Generating,
    );
    expect(orchestrator.updateMetadata).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({
        hookApproval: expect.objectContaining({
          attempt: 1,
          hookClipResultId: 'clip-result-1',
          hookInput: expect.objectContaining({
            highlights: [hook],
            runReferences: [productReference],
          }),
          remainingInput: expect.objectContaining({
            highlights: [body],
            runReferences: [productReference],
          }),
        }),
      }),
    );
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

  it('persists provider metadata before a provider can deliver its callback', async () => {
    provider.generateVideo.mockImplementation(async (input) => {
      await input.onJobCreated?.({
        jobId: 'argil-job-1',
        providerName: 'argil',
      });
      return {
        jobId: 'argil-job-1',
        providerName: 'argil',
        status: 'processing',
      };
    });

    await service.generateClips(makeInput({ provider: 'argil' }));

    expect(clipResultsService.patch).toHaveBeenCalledTimes(2);
    expect(clipResultsService.patch).toHaveBeenNthCalledWith(
      2,
      'clip-result-1',
      {
        providerJobId: 'argil-job-1',
        providerName: 'argil',
      },
      [],
      orgId,
    );
  });

  it('forwards a resolved reference only through the provider reference field', async () => {
    await service.generateClips(
      makeInput({
        referenceImageUrl: 'https://cdn.example.com/reference.jpg',
      }),
    );

    expect(provider.generateVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceImageUrl: 'https://cdn.example.com/reference.jpg',
      }),
    );
  });

  it('persists the same categorized run references on every clip brief', async () => {
    const runReferences = Object.freeze([
      Object.freeze({
        assetId: 'face-1',
        description: 'Hero character sheet',
        role: 'character' as const,
        url: 'https://cdn.example.com/face.png',
      }),
      Object.freeze({
        assetId: 'product-1',
        description: 'Ceramic mug in glacier blue',
        role: 'product' as const,
        url: 'https://cdn.example.com/product.png',
      }),
    ]);

    await service.generateClips(
      makeInput({
        highlights: [makeHighlight(), makeHighlight({ title: 'Second' })],
        runReferences,
      }),
    );

    expect(provider.generateVideo).toHaveBeenCalledTimes(2);
    for (const call of provider.generateVideo.mock.calls) {
      expect(call[0]).toEqual(
        expect.objectContaining({
          referenceImageUrl: 'https://cdn.example.com/face.png',
        }),
      );
    }
    expect(clipResultsService.create).toHaveBeenCalledTimes(2);
    const briefs = clipResultsService.create.mock.calls.map(
      ([dto]) =>
        (dto as unknown as { generationBrief: unknown }).generationBrief,
    );
    expect(briefs[0]).toMatchObject({
      references: [
        {
          assetId: 'face-1',
          description: 'Hero character sheet',
          role: 'character',
        },
        {
          assetId: 'product-1',
          description: 'Ceramic mug in glacier blue',
          role: 'product',
        },
      ],
    });
    expect(briefs[1]).toMatchObject({
      references: (briefs[0] as { references: unknown }).references,
    });
  });

  it('persists stable redacted reference provenance on every result', async () => {
    const referenceProvenance = {
      application: {
        mode: 'avatar',
        nativeField: 'photo_url',
        provider: 'heygen',
        state: 'applied' as const,
      },
      schemaVersion: 1 as const,
      source: {
        candidateId: 'frame-1',
        storageKey: 'ingredients/images/org-1/frame-1.jpg',
        timestampSeconds: 12.5,
      },
    } satisfies ClipReferenceProvenance;

    await service.generateClips(
      makeInput({
        highlights: [makeHighlight(), makeHighlight({ title: 'Second' })],
        referenceImageUrl: 'https://cdn.example.com/reference.jpg',
        referenceProvenance,
      }),
    );

    expect(clipResultsService.createGenerated).toHaveBeenCalledTimes(2);
    for (const call of clipResultsService.createGenerated.mock.calls) {
      expect(call[1]).toEqual(referenceProvenance);
      expect(JSON.stringify(call[1])).not.toContain('cdn.example.com');
    }
  });

  it('does not add reference fields when no candidate was selected', async () => {
    await service.generateClips(makeInput());

    expect(provider.generateVideo).toHaveBeenCalledWith(
      expect.not.objectContaining({
        referenceImageUrl: expect.anything(),
      }),
    );
    expect(clipResultsService.create).toHaveBeenCalledWith(
      expect.not.objectContaining({
        referenceProvenance: expect.anything(),
      }),
    );
    expect(clipResultsService.createGenerated).not.toHaveBeenCalled();
  });

  it('should default to heygen when no provider specified', async () => {
    const input = makeInput();
    delete (input as Record<string, unknown>).provider;

    await service.generateClips(input);

    expect(avatarVideoService.getProvider).toHaveBeenCalledWith('heygen');
  });

  it('should set clip status to extracting before firing generation', async () => {
    await service.generateClips(makeInput());

    expect(clipResultsService.patch).toHaveBeenCalledWith(
      'clip-result-1',
      {
        providerName: 'heygen',
        status: 'extracting',
      },
      [],
      orgId,
    );
  });

  it('should persist provider metadata when a job is queued successfully', async () => {
    await service.generateClips(makeInput());

    expect(clipResultsService.patch).toHaveBeenCalledWith(
      'clip-result-1',
      {
        providerJobId: 'heygen-job-1',
        providerName: 'heygen',
      },
      [],
      orgId,
    );
  });

  it('persists and reconciles an inline managed-provider completion', async () => {
    Object.assign(provider, { providerName: 'genfeedai' as const });
    provider.generateVideo.mockImplementation(async (input) => {
      await input.onJobCreated?.({
        jobId: 'genfeedai-clip-clip-result-1',
        providerName: 'genfeedai',
      });
      return {
        jobId: 'genfeedai-clip-clip-result-1',
        providerName: 'genfeedai',
        status: 'completed',
        videoUrl: 'https://cdn.genfeed.ai/clips/clip-result-1.mp4',
      };
    });
    const clipLibraryLinkService = {
      linkReadyClip: vi.fn().mockResolvedValue({ status: 'linked' }),
    };
    const clipProjectsService = {
      reconcileTerminalState: vi.fn().mockResolvedValue({}),
    };
    service = new ClipGenerationService(
      clipResultsService as unknown as ClipResultsService,
      avatarVideoService as unknown as AvatarVideoService,
      rawCutClipService as unknown as RawCutClipService,
      logger,
      undefined,
      clipLibraryLinkService as never,
      clipProjectsService as never,
    );

    const result = await service.generateClips(
      makeInput({
        avatarId: undefined,
        provider: 'genfeedai',
        referenceImageUrl: 'https://cdn.example.com/character.png',
        voiceId: undefined,
      }),
    );

    expect(result).toEqual({
      clipResultIds: ['clip-result-1'],
      completedClipCount: 1,
      providerJobIds: ['genfeedai-clip-clip-result-1'],
      queuedClipCount: 1,
    });
    expect(clipResultsService.transitionProviderTerminal).toHaveBeenCalledWith({
      clipResultId: 'clip-result-1',
      providerJobId: 'genfeedai-clip-clip-result-1',
      providerName: 'genfeedai',
      status: 'completed',
      videoUrl: 'https://cdn.genfeed.ai/clips/clip-result-1.mp4',
    });
    expect(clipLibraryLinkService.linkReadyClip).toHaveBeenCalledWith({
      clipResultId: 'clip-result-1',
      organizationId: orgId,
    });
    expect(clipProjectsService.reconcileTerminalState).toHaveBeenCalledWith(
      projectId,
      orgId,
    );
  });

  it('does not count an inline completion when its terminal transition is stale', async () => {
    Object.assign(provider, { providerName: 'genfeedai' as const });
    provider.generateVideo.mockResolvedValue({
      jobId: 'genfeedai-clip-clip-result-1',
      providerName: 'genfeedai',
      status: 'completed',
      videoUrl: 'https://cdn.genfeed.ai/clips/clip-result-1.mp4',
    });
    clipResultsService.transitionProviderTerminal.mockResolvedValue(false);
    const clipLibraryLinkService = {
      linkReadyClip: vi.fn().mockResolvedValue({ status: 'linked' }),
    };
    const clipProjectsService = {
      reconcileTerminalState: vi.fn().mockResolvedValue({}),
    };
    service = new ClipGenerationService(
      clipResultsService as unknown as ClipResultsService,
      avatarVideoService as unknown as AvatarVideoService,
      rawCutClipService as unknown as RawCutClipService,
      logger,
      undefined,
      clipLibraryLinkService as never,
      clipProjectsService as never,
    );

    const result = await service.generateClips(
      makeInput({
        avatarId: undefined,
        provider: 'genfeedai',
        referenceImageUrl: 'https://cdn.example.com/character.png',
        voiceId: undefined,
      }),
    );

    expect(result).not.toHaveProperty('completedClipCount');
    expect(clipLibraryLinkService.linkReadyClip).not.toHaveBeenCalled();
    expect(clipProjectsService.reconcileTerminalState).not.toHaveBeenCalled();
  });

  it('should mark clip as failed when provider errors', async () => {
    provider.generateVideo.mockRejectedValueOnce(new Error('API timeout'));

    const result = await service.generateClips(makeInput());

    expect(clipResultsService.patch).toHaveBeenCalledWith(
      'clip-result-1',
      {
        providerName: 'heygen',
        status: 'failed',
      },
      [],
      orgId,
    );
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

    expect(clipResultsService.patch).toHaveBeenCalledWith(
      'clip-result-1',
      {
        providerName: 'heygen',
        status: 'failed',
      },
      [],
      orgId,
    );
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
    expect(clipResultsService.patch).toHaveBeenCalledWith(
      'cr-1',
      {
        providerName: 'heygen',
        status: 'failed',
      },
      [],
      orgId,
    );
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

    expect(clipResultsService.patch).toHaveBeenCalledWith(
      'cr-1',
      {
        providerName: 'heygen',
        status: 'extracting',
      },
      [],
      orgId,
    );
    expect(clipResultsService.patch).toHaveBeenCalledWith(
      'cr-2',
      {
        providerName: 'heygen',
        status: 'extracting',
      },
      [],
      orgId,
    );
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
      orgId,
      projectId,
      sourceVideoS3Key: 'videos/source.mp4',
      transcriptSegments: [
        { end: 25, start: 20, text: 'Inside window' },
        { end: 105, start: 100, text: 'Outside window' },
      ],
      userId,
      ...overrides,
    };
  }

  // Highlight [15, 45] with a segment [20, 25] → offset to the cut, with
  // the 40ms visual lead and 120ms tail from generateClipSrt.
  const EXPECTED_SRT = '1\n00:00:04,960 --> 00:00:10,120\nInside window';

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
        organizationId: orgId,
        sourceVideoS3Key: 'videos/source.mp4',
        startTime: 15,
        userId,
      }),
    );
  });

  it('persists recovery metadata before dispatching the trim job', async () => {
    rawCutClipService.dispatchClip.mockImplementationOnce(async () => {
      expect(clipResultsService.patch).toHaveBeenCalledWith(
        'clip-result-1',
        expect.objectContaining({
          captionSrt: EXPECTED_SRT,
          providerJobId: 'raw-cut-trim-clip-result-1',
          providerName: 'raw-cut',
          sourceVideoS3Key: 'videos/source.mp4',
          userId,
        }),
        [],
        orgId,
      );
      return {
        jobId: 'raw-cut-trim-clip-result-1',
        providerName: 'raw-cut',
        status: 'queued',
      };
    });

    await service.generateClips(makeRawCutInput());

    expect(clipResultsService.patch).toHaveBeenCalledWith(
      'clip-result-1',
      {
        providerName: 'raw-cut',
        status: 'extracting',
      },
      [],
      orgId,
    );
    expect(clipResultsService.patch).toHaveBeenCalledWith(
      'clip-result-1',
      expect.objectContaining({
        captionSrt: EXPECTED_SRT,
        providerJobId: 'raw-cut-trim-clip-result-1',
        providerName: 'raw-cut',
        sourceVideoS3Key: 'videos/source.mp4',
        userId,
      }),
      [],
      orgId,
    );
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
    expect(clipResultsService.patch).toHaveBeenCalledWith(
      'cr-1',
      {
        providerName: 'raw-cut',
        status: 'failed',
      },
      [],
      orgId,
    );
  });
});
