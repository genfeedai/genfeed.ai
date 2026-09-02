import type { ClipProjectsService } from '@api/collections/clip-projects/clip-projects.service';
import type { ClipLibraryLinkService } from '@api/collections/clip-projects/services/clip-library-link.service';
import type { RawCutClipService } from '@api/collections/clip-projects/services/raw-cut-clip.service';
import { RawCutClipCompletionService } from '@api/collections/clip-projects/services/raw-cut-clip-completion.service';
import type { ClipResultsService } from '@api/collections/clip-results/clip-results.service';
import type { ClipResultDocument } from '@api/collections/clip-results/schemas/clip-result.schema';
import type { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import type { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { JobState, Status } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';

function makeClip(
  overrides: Partial<ClipResultDocument> = {},
): ClipResultDocument {
  return {
    captionSrt: '1\n00:00:00,000 --> 00:00:03,000\nLaunch',
    createdAt: new Date(),
    data: {},
    id: 'clip-1',
    isDeleted: false,
    isSelected: false,
    mode: 'raw-cut',
    organizationId: 'org-1',
    projectId: 'project-1',
    providerJobId: 'raw-cut-trim-clip-1',
    readiness: {},
    room: 'room-1',
    sourceVideoS3Key: 'videos/source.mp4',
    startTime: 10,
    endTime: 20,
    status: 'extracting',
    terminalAt: null,
    updatedAt: new Date(),
    userId: 'user-1',
    viralityScore: null,
    ...overrides,
  } as ClipResultDocument;
}

describe('RawCutClipCompletionService', () => {
  let service: RawCutClipCompletionService;
  let clipLibraryLinkService: {
    linkReadyClip: ReturnType<typeof vi.fn>;
  };
  let clipProjectsService: {
    reconcileTerminalState: ReturnType<typeof vi.fn>;
  };
  let clipResultsService: {
    countActiveRawCuts: ReturnType<typeof vi.fn>;
    countRawCutsPendingProjectReconciliation: ReturnType<typeof vi.fn>;
    findActiveRawCuts: ReturnType<typeof vi.fn>;
    findRawCutsPendingProjectReconciliation: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };
  let fileQueueService: {
    getJobStatus: ReturnType<typeof vi.fn>;
    processVideo: ReturnType<typeof vi.fn>;
  };
  let rawCutClipService: {
    dispatchClip: ReturnType<typeof vi.fn>;
  };
  let filesClientService: {
    inspectVideoQa: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    clipLibraryLinkService = {
      linkReadyClip: vi.fn().mockResolvedValue({
        clipResultId: 'clip-1',
        ingredientId: 'ingredient-1',
        status: 'linked',
      }),
    };
    clipProjectsService = {
      reconcileTerminalState: vi.fn().mockResolvedValue(undefined),
    };
    clipResultsService = {
      countActiveRawCuts: vi.fn().mockResolvedValue(0),
      countRawCutsPendingProjectReconciliation: vi.fn().mockResolvedValue(0),
      findActiveRawCuts: vi.fn().mockResolvedValue([]),
      findRawCutsPendingProjectReconciliation: vi.fn().mockResolvedValue([]),
      findOne: vi.fn(),
      patch: vi.fn().mockResolvedValue(undefined),
    };
    fileQueueService = {
      getJobStatus: vi.fn(),
      processVideo: vi.fn().mockResolvedValue({
        jobId: 'raw-cut-frame-clip-1',
        status: 'waiting',
      }),
    };
    rawCutClipService = {
      dispatchClip: vi.fn().mockResolvedValue({
        jobId: 'raw-cut-trim-clip-1',
        providerName: 'raw-cut',
        status: 'waiting',
      }),
    };
    filesClientService = {
      inspectVideoQa: vi.fn().mockResolvedValue({
        decodeOk: true,
        detectLog: '',
        loudnessLog: '-16 LUFS',
        probeJson: JSON.stringify({
          format: { duration: '10' },
          streams: [
            {
              codec_name: 'h264',
              codec_type: 'video',
              height: 1920,
              width: 1080,
            },
            { codec_name: 'aac', codec_type: 'audio' },
          ],
        }),
      }),
    };

    service = new RawCutClipCompletionService(
      clipLibraryLinkService as unknown as ClipLibraryLinkService,
      clipProjectsService as unknown as ClipProjectsService,
      clipResultsService as unknown as ClipResultsService,
      fileQueueService as unknown as FileQueueService,
      filesClientService as unknown as FilesClientService,
      rawCutClipService as unknown as RawCutClipService,
      {
        debug: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        verbose: vi.fn(),
        warn: vi.fn(),
      } as unknown as LoggerService,
    );
  });

  it('persists the trim output and queues subject-safe portrait framing', async () => {
    clipResultsService.findOne.mockResolvedValue(makeClip());

    const handled = await service.handleCompletion({
      ingredientId: 'clip-1',
      organizationId: 'org-1',
      result: {
        jobId: 'raw-cut-trim-clip-1',
        jobType: 'clip-trim',
        s3Key: 'videos/clip-1.mp4',
        url: 'https://cdn.genfeed.ai/videos/clip-1.mp4',
      },
      status: Status.COMPLETED,
      userId: 'user-1',
    });

    expect(handled).toBe(true);
    expect(fileQueueService.processVideo).toHaveBeenCalledWith({
      id: 'raw-cut-frame-clip-1',
      ingredientId: 'clip-1',
      organizationId: 'org-1',
      params: {
        framingMode: 'contain-blur',
        height: 1920,
        s3Key: 'videos/clip-1.mp4',
        width: 1080,
      },
      room: 'room-1',
      type: 'convert-to-portrait',
      userId: 'user-1',
      websocketUrl: '/clips/clip-1',
    });
    expect(clipResultsService.patch).toHaveBeenCalledWith(
      'clip-1',
      {
        providerJobId: 'raw-cut-frame-clip-1',
        status: 'reframing',
        videoS3Key: 'videos/clip-1.mp4',
        videoUrl: 'https://cdn.genfeed.ai/videos/clip-1.mp4',
      },
      [],
      'org-1',
    );
  });

  it('queues caption burning after deterministic portrait framing', async () => {
    fileQueueService.processVideo.mockResolvedValueOnce({
      jobId: 'raw-cut-caption-clip-1',
      status: 'waiting',
    });
    clipResultsService.findOne.mockResolvedValue(
      makeClip({
        providerJobId: 'raw-cut-frame-clip-1',
        status: 'reframing',
      }),
    );

    await service.handleCompletion({
      ingredientId: 'clip-1',
      organizationId: 'org-1',
      result: {
        jobId: 'raw-cut-frame-clip-1',
        jobType: 'convert-to-portrait',
        s3Key: 'videos/clip-1-portrait.mp4',
        url: 'https://cdn.genfeed.ai/videos/clip-1-portrait.mp4',
      },
      status: Status.COMPLETED,
      userId: 'user-1',
    });

    expect(fileQueueService.processVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'raw-cut-caption-clip-1',
        params: expect.objectContaining({
          captionContent: expect.stringContaining('Launch'),
          s3Key: 'videos/clip-1-portrait.mp4',
        }),
        type: 'add-captions',
      }),
    );
    expect(clipResultsService.patch).toHaveBeenCalledWith(
      'clip-1',
      expect.objectContaining({
        framing: expect.objectContaining({
          strategy: 'contain-blur',
          subjectSafety: 'full-source-visible',
        }),
        status: 'captioning',
      }),
      [],
      'org-1',
    );
  });

  it('persists the captioned output and reconciles the parent project', async () => {
    clipResultsService.findOne.mockResolvedValue(
      makeClip({
        providerJobId: 'raw-cut-caption-clip-1',
        status: 'captioning',
      }),
    );

    await service.handleCompletion({
      ingredientId: 'clip-1',
      organizationId: 'org-1',
      result: {
        jobId: 'raw-cut-caption-clip-1',
        jobType: 'add-captions',
        s3Key: 'videos/clip-1.mp4',
        url: 'https://cdn.genfeed.ai/videos/clip-1.mp4',
      },
      status: Status.COMPLETED,
    });

    expect(clipResultsService.patch).toHaveBeenNthCalledWith(
      1,
      'clip-1',
      {
        captionedVideoS3Key: 'videos/clip-1.mp4',
        captionedVideoUrl: 'https://cdn.genfeed.ai/videos/clip-1.mp4',
        status: 'validating',
      },
      [],
      'org-1',
    );
    expect(clipResultsService.patch).toHaveBeenNthCalledWith(
      2,
      'clip-1',
      expect.objectContaining({
        isProjectReconciliationPending: true,
        mediaValidation: expect.objectContaining({ status: 'passed' }),
        status: 'completed',
      }),
      [],
      'org-1',
    );
    expect(clipResultsService.patch).toHaveBeenNthCalledWith(
      3,
      'clip-1',
      { isProjectReconciliationPending: false },
      [],
      'org-1',
    );
    expect(clipLibraryLinkService.linkReadyClip).toHaveBeenCalledWith({
      clipResultId: 'clip-1',
      organizationId: 'org-1',
    });
    expect(clipProjectsService.reconcileTerminalState).toHaveBeenCalledWith(
      'project-1',
      'org-1',
    );
  });

  it('keeps a ready clip when Library linking fails', async () => {
    clipResultsService.findOne.mockResolvedValue(
      makeClip({
        providerJobId: 'raw-cut-caption-clip-1',
        status: 'captioning',
      }),
    );
    clipLibraryLinkService.linkReadyClip.mockResolvedValue({
      clipResultId: 'clip-1',
      error: 'Library write failed',
      status: 'failed',
    });

    await service.handleCompletion({
      ingredientId: 'clip-1',
      organizationId: 'org-1',
      result: {
        jobId: 'raw-cut-caption-clip-1',
        jobType: 'add-captions',
        s3Key: 'videos/clip-1.mp4',
        url: 'https://cdn.genfeed.ai/videos/clip-1.mp4',
      },
      status: Status.COMPLETED,
    });

    expect(clipResultsService.patch).toHaveBeenCalledWith(
      'clip-1',
      expect.objectContaining({ status: 'completed' }),
      [],
      'org-1',
    );
    expect(clipProjectsService.reconcileTerminalState).toHaveBeenCalledWith(
      'project-1',
      'org-1',
    );
  });

  it('marks media that fails preflight as degraded and does not link it', async () => {
    clipResultsService.findOne.mockResolvedValue(
      makeClip({
        providerJobId: 'raw-cut-caption-clip-1',
        status: 'captioning',
      }),
    );
    filesClientService.inspectVideoQa.mockResolvedValue({
      decodeOk: true,
      detectLog: '',
      loudnessLog: null,
      probeJson: JSON.stringify({
        format: { duration: '10' },
        streams: [
          {
            codec_name: 'h264',
            codec_type: 'video',
            height: 1080,
            width: 1920,
          },
        ],
      }),
    });

    await service.handleCompletion({
      ingredientId: 'clip-1',
      organizationId: 'org-1',
      result: {
        jobId: 'raw-cut-caption-clip-1',
        jobType: 'add-captions',
        s3Key: 'videos/clip-1.mp4',
        url: 'https://cdn.genfeed.ai/videos/clip-1.mp4',
      },
      status: Status.COMPLETED,
    });

    expect(clipResultsService.patch).toHaveBeenCalledWith(
      'clip-1',
      expect.objectContaining({
        mediaValidation: expect.objectContaining({
          issues: expect.arrayContaining([
            'Rendered video is not 1080x1920 portrait media.',
            'Rendered video is missing its source audio.',
          ]),
          status: 'failed',
        }),
        status: 'degraded',
      }),
      [],
      'org-1',
    );
    expect(clipLibraryLinkService.linkReadyClip).not.toHaveBeenCalled();
  });

  it('keeps media validation retryable when inspection is unavailable', async () => {
    clipResultsService.findOne.mockResolvedValue(
      makeClip({
        providerJobId: 'raw-cut-caption-clip-1',
        status: 'captioning',
      }),
    );
    filesClientService.inspectVideoQa.mockRejectedValue(
      new Error('Files service unavailable'),
    );

    await expect(
      service.handleCompletion({
        ingredientId: 'clip-1',
        organizationId: 'org-1',
        result: {
          jobId: 'raw-cut-caption-clip-1',
          jobType: 'add-captions',
          s3Key: 'videos/clip-1.mp4',
          url: 'https://cdn.genfeed.ai/videos/clip-1.mp4',
        },
        status: Status.COMPLETED,
      }),
    ).rejects.toThrow('Files service unavailable');

    expect(clipResultsService.patch).toHaveBeenCalledTimes(1);
    expect(clipResultsService.patch).toHaveBeenCalledWith(
      'clip-1',
      {
        captionedVideoS3Key: 'videos/clip-1.mp4',
        captionedVideoUrl: 'https://cdn.genfeed.ai/videos/clip-1.mp4',
        status: 'validating',
      },
      [],
      'org-1',
    );
    expect(clipLibraryLinkService.linkReadyClip).not.toHaveBeenCalled();
    expect(clipProjectsService.reconcileTerminalState).not.toHaveBeenCalled();
  });

  it('isolates a failed media job to its clip result', async () => {
    clipResultsService.findOne.mockResolvedValue(makeClip());

    await service.handleCompletion({
      error: 'ffmpeg failed',
      ingredientId: 'clip-1',
      organizationId: 'org-1',
      result: {
        jobId: 'raw-cut-trim-clip-1',
        jobType: 'clip-trim',
      },
      status: Status.FAILED,
    });

    expect(clipResultsService.patch).toHaveBeenNthCalledWith(
      1,
      'clip-1',
      {
        error: 'ffmpeg failed',
        isProjectReconciliationPending: true,
        status: 'failed',
      },
      [],
      'org-1',
    );
    expect(clipResultsService.patch).toHaveBeenNthCalledWith(
      2,
      'clip-1',
      { isProjectReconciliationPending: false },
      [],
      'org-1',
    );
    expect(clipProjectsService.reconcileTerminalState).toHaveBeenCalledWith(
      'project-1',
      'org-1',
    );
    expect(fileQueueService.processVideo).not.toHaveBeenCalled();
  });

  it('polls active raw-cut jobs to recover a missed completion event', async () => {
    const clip = makeClip();
    clipResultsService.countActiveRawCuts.mockResolvedValue(1);
    clipResultsService.findActiveRawCuts.mockResolvedValue([clip]);
    clipResultsService.findOne.mockResolvedValue(clip);
    fileQueueService.getJobStatus.mockResolvedValue({
      jobId: 'raw-cut-trim-clip-1',
      result: {
        jobId: 'raw-cut-trim-clip-1',
        jobType: 'clip-trim',
        s3Key: 'videos/clip-1.mp4',
        url: 'https://cdn.genfeed.ai/videos/clip-1.mp4',
      },
      state: JobState.COMPLETED,
    });

    await service.reconcileActiveClips();

    expect(fileQueueService.getJobStatus).toHaveBeenCalledWith(
      'raw-cut-trim-clip-1',
    );
    expect(fileQueueService.processVideo).toHaveBeenCalled();
  });

  it('redispatches a durably described trim when the queue job is missing', async () => {
    const clip = makeClip();
    clipResultsService.countActiveRawCuts.mockResolvedValue(1);
    clipResultsService.findActiveRawCuts.mockResolvedValue([clip]);
    fileQueueService.getJobStatus.mockRejectedValue(new Error('not found'));

    await service.reconcileActiveClips();

    expect(rawCutClipService.dispatchClip).toHaveBeenCalledWith({
      captionSrt: '1\n00:00:00,000 --> 00:00:03,000\nLaunch',
      clipResultId: 'clip-1',
      endTime: 20,
      organizationId: 'org-1',
      room: 'room-1',
      sourceVideoS3Key: 'videos/source.mp4',
      sourceVideoUrl: undefined,
      startTime: 10,
      userId: 'user-1',
    });
    expect(clipResultsService.patch).toHaveBeenCalledWith(
      'clip-1',
      { providerJobId: 'raw-cut-trim-clip-1' },
      [],
      'org-1',
    );
  });

  it('keeps a stale but active queue job alive', async () => {
    const clip = makeClip({
      updatedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
    });
    clipResultsService.countActiveRawCuts.mockResolvedValue(1);
    clipResultsService.findActiveRawCuts.mockResolvedValue([clip]);
    fileQueueService.getJobStatus.mockResolvedValue({
      jobId: 'raw-cut-trim-clip-1',
      state: JobState.ACTIVE,
    });

    await service.reconcileActiveClips();

    expect(clipResultsService.patch).not.toHaveBeenCalled();
    expect(rawCutClipService.dispatchClip).not.toHaveBeenCalled();
  });

  it('does not downgrade a completed clip when a failure event is replayed', async () => {
    clipResultsService.findOne.mockResolvedValue(
      makeClip({
        isProjectReconciliationPending: false,
        status: 'completed',
      }),
    );

    await service.handleCompletion({
      error: 'late failure',
      ingredientId: 'clip-1',
      organizationId: 'org-1',
      result: {
        jobId: 'raw-cut-trim-clip-1',
        jobType: 'clip-trim',
      },
      status: Status.FAILED,
    });

    expect(clipResultsService.patch).not.toHaveBeenCalled();
    expect(clipProjectsService.reconcileTerminalState).not.toHaveBeenCalled();
  });

  it('leaves the trim stage retryable when framing queueing fails', async () => {
    clipResultsService.findOne.mockResolvedValue(makeClip());
    fileQueueService.processVideo.mockRejectedValueOnce(
      new Error('queue unavailable'),
    );

    await expect(
      service.handleCompletion({
        ingredientId: 'clip-1',
        organizationId: 'org-1',
        result: {
          jobId: 'raw-cut-trim-clip-1',
          jobType: 'clip-trim',
          s3Key: 'videos/clip-1.mp4',
          url: 'https://cdn.genfeed.ai/videos/clip-1.mp4',
        },
        status: Status.COMPLETED,
        userId: 'user-1',
      }),
    ).rejects.toThrow('queue unavailable');

    expect(clipResultsService.patch).not.toHaveBeenCalled();
  });

  it('rejects an unscoped completion before querying clip data', async () => {
    await expect(
      service.handleCompletion({
        ingredientId: 'clip-1',
        organizationId: '',
        status: Status.COMPLETED,
      }),
    ).resolves.toBe(true);

    expect(clipResultsService.findOne).not.toHaveBeenCalled();
  });

  it('retries parent reconciliation from a durable terminal marker', async () => {
    const clip = makeClip({
      isProjectReconciliationPending: true,
      status: 'completed',
    });
    clipResultsService.countRawCutsPendingProjectReconciliation.mockResolvedValue(
      1,
    );
    clipResultsService.findRawCutsPendingProjectReconciliation.mockResolvedValue(
      [clip],
    );

    await service.reconcileActiveClips();

    expect(clipProjectsService.reconcileTerminalState).toHaveBeenCalledWith(
      'project-1',
      'org-1',
    );
    expect(clipResultsService.patch).toHaveBeenCalledWith(
      'clip-1',
      { isProjectReconciliationPending: false },
      [],
      'org-1',
    );
  });

  it('ignores a duplicated trim event after the caption stage starts', async () => {
    clipResultsService.findOne.mockResolvedValue(
      makeClip({
        providerJobId: 'raw-cut-trim-clip-1',
        status: 'captioning',
      }),
    );

    await service.handleCompletion({
      ingredientId: 'clip-1',
      organizationId: 'org-1',
      result: {
        jobId: 'raw-cut-trim-clip-1',
        jobType: 'clip-trim',
        s3Key: 'videos/clip-1.mp4',
        url: 'https://cdn.genfeed.ai/videos/clip-1.mp4',
      },
      status: Status.COMPLETED,
    });

    expect(clipResultsService.patch).not.toHaveBeenCalled();
    expect(fileQueueService.processVideo).not.toHaveBeenCalled();
  });
});
