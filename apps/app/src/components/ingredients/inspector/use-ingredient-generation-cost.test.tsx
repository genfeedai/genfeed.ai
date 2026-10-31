import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useIngredientGenerationCost } from './use-ingredient-generation-cost';

const findGenerationCost = vi.fn();

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({ findGenerationCost }),
}));

vi.mock('@genfeedai/services/content/ingredients.service', () => ({
  IngredientsService: { getInstance: vi.fn() },
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

describe('useIngredientGenerationCost', () => {
  beforeEach(() => {
    findGenerationCost.mockReset();
  });

  it('loads the cost of an enabled asset', async () => {
    findGenerationCost.mockResolvedValue({ credits: 48, status: 'settled' });

    const { result } = renderHook(() =>
      useIngredientGenerationCost('asset-1', true),
    );

    await waitFor(() =>
      expect(result.current).toEqual({ credits: 48, status: 'settled' }),
    );
    expect(findGenerationCost).toHaveBeenCalledWith(
      'asset-1',
      expect.any(AbortSignal),
    );
  });

  it('does not request anything while disabled', () => {
    const { result } = renderHook(() =>
      useIngredientGenerationCost('asset-1', false),
    );

    expect(result.current).toBeNull();
    expect(findGenerationCost).not.toHaveBeenCalled();
  });

  it('never shows the previous asset cost for the next asset', async () => {
    findGenerationCost.mockResolvedValueOnce({
      credits: 48,
      status: 'settled',
    });
    findGenerationCost.mockReturnValueOnce(new Promise(() => undefined));

    const { result, rerender } = renderHook(
      ({ id }) => useIngredientGenerationCost(id, true),
      { initialProps: { id: 'asset-1' } },
    );
    await waitFor(() => expect(result.current?.credits).toBe(48));

    rerender({ id: 'asset-2' });

    expect(result.current).toBeNull();
  });

  it('shows no cost when the read fails', async () => {
    findGenerationCost.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() =>
      useIngredientGenerationCost('asset-1', true),
    );

    await waitFor(() => expect(findGenerationCost).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });
});
