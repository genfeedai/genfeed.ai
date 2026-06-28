import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ArticlesContentService } from './articles-content.service';

/**
 * Focused unit tests for the shared `runTextGenerationStep` prologue that backs
 * generateArticles / generateLongFormArticle / enhance. The key behavioural
 * contract is that the step bills only when an `onBilling` callback is supplied
 * (enhancement is intentionally unbilled) and surfaces the caller-supplied
 * failure message when the model returns no text.
 */
interface RunStepParams {
  model: string;
  basePrompt: string;
  harnessContext: { brief?: unknown; promptBuilder: Record<string, unknown> };
  buildPromptOptions: Record<string, unknown>;
  organizationId: string;
  failureMessage: string;
  onBilling?: (charge: {
    amount: number;
    inputTokens: number;
    modelKey: string;
    outputTokens: number;
  }) => void;
}

interface ContentServiceInternals {
  runTextGenerationStep(params: RunStepParams): Promise<string>;
}

function makeService() {
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
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

  // Construct via an untyped ctor cast to avoid wiring every Nest dependency
  // type into the test; the step only touches the mocks provided here.
  const Ctor = ArticlesContentService as unknown as new (
    ...args: unknown[]
  ) => ArticlesContentService;
  const service = new Ctor(
    logger,
    config,
    {},
    models,
    undefined,
    replicate,
    promptBuilder,
  );

  const internal = service as unknown as ContentServiceInternals;
  return { internal, models, promptBuilder, replicate };
}

const baseParams: RunStepParams = {
  basePrompt: 'BASE PROMPT',
  buildPromptOptions: { systemPromptTemplate: 'ARTICLE', temperature: 0.8 },
  failureMessage: 'fail',
  harnessContext: { promptBuilder: { brand: 'brand-x' } },
  model: 'test-model',
  organizationId: 'org-1',
};

describe('ArticlesContentService.runTextGenerationStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds the prompt, runs the model, and returns the raw response', async () => {
    const { internal, promptBuilder, replicate } = makeService();

    const output = await internal.runTextGenerationStep(baseParams);

    expect(output).toBe('AI OUTPUT');
    expect(promptBuilder.buildPrompt).toHaveBeenCalledWith(
      'test-model',
      expect.objectContaining({
        brand: 'brand-x',
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
    const { internal } = makeService();
    const onBilling = vi.fn();

    await internal.runTextGenerationStep({ ...baseParams, onBilling });

    expect(onBilling).toHaveBeenCalledTimes(1);
    expect(onBilling).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 5, modelKey: 'test-model' }),
    );
  });

  it('never computes a charge when onBilling is omitted (enhance path)', async () => {
    const { internal, models } = makeService();

    await internal.runTextGenerationStep(baseParams);

    // calculateTextGenerationCharge() is the only caller of modelsService.findOne
    expect(models.findOne).not.toHaveBeenCalled();
  });

  it('throws the caller-supplied failure message when the model returns no text', async () => {
    const { internal, replicate } = makeService();
    replicate.generateTextCompletionSync.mockResolvedValueOnce('');

    await expect(
      internal.runTextGenerationStep({
        ...baseParams,
        failureMessage: 'custom failure message',
      }),
    ).rejects.toThrow('custom failure message');
  });
});
