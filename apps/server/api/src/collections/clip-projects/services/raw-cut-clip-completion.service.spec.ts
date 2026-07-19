import type { ClipProjectsService } from '@api/collections/clip-projects/clip-projects.service';
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
    status: 'extracting',
    terminalAt: null,
    updatedAt: new Date(),
    user: 'user-1',
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
    findActiveRawCuts: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };
  let fileQueueService: {
    getJobStatus: ReturnType<typeof vi.fn>;
    processVideo: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    clipProjectsService = {
      reconcileTerminalState: vi.fn().mockResolvedValue(undefined),
    };
    clipResultsService = {
      findActiveRawCuts: vi.fn().mockResolvedValue([]),
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

    service = new RawCutClipCompletionService(
      clipProjectsService as unknown as ClipProjectsService,
      clipResultsService as unknown as ClipResultsService,
      fileQueueService as unknown as FileQueueService,
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
    expect(clipResultsService.patch).toHaveBeenNthCalledWith(1, 'clip-1', {
      status: 'captioning',
      videoS3Key: 'videos/clip-1.mp4',
      videoUrl: 'https://cdn.genfeed.ai/videos/clip-1.mp4',
    });
    expect(fileQueueService.processVideo).toHaveBeenCalledWith({
      id: 'raw-cut-caption-clip-1',
      ingredientId: 'clip-1',
      organizationId: 'org-1',
      params: {
        captionContent: '1\n00:00:00,000 --> 00:00:03,000\nLaunch',
        s3Key: 'videos/clip-1.mp4',
      },
      type: 'add-captions',
      userId: 'user-1',
      websocketUrl: '/clips/clip-1',
    });
    expect(clipResultsService.patch).toHaveBeenNthCalledWith(2, 'clip-1', {
      providerJobId: 'raw-cut-caption-clip-1',
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

    expect(clipResultsService.patch).toHaveBeenCalledWith('clip-1', {
      captionedVideoS3Key: 'videos/clip-1.mp4',
      captionedVideoUrl: 'https://cdn.genfeed.ai/videos/clip-1.mp4',
      status: 'completed',
      videoS3Key: 'videos/clip-1.mp4',
      videoUrl: 'https://cdn.genfeed.ai/videos/clip-1.mp4',
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

    expect(clipResultsService.patch).toHaveBeenCalledWith('clip-1', {
      error: 'ffmpeg failed',
      status: 'failed',
    });
    expect(clipProjectsService.reconcileTerminalState).toHaveBeenCalledWith(
      'project-1',
      'org-1',
    );
    expect(fileQueueService.processVideo).not.toHaveBeenCalled();
  });

  it('polls active raw-cut jobs to recover a missed completion event', async () => {
    const clip = makeClip();
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
