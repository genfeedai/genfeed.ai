import {
  HEYGEN_POLL_MAX_ATTEMPTS,
  type HeygenPollJobData,
} from '@genfeedai/contracts/queue';
import { HeygenPollProcessor } from '@workers/processors/api/queues/heygen-poll/heygen-poll.processor';
import type { Job } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function buildJob(data: Partial<HeygenPollJobData>): Job<HeygenPollJobData> {
  return {
    data: {
      attempt: 1,
      continuationId: 'continuation-1',
      externalId: 'heygen-1',
      ingredientId: 'ingredient-1',
      organizationId: 'org-1',
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
    handleFailedGenerationForIngredient: ReturnType<typeof vi.fn>;
    processMediaForIngredient: ReturnType<typeof vi.fn>;
  };
  let continuationCoordinator: {
    completeProviderAction: ReturnType<typeof vi.fn>;
    failProviderAction: ReturnType<typeof vi.fn>;
  };
  let continuations: { requestHeygenPollAttempt: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    logger = { error: vi.fn(), log: vi.fn() };
    heygenAvatarProvider = {
      getStatus: vi.fn().mockResolvedValue({ status: 'processing' }),
    };
    webhooksService = {
      handleFailedGenerationForIngredient: vi.fn().mockResolvedValue(undefined),
      processMediaForIngredient: vi.fn().mockResolvedValue(undefined),
    };
    continuationCoordinator = {
      completeProviderAction: vi.fn().mockResolvedValue('queued'),
      failProviderAction: vi.fn().mockResolvedValue('queued'),
    };
    continuations = {
      requestHeygenPollAttempt: vi.fn().mockResolvedValue(undefined),
    };

    processor = new HeygenPollProcessor(
      logger as never,
      heygenAvatarProvider as never,
      webhooksService as never,
      continuationCoordinator as never,
      continuations as never,
    );
  });

  it('reschedules itself while the video is still processing', async () => {
    await processor.process(buildJob({ attempt: 2 }));

    expect(continuations.requestHeygenPollAttempt).toHaveBeenCalledWith({
      attempt: 3,
      continuationId: 'continuation-1',
      externalId: 'heygen-1',
      organizationId: 'org-1',
    });
    expect(webhooksService.processMediaForIngredient).not.toHaveBeenCalled();
  });

  it('finalizes a timeout failure once max attempts are reached', async () => {
    heygenAvatarProvider.getStatus.mockResolvedValue({ status: 'queued' });

    await processor.process(buildJob({ attempt: HEYGEN_POLL_MAX_ATTEMPTS }));

    expect(continuations.requestHeygenPollAttempt).not.toHaveBeenCalled();
    expect(
      webhooksService.handleFailedGenerationForIngredient,
    ).toHaveBeenCalledWith('ingredient-1', 'HeyGen polling timeout');
    expect(continuationCoordinator.failProviderAction).toHaveBeenCalled();
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
    expect(continuationCoordinator.completeProviderAction).toHaveBeenCalledWith(
      expect.objectContaining({
        identity: {
          continuationId: 'continuation-1',
          organizationId: 'org-1',
        },
      }),
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

    expect(
      webhooksService.handleFailedGenerationForIngredient,
    ).toHaveBeenCalledWith('ingredient-1', 'render failed');
    expect(continuationCoordinator.failProviderAction).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'render failed' }),
    );
  });

  it('falls back to a default failure message', async () => {
    heygenAvatarProvider.getStatus.mockResolvedValue({ status: 'failed' });

    await processor.process(buildJob({}));

    expect(
      webhooksService.handleFailedGenerationForIngredient,
    ).toHaveBeenCalledWith(
      'ingredient-1',
      'HeyGen generation failed without error message',
    );
  });

  it('rethrows cleanup failures so the durable poll transport retries', async () => {
    heygenAvatarProvider.getStatus.mockResolvedValue({ status: 'failed' });
    webhooksService.handleFailedGenerationForIngredient.mockRejectedValue(
      new Error('lookup failed'),
    );

    await expect(processor.process(buildJob({}))).rejects.toThrow(
      'lookup failed',
    );

    expect(logger.error).toHaveBeenCalledWith(
      'HeygenPollProcessor: finalizeFailure cleanup failed for continuation continuation-1',
      expect.any(Error),
    );
  });
});
