import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { IModel } from '@genfeedai/contracts/interfaces';
import type { AgentGenerationQuoteRequest } from '@genfeedai/contracts/interfaces/ai/agent-generation-quote.interface';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  estimateGenerationCredits: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    estimateGenerationCredits: mocks.estimateGenerationCredits,
  }),
}));

vi.mock('@services/ai/router.service', () => ({
  RouterService: { getInstance: vi.fn() },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({ error: mocks.error, info: mocks.info }),
  },
}));

import { useStudioSpendQuote } from './useStudioSpendQuote';

const NOTE = 'sizes the video from your source image';
const FLUX = { key: MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_3_IMAGE };
const models = [{ ...FLUX, label: 'FLUX.3' }] as unknown as readonly IModel[];
const REQUEST: AgentGenerationQuoteRequest = {
  category: 'image',
  prompt: 'A lighthouse',
};

function quoteKnown(modelKey: string | undefined) {
  const onSubmit = vi.fn();
  const { result } = renderHook(() => useStudioSpendQuote());
  act(() => {
    result.current.quoteSpend(
      {
        modelKey,
        models: [] as readonly IModel[],
        source: { credits: 64, kind: 'known' },
      },
      onSubmit,
    );
  });
  return onSubmit;
}

describe('useStudioSpendQuote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('submits a priced model at once, with no confirmation', () => {
    const onSubmit = quoteKnown(MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3);

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(mocks.info).not.toHaveBeenCalled();
  });

  it('tells the operator a source-sized model ignores the selected aspect ratio', () => {
    const onSubmit = quoteKnown(MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3_FAST);

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(mocks.info).toHaveBeenCalledWith(expect.stringContaining(NOTE));
  });

  it('pins the model Auto chose, submits, and names it in a toast', async () => {
    mocks.estimateGenerationCredits.mockResolvedValue({
      credits: 8,
      isAvailable: true,
      modelKey: FLUX.key,
    });
    const onSubmit = vi.fn();
    const { result } = renderHook(() => useStudioSpendQuote());

    await act(async () => {
      result.current.quoteSpend(
        {
          models,
          source: {
            autoRequest: REQUEST,
            buildRequest: () => REQUEST,
            kind: 'server',
          },
        },
        onSubmit,
      );
    });

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit).toHaveBeenCalledWith({ pinnedModelKey: FLUX.key });
    expect(mocks.info).toHaveBeenCalledWith(
      'Auto chose FLUX.3. This generation costs 8 credits.',
    );
  });

  it('submits nothing when the server cannot confirm the price', async () => {
    mocks.estimateGenerationCredits.mockResolvedValue({
      isAvailable: false,
      unavailableReason: 'PRICING_UNRESOLVED',
    });
    const onSubmit = vi.fn();
    const { result } = renderHook(() => useStudioSpendQuote());

    await act(async () => {
      result.current.quoteSpend(
        {
          models,
          source: {
            autoRequest: null,
            buildRequest: () => REQUEST,
            kind: 'server',
          },
        },
        onSubmit,
      );
    });

    await vi.waitFor(() => expect(mocks.error).toHaveBeenCalledOnce());
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
