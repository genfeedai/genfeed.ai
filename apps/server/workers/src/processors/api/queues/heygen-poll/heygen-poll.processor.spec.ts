import {
  HEYGEN_POLL_DELAY_MS,
  HEYGEN_POLL_MAX_ATTEMPTS,
  type HeygenPollJobData,
} from '@genfeedai/queue-contracts';
import { HeygenPollProcessor } from '@workers/processors/api/queues/heygen-poll/heygen-poll.processor';
import type { Job } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function buildJob(data: Partial<HeygenPollJobData>): Job<HeygenPollJobData> {
  return {
    data: {
      attempt: 1,
      externalId: 'heygen-1',
      ingredientId: 'ingredient-1',
      organizationId: 'org-1',
      taskId: 'task-1',
      userId: 'user-1',
      ...data,
    },
  } as unknown as Job<HeygenPollJobData>;
}

describe('HeygenPollProcessor', () => {
  let processor: HeygenPollProcessor;
  let logger: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
  };
  let heygenAvatarProvider: { getStatus: ReturnType<typeof vi.fn> };
  let webhooksService: {
    processMediaForIngredient: ReturnType<typeof vi.fn>;
  };
  let metadataService: { patch: ReturnType<typeof vi.fn> };
  let ingredientsService: { findOne: ReturnType<typeof vi.fn> };
  let tasksService: { recordTaskEvent: ReturnType<typeof vi.fn> };
  let heygenPollQueueService: { schedule: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    logger = { error: vi.fn(), log: vi.fn() };
    heygenAvatarProvider = {
      getStatus: vi.fn().mockResolvedValue({ status: 'processing' }),
    };
    webhooksService = {
      processMediaForIngredient: vi.fn().mockResolvedValue(undefined),
    };
    metadataService = { patch: vi.fn().mockResolvedValue(undefined) };
    ingredientsService = {
      findOne: vi.fn().mockResolvedValue({ metadataId: 'metadata-1' }),
    };
    tasksService = { recordTaskEvent: vi.fn().mockResolvedValue(undefined) };
    heygenPollQueueService = {
      schedule: vi.fn().mockResolvedValue(undefined),
    };

    processor = new HeygenPollProcessor(
      logger as never,
      heygenAvatarProvider as never,
      webhooksService as never,
      metadataService as never,
      ingredientsService as never,
      tasksService as never,
      heygenPollQueueService as never,
    );
  });

  it('reschedules itself while the video is still processing', async () => {
    await processor.process(buildJob({ attempt: 2 }));

    expect(heygenPollQueueService.schedule).toHaveBeenCalledWith(
      expect.objectContaining({ attempt: 3, externalId: 'heygen-1' }),
      HEYGEN_POLL_DELAY_MS,
    );
    expect(webhooksService.processMediaForIngredient).not.toHaveBeenCalled();
  });

  it('finalizes a timeout failure once max attempts are reached', async () => {
    heygenAvatarProvider.getStatus.mockResolvedValue({ status: 'queued' });

    await processor.process(buildJob({ attempt: HEYGEN_POLL_MAX_ATTEMPTS }));

    expect(heygenPollQueueService.schedule).not.toHaveBeenCalled();
    expect(metadataService.patch).toHaveBeenCalledWith('metadata-1', {
      error: 'HeyGen polling timeout',
    });
    expect(tasksService.recordTaskEvent).toHaveBeenCalledWith(
      'task-1',
      'org-1',
      'user-1',
      expect.objectContaining({ type: 'facecam_failed' }),
      expect.objectContaining({
        failureReason: 'HeyGen polling timeout',
        status: 'failed',
      }),
    );
  });

  it('processes media and records completion on success', async () => {
    heygenAvatarProvider.getStatus.mockResolvedValue({
      jobId: 'provider-video-1',
      status: 'completed',
      videoUrl: 'https://cdn.example/video.mp4',
    });

    await processor.process(buildJob({}));

    expect(webhooksService.processMediaForIngredient).toHaveBeenCalledWith(
      'ingredient-1',
      'avatar',
      'https://cdn.example/video.mp4',
      'provider-video-1',
    );
    expect(tasksService.recordTaskEvent).toHaveBeenCalledWith(
      'task-1',
      'org-1',
      'user-1',
      expect.objectContaining({ type: 'facecam_completed' }),
      expect.objectContaining({ status: 'done' }),
    );
  });

  it('rethrows when finalizing a success fails', async () => {
    heygenAvatarProvider.getStatus.mockResolvedValue({
      jobId: 'provider-video-1',
      status: 'completed',
      videoUrl: 'https://cdn.example/video.mp4',
    });
    webhooksService.processMediaForIngredient.mockRejectedValue(
      new Error('media pipeline failed'),
    );

    await expect(processor.process(buildJob({}))).rejects.toThrow(
      'media pipeline failed',
    );
  });

  it('finalizes a terminal provider failure with the provider error', async () => {
    heygenAvatarProvider.getStatus.mockResolvedValue({
      error: 'render failed',
      status: 'failed',
    });

    await processor.process(buildJob({}));

    expect(tasksService.recordTaskEvent).toHaveBeenCalledWith(
      'task-1',
      'org-1',
      'user-1',
      expect.objectContaining({
        payload: { error: 'render failed', ingredientId: 'ingredient-1' },
      }),
      expect.objectContaining({ failureReason: 'render failed' }),
    );
  });

  it('falls back to a default failure message and skips metadata patch without an ingredient', async () => {
    heygenAvatarProvider.getStatus.mockResolvedValue({ status: 'failed' });
    ingredientsService.findOne.mockResolvedValue(null);

    await processor.process(buildJob({}));

    expect(metadataService.patch).not.toHaveBeenCalled();
    expect(tasksService.recordTaskEvent).toHaveBeenCalledWith(
      'task-1',
      'org-1',
      'user-1',
      expect.objectContaining({
        payload: expect.objectContaining({
          error: 'HeyGen generation failed without error message',
        }),
      }),
      expect.anything(),
    );
  });

  it('swallows cleanup failures while finalizing a failure', async () => {
    heygenAvatarProvider.getStatus.mockResolvedValue({ status: 'failed' });
    ingredientsService.findOne.mockRejectedValue(new Error('lookup failed'));

    await processor.process(buildJob({}));

    expect(logger.error).toHaveBeenCalledWith(
      'HeygenPollProcessor: finalizeFailure cleanup failed for task task-1',
      expect.any(Error),
    );
  });
});
