import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { IModel } from '@genfeedai/contracts/interfaces';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  openConfirm: vi.fn(),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock(
  '@genfeedai/contexts/providers/global-modals/global-modals.provider',
  () => ({ useConfirmModal: () => ({ openConfirm: mocks.openConfirm }) }),
);

vi.mock(
  '@genfeedai/hooks/data/billing/use-topbar-balances/use-topbar-balances',
  () => ({ useTopbarBalances: () => ({ genfeedBalance: 500 }) }),
);

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({}),
}));

vi.mock('@services/ai/router.service', () => ({
  RouterService: { getInstance: vi.fn() },
}));

import { useStudioSpendConfirmation } from './useStudioSpendConfirmation';

const NOTE = 'sizes the video from your source image';

function confirmWith(modelKey: string | undefined) {
  const { result } = renderHook(() => useStudioSpendConfirmation());
  act(() => {
    result.current.confirmSpend(
      {
        modelKey,
        models: [] as readonly IModel[],
        source: { credits: 64, kind: 'known' },
      },
      vi.fn(),
    );
  });
  return mocks.openConfirm.mock.calls[0]?.[0] as { message: string };
}

describe('useStudioSpendConfirmation source aspect note', () => {
  beforeEach(() => {
    mocks.openConfirm.mockReset();
  });

  it('tells the operator a source-sized model ignores the selected aspect ratio', () => {
    const dialog = confirmWith(MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3_FAST);

    expect(dialog.message).toContain('64 credits');
    expect(dialog.message).toContain(NOTE);
  });

  it('keeps the plain price message for a model that honors the aspect ratio', () => {
    const dialog = confirmWith(MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3);

    expect(dialog.message).toContain('64 credits');
    expect(dialog.message).not.toContain(NOTE);
  });

  it('adds no note when no model is known', () => {
    expect(confirmWith(undefined).message).not.toContain(NOTE);
  });
});
