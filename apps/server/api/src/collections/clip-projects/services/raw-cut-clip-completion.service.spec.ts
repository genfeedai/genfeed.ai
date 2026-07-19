import type { ClipProjectsService } from '@api/collections/clip-projects/clip-projects.service';
import type { RawCutClipService } from '@api/collections/clip-projects/services/raw-cut-clip.service';
import { RawCutClipCompletionService } from '@api/collections/clip-projects/services/raw-cut-clip-completion.service';
import type { ClipResultsService } from '@api/collections/clip-results/clip-results.service';
import type { ClipResultDocument } from '@api/collections/clip-results/schemas/clip-result.schema';
import type { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { JobState, Status } from '@genfeedai/enums';
import type { LoggerService } from '@libs/logger/logger.service';

function makeClip(
  overrides: Partial<ClipResultDocument> = {},
): ClipResultDocument {
  return {
    _id: 'clip-1',
    authProviderUserId: 'auth-user-1',
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

  beforeEach(() => {
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
        jobId: 'raw-cut-caption-clip-1',
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

    service = new RawCutClipCompletionService(
      clipProjectsService as unknown as ClipProjectsService,
      clipResultsService as unknown as ClipResultsService,
      fileQueueService as unknown as FileQueueService,
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

  it('persists the trim output and queues deterministic caption burning', async () => {
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
      authProviderUserId: 'auth-user-1',
      id: 'raw-cut-caption-clip-1',
      ingredientId: 'clip-1',
      organizationId: 'org-1',
      params: {
        captionContent: '1\n00:00:00,000 --> 00:00:03,000\nLaunch',
        s3Key: 'videos/clip-1.mp4',
      },
      room: 'room-1',
      type: 'add-captions',
      userId: 'user-1',
      websocketUrl: '/clips/clip-1',
    });
    expect(clipResultsService.patch).toHaveBeenCalledWith('clip-1', {
      providerJobId: 'raw-cut-caption-clip-1',
      status: 'captioning',
      videoS3Key: 'videos/clip-1.mp4',
      videoUrl: 'https://cdn.genfeed.ai/videos/clip-1.mp4',
    });
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

    expect(clipResultsService.patch).toHaveBeenNthCalledWith(1, 'clip-1', {
      captionedVideoS3Key: 'videos/clip-1.mp4',
      captionedVideoUrl: 'https://cdn.genfeed.ai/videos/clip-1.mp4',
      isProjectReconciliationPending: true,
      status: 'completed',
    });
    expect(clipResultsService.patch).toHaveBeenNthCalledWith(2, 'clip-1', {
      isProjectReconciliationPending: false,
    });
    expect(clipProjectsService.reconcileTerminalState).toHaveBeenCalledWith(
      'project-1',
      'org-1',
    );
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

    expect(clipResultsService.patch).toHaveBeenNthCalledWith(1, 'clip-1', {
      error: 'ffmpeg failed',
      isProjectReconciliationPending: true,
      status: 'failed',
    });
    expect(clipResultsService.patch).toHaveBeenNthCalledWith(2, 'clip-1', {
      isProjectReconciliationPending: false,
    });
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
      authProviderUserId: 'auth-user-1',
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
    expect(clipResultsService.patch).toHaveBeenCalledWith('clip-1', {
      providerJobId: 'raw-cut-trim-clip-1',
    });
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

  it('leaves the trim stage retryable when caption queueing fails', async () => {
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
    expect(clipResultsService.patch).toHaveBeenCalledWith('clip-1', {
      isProjectReconciliationPending: false,
    });
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
