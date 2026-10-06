import { ImageGenerationCreditsService } from '@api/collections/images/services/image-generation-credits.service';
import { isNativeImageBatch } from '@api/collections/images/services/image-generation-provider.util';
import { testModelCreditQuote } from '@api/helpers/utils/credits/model-billable-quote.fixture';
import { buildIdeogramImageEditInput } from '@api/services/prompt-builder/builders/replicate/ideogram-image-edit.builder';
import { ReplicatePromptBuilder } from '@api/services/prompt-builder/builders/replicate-prompt.builder';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { AgentGenerationEstimateService } from '@api/services/router/agent-generation-estimate.service';
import { ModelCategory } from '@genfeedai/contracts';
import {
  mapReplicateBillingTiers,
  setRuntimeMarginMultiplier,
} from '@genfeedai/pricing';
import { REPLICATE_VARIANT_FIXTURES } from '@genfeedai/pricing/reviewed-rates/replicate-variants.fixture';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Real provider builders and captured billing rules; no generation provider calls.
describe('image variant estimate / quote / admission parity', () => {
  const logger = { debug: vi.fn(), error: vi.fn(), warn: vi.fn() };
  const builder = new PromptBuilderService(
    logger as never,
    {} as never,
    new ReplicatePromptBuilder({ get: vi.fn(), isDevelopment: false } as never),
    {} as never,
  );
  let row: Record<string, unknown>;
  const models = { findOne: vi.fn(async () => row) };
  const quote = testModelCreditQuote(models as never);
  const estimate = new AgentGenerationEstimateService(
    {} as never,
    { validateModelForOrg: vi.fn(async () => row) } as never,
    logger as never,
    quote,
    builder,
  );
  const admission = new ImageGenerationCreditsService(
    {
      checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(true),
    } as never,
    models as never,
    { providerFor: () => 'replicate', supports: () => true } as never,
    { resolveApiKey: vi.fn().mockResolvedValue(undefined) } as never,
    quote,
    builder,
  );
  beforeEach(() => {
    vi.clearAllMocks();
    setRuntimeMarginMultiplier(1);
  });
  function reviewedRow(modelKey: string, category: ModelCategory) {
    const fixture = REPLICATE_VARIANT_FIXTURES[modelKey];
    if (!fixture) throw new Error(`Missing fixture ${modelKey}`);
    const mapping = mapReplicateBillingTiers(
      fixture.tiers,
      fixture.inputProperties,
      modelKey,
    );
    if (mapping.status !== 'ok') throw new Error(mapping.reason);
    return {
      key: modelKey,
      category,
      provider: 'replicate',
      isActive: true,
      isDeleted: false,
      organizationId: null,
      providerInputSchema: { properties: fixture.inputProperties },
      rateVersion: 'captured-v1',
      requiredSelectorKeys: mapping.selectorKeys,
      requiresReviewedRates: true,
      reviewedPricing: {
        currency: 'USD',
        version: 'captured-v1',
        reviewStatus: 'approved',
        sourceUrl: fixture.sourceUrl,
        verifiedAt: '2026-10-05T00:00:00Z',
        rates: mapping.rates,
        variantRules: mapping.variantRules,
      },
    };
  }
  it('quotes Ideogram editing from the same source payload and fixed quality as admission', async () => {
    const modelKey = 'ideogram-ai/ideogram-4-5';
    row = reviewedRow(modelKey, ModelCategory.IMAGE_EDIT);
    const referenceUrls = ['https://cdn.example.com/source.jpg'];
    const providerInput = buildIdeogramImageEditInput(
      '',
      { sourceUrls: referenceUrls, size: 'source' },
      2,
    );
    const dto = { height: 1024, width: 1024, outputs: 2 };
    const expected = await quote.quoteSnapshotByKey(modelKey, {
      ...dto,
      providerInput,
      requests: 1,
      provider: 'replicate',
    });
    const estimated = await estimate.estimate({
      ...dto,
      category: 'image-edit',
      modelKey,
      organizationId: 'org-1',
      referenceUrls,
    });
    expect(estimated).toMatchObject({
      isAvailable: true,
      credits: expected.credits,
    });
    const quoted = await admission.quoteCredits(
      dto as never,
      modelKey,
      'org-1',
      providerInput,
    );
    expect(quoted.unitCredits).toBe(expected.credits);
    const request = { creditsConfig: { deferred: true } };
    await admission.ensureDeferredCredits(
      dto as never,
      modelKey,
      'org-1',
      request as never,
      providerInput,
    );
    expect(request.creditsConfig).toMatchObject({ amount: expected.credits });
  });
  it('refuses an edit variant without its required source input', async () => {
    row = reviewedRow('ideogram-ai/ideogram-4-5', ModelCategory.IMAGE_EDIT);
    expect(
      await estimate.estimate({
        category: 'image-edit',
        modelKey: 'ideogram-ai/ideogram-4-5',
        organizationId: 'org-1',
      }),
    ).toMatchObject({
      isAvailable: false,
      unavailableReason: 'PRICING_UNRESOLVED',
    });
  });
  it.each<[string, string | undefined]>([
    ['openai/gpt-image-2', 'medium'],
    ['openai/gpt-image-2', undefined],
    ['openai/gpt-image-1.5', 'high'],
  ])(
    'quotes %s quality=%s using the dispatched variant',
    async (modelKey, quality) => {
      const fixture = REPLICATE_VARIANT_FIXTURES[modelKey];
      if (!fixture) throw new Error(`Missing fixture ${modelKey}`);
      const mapping = mapReplicateBillingTiers(
        fixture.tiers,
        fixture.inputProperties,
        modelKey,
      );
      if (mapping.status !== 'ok') throw new Error(mapping.reason);
      row = {
        key: modelKey,
        category: ModelCategory.IMAGE,
        provider: 'replicate',
        isActive: true,
        isDeleted: false,
        organizationId: null,
        providerInputSchema: { properties: fixture.inputProperties },
        rateVersion: 'captured-v1',
        requiredSelectorKeys: mapping.selectorKeys,
        requiresReviewedRates: true,
        reviewedPricing: {
          currency: 'USD',
          version: 'captured-v1',
          reviewStatus: 'approved',
          sourceUrl: fixture.sourceUrl,
          verifiedAt: '2026-10-05T00:00:00Z',
          rates: mapping.rates,
          variantRules: mapping.variantRules,
        },
      };
      const dto = {
        text: 'A product photo',
        height: 1024,
        width: 1024,
        quality,
        outputs: 2,
      };
      const built = await builder.buildPrompt(modelKey, {
        ...dto,
        prompt: dto.text,
        modelCategory: ModelCategory.IMAGE,
        modelInputSchema: { properties: fixture.inputProperties },
        outputs: isNativeImageBatch(modelKey, 'replicate') ? dto.outputs : 1,
        brandingMode: 'off',
        useTemplate: false,
      });
      const expected = await quote.quoteSnapshotByKey(modelKey, {
        ...dto,
        provider: 'replicate',
        providerInput: built.input as unknown as Record<string, unknown>,
        requests: isNativeImageBatch(modelKey, 'replicate') ? 1 : dto.outputs,
        ...(quality ? { selectors: { quality } } : {}),
      });
      const estimated = await estimate.estimate({
        ...dto,
        category: 'image',
        modelKey,
        organizationId: 'org-1',
      });
      expect(estimated).toMatchObject({
        isAvailable: true,
        credits: expected.credits,
      });
      const quoted = await admission.quoteCredits(
        dto as never,
        modelKey,
        'org-1',
      );
      expect(quoted.unitCredits).toBe(expected.credits);
      const request = {
        creditsConfig: {
          deferred: true,
          approvedImageQuote: {
            model: modelKey,
            ...quoted,
          },
        },
      };
      await admission.assertApprovedQuote(
        dto as never,
        modelKey,
        'org-1',
        request as never,
      );
      await admission.ensureDeferredCredits(
        dto as never,
        modelKey,
        'org-1',
        request as never,
        built.input as unknown as Record<string, unknown>,
      );
      expect(request.creditsConfig).toMatchObject({ amount: expected.credits });
    },
  );
});
