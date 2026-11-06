import { ArticleTextGenerationService } from '@api/collections/articles/services/article-text-generation.service';
import type { RunTextGenerationStepParams } from '@api/collections/articles/services/articles-content.types';
import type { ModelsService } from '@api/collections/models/services/models.service';
import type { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import type { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { runtimeSettingsMock } from '@api-test/helpers/runtime-settings.mock';
import { ModelCategory } from '@genfeedai/contracts';
import type { ConfigService } from '@libs/config/config.service';
import { describe, expect, it } from 'vitest';

/**
 * Focused unit tests for the shared `runTextGenerationStep` prologue that backs
 * generateArticles / generateLongFormArticle / enhance. The key behavioural
 * contract is that the step bills only when an `onBilling` callback is supplied
 * (enhancement is intentionally unbilled) and surfaces the caller-supplied
 * failure message when the model returns no text.
 */

/**
 * The models catalog (lookups recorded, since only charging reads it), a
 * prompt builder and the text model, each recording what it was asked.
 */
function makeService(options: { completion?: string } = {}) {
  const modelLookups: unknown[] = [];
  const builtPrompts: {
    model: string;
    options: unknown;
    organizationId: string;
  }[] = [];
  const completions: { input: unknown; model: string }[] = [];
  const models = {
    findOne: async (query: unknown) => {
      modelLookups.push(query);
      return { cost: 5, pricingType: 'flat' };
    },
  };
  const replicate = {
    generateTextCompletionSync: async (model: string, input: unknown) => {
      completions.push({ input, model });
      return options.completion ?? 'AI OUTPUT';
    },
  };
  const promptBuilder = {
    buildPrompt: async (
      model: string,
      promptOptions: unknown,
      organizationId: string,
    ) => {
      builtPrompts.push({ model, options: promptOptions, organizationId });
      return { input: { prompt: 'built' } };
    },
  };

  const service = new ArticleTextGenerationService(
    runtimeSettingsMock({ get: () => undefined } as unknown as ConfigService),
    models as unknown as ModelsService,
    replicate as unknown as ReplicateService,
    promptBuilder as unknown as PromptBuilderService,
  );

  return { builtPrompts, completions, modelLookups, service };
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
  it('builds the prompt, runs the model, and returns the raw response', async () => {
    const { builtPrompts, completions, service } = makeService();

    const output = await service.runTextGenerationStep(baseParams);

    expect(output).toBe('AI OUTPUT');
    expect(builtPrompts).toEqual([
      {
        model: 'test-model',
        options: expect.objectContaining({
          brand: { label: 'brand-x' },
          prompt: expect.stringContaining('BASE PROMPT'),
          temperature: 0.8,
        }),
        organizationId: 'org-1',
      },
    ]);
    expect(completions).toEqual([
      { input: { prompt: 'built' }, model: 'test-model' },
    ]);
  });

  it('meters one charge when an onBilling callback is supplied', async () => {
    const { service } = makeService();
    const charges: unknown[] = [];

    await service.runTextGenerationStep({
      ...baseParams,
      onBilling: (charge) => {
        charges.push(charge);
      },
    });

    expect(charges).toEqual([
      expect.objectContaining({ amount: 5, modelKey: 'test-model' }),
    ]);
  });

  it('never computes a charge when onBilling is omitted (enhance path)', async () => {
    const { modelLookups, service } = makeService();

    await service.runTextGenerationStep(baseParams);

    // calculateTextGenerationCharge() is the only reader of the models catalog.
    expect(modelLookups).toEqual([]);
  });

  it('throws the caller-supplied failure message when the model returns no text', async () => {
    const { service } = makeService({ completion: '' });

    await expect(
      service.runTextGenerationStep({
        ...baseParams,
        failureMessage: 'custom failure message',
      }),
    ).rejects.toThrow('custom failure message');
  });
});
