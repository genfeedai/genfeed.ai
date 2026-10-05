import {
  billableProfile,
  testModelCreditQuote,
} from '@api/helpers/utils/credits/model-billable-quote.fixture';
import { AgentGenerationCostToolHandler } from '@api/services/agent-orchestrator/tools/agent-generation-cost-tool-handler.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { AgentGenerationEstimateService } from '@api/services/router/agent-generation-estimate.service';
import { ModelCategory } from '@genfeedai/contracts';
import { AgentGenerationQuoteUnavailableReason } from '@genfeedai/contracts/interfaces';
import {
  applyMargin,
  quoteModelBillablePricing,
  setRuntimeMarginMultiplier,
} from '@genfeedai/pricing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ctx = {
  brandId: 'brand-1',
  organizationId: 'org-1',
  userId: 'user-1',
} as ToolExecutionContext;

const NANO_BANANA_2_LITE = 'google/nano-banana-2-lite';

function configuredProviderRow(overrides: Record<string, unknown> = {}) {
  return {
    category: ModelCategory.IMAGE,
    cost: 0,
    isActive: true,
    isDeleted: false,
    isFree: false,
    key: NANO_BANANA_2_LITE,
    organizationId: null,
    pricingType: 'flat',
    provider: 'replicate',
    providerCostUsd: 0.04,
    ...overrides,
  };
}

function setup(options?: { balance?: number | Error; row?: unknown }) {
  const balance = options?.balance ?? 42;
  const row =
    options && 'row' in options ? options.row : configuredProviderRow();
  const creditsUtilsService = {
    getOrganizationCreditsBalance: vi.fn(async () => {
      if (balance instanceof Error) throw balance;
      return balance;
    }),
  };
  const validateModelForOrg = vi.fn(async () => row);
  const selectModel = vi.fn();
  const logger = { error: vi.fn(), warn: vi.fn() };
  const estimateService = new AgentGenerationEstimateService(
    { resolveModelKey: vi.fn(), selectModel } as never,
    { validateModelForOrg } as never,
    logger as never,
    testModelCreditQuote({ findOne: async () => row } as never),
  );
  return {
    creditsUtilsService,
    handler: new AgentGenerationCostToolHandler(
      creditsUtilsService as never,
      estimateService,
    ),
    logger,
    selectModel,
    validateModelForOrg,
  };
}

describe('AgentGenerationCostToolHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setRuntimeMarginMultiplier(1);
  });

  it('#6199: a model admission quotes from configured provider USD gets the same estimate', async () => {
    const { handler } = setup();
    // The quote admission charges for this exact profile.
    const admission = quoteModelBillablePricing(
      billableProfile({
        key: NANO_BANANA_2_LITE,
        cost: 0,
        providerCostUsd: 0.04,
      }),
      { modelKey: NANO_BANANA_2_LITE, provider: 'replicate' },
      1,
      new Date().toISOString(),
    );
    if (admission.status !== 'priced') throw new Error(admission.reason);
    expect(admission.snapshot.credits).toBe(applyMargin(0.04, 1));

    const result = await handler.execute(
      { modelKey: NANO_BANANA_2_LITE, type: 'image' },
      ctx,
    );

    expect(result).toEqual({
      creditsUsed: 0,
      data: {
        balance: 42,
        estimate: { credits: admission.snapshot.credits, status: 'estimated' },
      },
      success: true,
    });
  });

  it('keeps a numeric zero balance', async () => {
    const { handler } = setup({ balance: 0 });
    const result = await handler.execute({ type: 'image' }, ctx);
    expect(result).toMatchObject({
      creditsUsed: 0,
      data: { balance: 0, estimate: { credits: null, status: 'auto' } },
      success: true,
    });
  });

  it('returns a null balance when the wallet read fails', async () => {
    const { handler } = setup({ balance: new Error('wallet down') });
    const result = await handler.execute(
      { modelKey: NANO_BANANA_2_LITE, type: 'image' },
      ctx,
    );
    expect(result.success).toBe(true);
    expect(result.data?.balance).toBeNull();
    expect(result.data?.balance).not.toBe(0);
  });

  it('does not quote Auto and reports status auto', async () => {
    const { handler, selectModel, validateModelForOrg } = setup();
    for (const params of [
      { type: 'video' },
      { modelKey: 'auto', type: 'image' },
      { modelKey: '   ', type: 'image' },
    ]) {
      const result = await handler.execute(params, ctx);
      expect(result.data?.estimate).toEqual({ credits: null, status: 'auto' });
    }
    expect(selectModel).not.toHaveBeenCalled();
    expect(validateModelForOrg).not.toHaveBeenCalled();
  });

  it('returns unavailable with a reason for a bad request and still returns the balance', async () => {
    const { handler, validateModelForOrg } = setup({ balance: 9 });
    const result = await handler.execute({ type: 'music' }, ctx);
    expect(validateModelForOrg).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      creditsUsed: 0,
      data: {
        balance: 9,
        estimate: {
          credits: null,
          status: 'unavailable',
          unavailableReason:
            AgentGenerationQuoteUnavailableReason.INSUFFICIENT_INPUT,
        },
      },
      success: true,
    });
  });

  it('reports MODEL_UNAVAILABLE when the model is missing', async () => {
    const { handler } = setup({ row: null });
    const result = await handler.execute(
      { modelKey: 'replicate/missing', type: 'image' },
      ctx,
    );
    expect(result.data).toMatchObject({
      balance: 42,
      estimate: {
        credits: null,
        status: 'unavailable',
        unavailableReason:
          AgentGenerationQuoteUnavailableReason.MODEL_UNAVAILABLE,
      },
    });
  });

  it('reports PRICING_UNRESOLVED when admission has no exact tariff', async () => {
    const { handler } = setup({
      row: configuredProviderRow({ cost: 0, providerCostUsd: null }),
    });
    const result = await handler.execute(
      { modelKey: NANO_BANANA_2_LITE, type: 'image' },
      ctx,
    );
    expect(result.data?.estimate).toMatchObject({
      status: 'unavailable',
      unavailableReason:
        AgentGenerationQuoteUnavailableReason.PRICING_UNRESOLVED,
    });
  });

  it('rejects an invalid output count as a missing setting', async () => {
    const { handler } = setup();
    const result = await handler.execute(
      { modelKey: NANO_BANANA_2_LITE, outputs: 99, type: 'image' },
      ctx,
    );
    expect(result.data?.estimate).toMatchObject({
      status: 'unavailable',
      unavailableReason: AgentGenerationQuoteUnavailableReason.MISSING_SETTING,
    });
  });
});
