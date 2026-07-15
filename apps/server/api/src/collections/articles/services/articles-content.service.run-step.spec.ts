import type { ModelsService } from '@api/collections/models/services/models.service';
import type { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { ModelCategory } from '@genfeedai/enums';
import type { ConfigService } from '@libs/config/config.service';
import type { ReplicateService } from '@server/services/integrations/replicate/services/replicate.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ArticleTextGenerationService } from './article-text-generation.service';
import type { RunTextGenerationStepParams } from './articles-content.types';

/**
 * Focused unit tests for the shared `runTextGenerationStep` prologue that backs
 * generateArticles / generateLongFormArticle / enhance. The key behavioural
 * contract is that the step bills only when an `onBilling` callback is supplied
 * (enhancement is intentionally unbilled) and surfaces the caller-supplied
 * failure message when the model returns no text.
 */

function makeService() {
  const config = { get: vi.fn() };
  const models = {
    findOne: vi.fn().mockResolvedValue({ cost: 5, pricingType: 'flat' }),
  };
  const replicate = {
    generateTextCompletionSync: vi.fn().mockResolvedValue('AI OUTPUT'),
  };
  const promptBuilder = {
    buildPrompt: vi.fn().mockResolvedValue({ input: { prompt: 'built' } }),
  };

  const service = new ArticleTextGenerationService(
    config as unknown as ConfigService,
    models as unknown as ModelsService,
    replicate as unknown as ReplicateService,
    promptBuilder as unknown as PromptBuilderService,
  );

  return { service, models, promptBuilder, replicate };
}

const baseParams: RunTextGenerationStepParams = {
  basePrompt: 'BASE PROMPT',
  buildPromptOptions: {
    modelCategory: ModelCategory.TEXT,
    systemPromptTemplate: 'ARTICLE',
    temperature: 0.8,
  },
  failureMessage: 'fail',
  harnessContext: { promptBuilder: { brand: { label: 'brand-x' } } },
  model: 'test-model',
  organizationId: 'org-1',
};

describe('ArticleTextGenerationService.runTextGenerationStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds the prompt, runs the model, and returns the raw response', async () => {
    const { service, promptBuilder, replicate } = makeService();

    const output = await service.runTextGenerationStep(baseParams);

    expect(output).toBe('AI OUTPUT');
    expect(promptBuilder.buildPrompt).toHaveBeenCalledWith(
      'test-model',
      expect.objectContaining({
        brand: { label: 'brand-x' },
        prompt: expect.stringContaining('BASE PROMPT'),
        temperature: 0.8,
      }),
      'org-1',
    );
    expect(replicate.generateTextCompletionSync).toHaveBeenCalledWith(
      'test-model',
      { prompt: 'built' },
    );
  });

  it('meters a charge only when an onBilling callback is supplied', async () => {
    const { service } = makeService();
    const onBilling = vi.fn();

    await service.runTextGenerationStep({ ...baseParams, onBilling });

    expect(onBilling).toHaveBeenCalledTimes(1);
    expect(onBilling).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 5, modelKey: 'test-model' }),
    );
  });

  it('never computes a charge when onBilling is omitted (enhance path)', async () => {
    const { service, models } = makeService();

    await service.runTextGenerationStep(baseParams);

    // calculateTextGenerationCharge() is the only caller of modelsService.findOne
    expect(models.findOne).not.toHaveBeenCalled();
  });

  it('throws the caller-supplied failure message when the model returns no text', async () => {
    const { service, replicate } = makeService();
    replicate.generateTextCompletionSync.mockResolvedValueOnce('');

    await expect(
      service.runTextGenerationStep({
        ...baseParams,
        failureMessage: 'custom failure message',
      }),
    ).rejects.toThrow('custom failure message');
  });
});
