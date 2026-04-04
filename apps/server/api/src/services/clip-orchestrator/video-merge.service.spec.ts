import { ClipRunState } from '@api/services/clip-orchestrator/clip-run-state.enum';
import {
  MergeJobStatus,
  type VideoMergeQueue,
  VideoMergeService,
} from '@api/services/clip-orchestrator/video-merge.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Minimal LoggerService stub
const createLogger = () => ({
  debug: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
  setContext: vi.fn(),
  verbose: vi.fn(),
  warn: vi.fn(),
});

describe('VideoMergeService', () => {
  let service: VideoMergeService;
  let logger: ReturnType<typeof createLogger>;

  beforeEach(() => {
    logger = createLogger();
    service = new VideoMergeService(logger as any);
  });

  // -----------------------------------------------------------------------
  // selectVideosForMerge
  // -----------------------------------------------------------------------

  it('should create a merge queue from selected video IDs', async () => {
    const queue = await service.selectVideosForMerge('proj-1', [
      'clip-a',
      'clip-b',
      'clip-c',
    ]);

    expect(queue.clipProjectId).toBe('proj-1');
    expect(queue.items).toHaveLength(3);
    expect(queue.items[0].id).toBe('clip-a');
    expect(queue.items[0].order).toBe(0);
    expect(queue.items[2].order).toBe(2);
    expect(queue.createdAt).toBeDefined();
  });

  it('should throw when fewer than 2 videos are selected', async () => {
    await expect(
      service.selectVideosForMerge('proj-1', ['clip-a']),
    ).rejects.toThrow('At least 2 videos must be selected');
  });

  it('should throw when clipProjectId is empty', async () => {
    await expect(service.selectVideosForMerge('', ['a', 'b'])).rejects.toThrow(
      'clipProjectId is required',
    );
  });

  // -----------------------------------------------------------------------
  // queueMerge
  // -----------------------------------------------------------------------

  it('should create a pending merge job from a queue', async () => {
    const queue: VideoMergeQueue = {
      clipProjectId: 'proj-1',
      createdAt: new Date().toISOString(),
      items: [
        { id: 'a', order: 0, videoUrl: 'url-a' },
        { id: 'b', order: 1, videoUrl: 'url-b' },
      ],
    };

    const job = await service.queueMerge(queue);

    expect(job.jobId).toBeDefined();
    expect(job.status).toBe(MergeJobStatus.Pending);
    expect(job.clipProjectId).toBe('proj-1');
    expect(job.videoCount).toBe(2);
  });

  it('should throw when queue has no items', async () => {
    const queue: VideoMergeQueue = {
      clipProjectId: 'proj-1',
      createdAt: new Date().toISOString(),
      items: [],
    };

    await expect(service.queueMerge(queue)).rejects.toThrow(
      'Merge queue must contain at least one item',
    );
  });

  // -----------------------------------------------------------------------
  // getMergeStatus
  // -----------------------------------------------------------------------

  it('should return the status of an existing job', async () => {
    const queue: VideoMergeQueue = {
      clipProjectId: 'proj-1',
      createdAt: new Date().toISOString(),
      items: [
        { id: 'a', order: 0, videoUrl: '' },
        { id: 'b', order: 1, videoUrl: '' },
      ],
    };
    const job = await service.queueMerge(queue);

    const status = await service.getMergeStatus(job.jobId);
    expect(status).toBe(MergeJobStatus.Pending);
  });

  it('should throw when jobId does not exist', async () => {
    await expect(service.getMergeStatus('nonexistent')).rejects.toThrow(
      'Merge job not found',
    );
  });

  // -----------------------------------------------------------------------
  // updateJobStatus
  // -----------------------------------------------------------------------

  it('should transition a job to done with outputUrl', async () => {
    const queue: VideoMergeQueue = {
      clipProjectId: 'proj-1',
      createdAt: new Date().toISOString(),
      items: [
        { id: 'a', order: 0, videoUrl: '' },
        { id: 'b', order: 1, videoUrl: '' },
      ],
    };
    const job = await service.queueMerge(queue);

    const updated = service.updateJobStatus(job.jobId, MergeJobStatus.Done, {
      outputUrl: 'https://cdn.genfeed.ai/merged/output.mp4',
    });

    expect(updated.status).toBe(MergeJobStatus.Done);
    expect(updated.outputUrl).toBe('https://cdn.genfeed.ai/merged/output.mp4');
  });

  // -----------------------------------------------------------------------
  // buildRunStep
  // -----------------------------------------------------------------------

  it('should build a ClipRunStepDto from a merge job', async () => {
    const queue: VideoMergeQueue = {
      clipProjectId: 'proj-1',
      createdAt: new Date().toISOString(),
      items: [
        { id: 'a', order: 0, videoUrl: '' },
        { id: 'b', order: 1, videoUrl: '' },
      ],
    };
    const job = await service.queueMerge(queue);

    const step = service.buildRunStep(job);

    expect(step.stepId).toContain('merge-');
    expect(step.state).toBe(ClipRunState.Merging);
    expect(step.startedAt).toBeInstanceOf(Date);
    expect(step.completedAt).toBeUndefined(); // pending → not completed
    expect(step.retryCount).toBe(0);
  });

  it('should mark step as failed when job status is Failed', async () => {
    const queue: VideoMergeQueue = {
      clipProjectId: 'proj-1',
      createdAt: new Date().toISOString(),
      items: [
        { id: 'a', order: 0, videoUrl: '' },
        { id: 'b', order: 1, videoUrl: '' },
      ],
    };
    const job = await service.queueMerge(queue);
    const failedJob = service.updateJobStatus(
      job.jobId,
      MergeJobStatus.Failed,
      { error: 'ffmpeg crashed' },
    );

    const step = service.buildRunStep(failedJob);

    expect(step.state).toBe(ClipRunState.Failed);
    expect(step.error).toBe('ffmpeg crashed');
    expect(step.completedAt).toBeInstanceOf(Date);
  });
});
