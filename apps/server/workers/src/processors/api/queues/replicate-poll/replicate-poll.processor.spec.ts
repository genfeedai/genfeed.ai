import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import {
  REPLICATE_POLL_MAX_ATTEMPTS,
  type ReplicatePollJobData,
} from '@genfeedai/contracts/queue';
import { ReplicatePollProcessor } from '@workers/processors/api/queues/replicate-poll/replicate-poll.processor';
import type { Job } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function buildJob(
  overrides: Partial<ReplicatePollJobData> = {},
): Job<ReplicatePollJobData> {
  return {
    data: {
      attempt: 1,
      category: IngredientCategory.VIDEO,
      externalId: 'prediction-1',
      ingredientId: 'ingredient-1',
      organizationId: 'org-1',
      ...overrides,
    },
  } as Job<ReplicatePollJobData>;
}

describe('ReplicatePollProcessor', () => {
  const ingredients = { findOne: vi.fn() };
  const logger = { error: vi.fn() };
  const pollQueue = { schedule: vi.fn() };
  const replicate = { getPrediction: vi.fn() };
  const webhooks = {
    handleFailedGenerationForIngredient: vi.fn(),
    processMediaForIngredient: vi.fn(),
  };
  let processor: ReplicatePollProcessor;

  beforeEach(() => {
    vi.clearAllMocks();
    ingredients.findOne.mockResolvedValue({
      status: IngredientStatus.PROCESSING,
    });
    processor = new ReplicatePollProcessor(
      ingredients as never,
      logger as never,
      pollQueue as never,
      replicate as never,
      webhooks as never,
    );
  });

  it('reschedules a non-terminal prediction', async () => {
    replicate.getPrediction.mockResolvedValue({ status: 'processing' });

    await processor.process(buildJob({ attempt: 2 }));

    expect(pollQueue.schedule).toHaveBeenCalledWith(
      expect.objectContaining({ attempt: 3, externalId: 'prediction-1' }),
    );
  });

  it('finalizes the selected output for a batch placeholder', async () => {
    replicate.getPrediction.mockResolvedValue({
      output: [
        'https://replicate.delivery/pbxt/first.mp4',
        'https://replicate.delivery/pbxt/second.mp4',
      ],
      status: 'succeeded',
    });

    await processor.process(buildJob({ outputIndex: 1 }));

    expect(webhooks.processMediaForIngredient).toHaveBeenCalledWith(
      'ingredient-1',
      IngredientCategory.VIDEO,
      'https://replicate.delivery/pbxt/second.mp4',
      'prediction-1_1',
    );
  });

  it('marks terminal failures through the shared webhook lifecycle', async () => {
    replicate.getPrediction.mockResolvedValue({
      error: 'provider failed',
      status: 'failed',
    });

    await processor.process(buildJob());

    expect(webhooks.handleFailedGenerationForIngredient).toHaveBeenCalledWith(
      'ingredient-1',
      'provider failed',
    );
  });

  it('marks a prediction failed after the polling ceiling', async () => {
    replicate.getPrediction.mockResolvedValue({ status: 'queued' });

    await processor.process(buildJob({ attempt: REPLICATE_POLL_MAX_ATTEMPTS }));

    expect(pollQueue.schedule).not.toHaveBeenCalled();
    expect(webhooks.handleFailedGenerationForIngredient).toHaveBeenCalledWith(
      'ingredient-1',
      'Replicate polling timed out',
    );
  });

  it('skips provider calls after another completion path settles the asset', async () => {
    ingredients.findOne.mockResolvedValue({
      status: IngredientStatus.GENERATED,
    });

    await processor.process(buildJob());

    expect(replicate.getPrediction).not.toHaveBeenCalled();
  });
});
