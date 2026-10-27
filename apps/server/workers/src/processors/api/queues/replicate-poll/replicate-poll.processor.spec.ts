import { INGREDIENT_PROCESSING_TIMEOUT_ERROR } from '@api/collections/ingredients/constants/processing-timeout.constants';
import {
  ByokProvider,
  IngredientCategory,
  IngredientStatus,
} from '@genfeedai/contracts';
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
  const byok = { lookupApiKey: vi.fn() };
  const ingredients = { findOne: vi.fn() };
  const logger = { error: vi.fn(), warn: vi.fn() };
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
      byok as never,
      ingredients as never,
      logger as never,
      pollQueue as never,
      replicate as never,
      webhooks as never,
    );
  });

  it('reads a platform prediction with the platform key', async () => {
    replicate.getPrediction.mockResolvedValue({ status: 'processing' });

    await processor.process(buildJob());

    expect(byok.lookupApiKey).not.toHaveBeenCalled();
    expect(replicate.getPrediction).toHaveBeenCalledWith(
      'prediction-1',
      undefined,
    );
  });

  it('reads a BYOK prediction with the organization key that created it', async () => {
    byok.lookupApiKey.mockResolvedValue({ apiKey: 'org-replicate-key' });
    replicate.getPrediction.mockResolvedValue({
      output: 'https://replicate.delivery/pbxt/byok.mp4',
      status: 'succeeded',
    });

    await processor.process(buildJob({ isByok: true }));

    expect(byok.lookupApiKey).toHaveBeenCalledWith(
      'org-1',
      ByokProvider.REPLICATE,
    );
    expect(replicate.getPrediction).toHaveBeenCalledWith(
      'prediction-1',
      'org-replicate-key',
    );
    expect(webhooks.processMediaForIngredient).toHaveBeenCalledWith(
      'ingredient-1',
      IngredientCategory.VIDEO,
      'https://replicate.delivery/pbxt/byok.mp4',
      'prediction-1',
    );
  });

  it('fails a BYOK generation instead of polling with the platform key once the org key is gone', async () => {
    byok.lookupApiKey.mockResolvedValue(undefined);

    await processor.process(buildJob({ isByok: true }));

    expect(replicate.getPrediction).not.toHaveBeenCalled();
    expect(webhooks.handleFailedGenerationForIngredient).toHaveBeenCalledWith(
      'ingredient-1',
      expect.stringContaining('Replicate key'),
    );
  });

  it('polls again instead of failing the generation when the BYOK key lookup errors', async () => {
    byok.lookupApiKey.mockRejectedValue(new Error('database unavailable'));

    await processor.process(buildJob({ attempt: 3, isByok: true }));

    expect(webhooks.handleFailedGenerationForIngredient).not.toHaveBeenCalled();
    expect(replicate.getPrediction).not.toHaveBeenCalled();
    expect(pollQueue.schedule).toHaveBeenCalledWith(
      expect.objectContaining({ attempt: 4, isByok: true }),
    );
  });

  it('times out a BYOK generation whose key lookup keeps erroring past the polling ceiling', async () => {
    byok.lookupApiKey.mockRejectedValue(new Error('database unavailable'));

    await processor.process(
      buildJob({ attempt: REPLICATE_POLL_MAX_ATTEMPTS, isByok: true }),
    );

    expect(pollQueue.schedule).not.toHaveBeenCalled();
    expect(webhooks.handleFailedGenerationForIngredient).toHaveBeenCalledWith(
      'ingredient-1',
      'Replicate polling timed out',
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

  it('logs what a succeeded prediction returned when no output is allowed, without the URL', async () => {
    replicate.getPrediction.mockResolvedValue({
      output: ['https://cdn.example.test/private/path.png?token=secret'],
      status: 'succeeded',
    });

    await processor.process(buildJob());

    expect(webhooks.handleFailedGenerationForIngredient).toHaveBeenCalledWith(
      'ingredient-1',
      'Replicate prediction prediction-1 ended with status succeeded without an allowed output',
    );
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('generation failed'),
      expect.objectContaining({
        outputShape: {
          hostnames: ['cdn.example.test'],
          outputType: 'array(1) of string',
        },
      }),
    );
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('secret');
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

  it.each(['succeeded', 'failed'])(
    'resolves a processing-timeout projection through the shared lifecycle when the provider is %s',
    async (status) => {
      ingredients.findOne.mockResolvedValue({
        status: IngredientStatus.FAILED,
        generationError: INGREDIENT_PROCESSING_TIMEOUT_ERROR,
      });
      replicate.getPrediction.mockResolvedValue({
        status,
        error: 'provider failed',
        output: 'https://replicate.delivery/pbxt/late.mp4',
      });

      await processor.process(buildJob());

      expect(ingredients.findOne).toHaveBeenCalledWith({
        id: 'ingredient-1',
        organizationId: 'org-1',
        isDeleted: false,
      });
      expect(replicate.getPrediction).toHaveBeenCalledWith(
        'prediction-1',
        undefined,
      );
      if (status === 'succeeded') {
        expect(
          webhooks.processMediaForIngredient,
        ).toHaveBeenCalledExactlyOnceWith(
          'ingredient-1',
          IngredientCategory.VIDEO,
          'https://replicate.delivery/pbxt/late.mp4',
          'prediction-1',
        );
        expect(
          webhooks.handleFailedGenerationForIngredient,
        ).not.toHaveBeenCalled();
      } else {
        expect(
          webhooks.handleFailedGenerationForIngredient,
        ).toHaveBeenCalledExactlyOnceWith('ingredient-1', 'provider failed');
        expect(webhooks.processMediaForIngredient).not.toHaveBeenCalled();
      }
    },
  );

  it.each(['Cancelled by user', 'Provider rejected the prompt', null])(
    'does not poll a failed generation with a different terminal reason: %s',
    async (generationError) => {
      ingredients.findOne.mockResolvedValue({
        status: IngredientStatus.FAILED,
        generationError,
      });
      await processor.process(buildJob());
      expect(replicate.getPrediction).not.toHaveBeenCalled();
      expect(webhooks.processMediaForIngredient).not.toHaveBeenCalled();
      expect(
        webhooks.handleFailedGenerationForIngredient,
      ).not.toHaveBeenCalled();
    },
  );

  it.each(['processing', 'unknown'])(
    'retains unconfirmed timeout funding at the existing polling ceiling (%s)',
    async (status) => {
      ingredients.findOne.mockResolvedValue({
        status: IngredientStatus.FAILED,
        generationError: INGREDIENT_PROCESSING_TIMEOUT_ERROR,
      });
      replicate.getPrediction.mockResolvedValue({ status });
      await processor.process(
        buildJob({ attempt: REPLICATE_POLL_MAX_ATTEMPTS }),
      );
      expect(replicate.getPrediction).toHaveBeenCalledOnce();
      expect(pollQueue.schedule).not.toHaveBeenCalled();
      expect(
        webhooks.handleFailedGenerationForIngredient,
      ).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalled();
    },
  );

  it('retains a timed-out BYOK output when its key is unavailable', async () => {
    ingredients.findOne.mockResolvedValue({
      status: IngredientStatus.FAILED,
      generationError: INGREDIENT_PROCESSING_TIMEOUT_ERROR,
    });
    byok.lookupApiKey.mockResolvedValue(undefined);
    await processor.process(buildJob({ isByok: true }));
    expect(replicate.getPrediction).not.toHaveBeenCalled();
    expect(webhooks.handleFailedGenerationForIngredient).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('keeps the existing retry limit while a timed-out provider is still processing', async () => {
    ingredients.findOne.mockResolvedValue({
      status: IngredientStatus.FAILED,
      generationError: INGREDIENT_PROCESSING_TIMEOUT_ERROR,
    });
    replicate.getPrediction.mockResolvedValue({ status: 'processing' });
    await processor.process(
      buildJob({ attempt: REPLICATE_POLL_MAX_ATTEMPTS - 1 }),
    );
    expect(pollQueue.schedule).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ attempt: REPLICATE_POLL_MAX_ATTEMPTS }),
    );
    expect(webhooks.handleFailedGenerationForIngredient).not.toHaveBeenCalled();
  });

  it('retains timeout funding when BYOK key lookup errors at the polling ceiling', async () => {
    ingredients.findOne.mockResolvedValue({
      status: IngredientStatus.FAILED,
      generationError: INGREDIENT_PROCESSING_TIMEOUT_ERROR,
    });
    byok.lookupApiKey.mockRejectedValueOnce(new Error('lookup unavailable'));
    await processor.process(
      buildJob({ isByok: true, attempt: REPLICATE_POLL_MAX_ATTEMPTS }),
    );
    expect(replicate.getPrediction).not.toHaveBeenCalled();
    expect(pollQueue.schedule).not.toHaveBeenCalled();
    expect(webhooks.handleFailedGenerationForIngredient).not.toHaveBeenCalled();
  });

  it('skips provider calls after another completion path settles the asset', async () => {
    ingredients.findOne.mockResolvedValue({
      status: IngredientStatus.GENERATED,
    });

    await processor.process(buildJob());

    expect(replicate.getPrediction).not.toHaveBeenCalled();
  });
});
