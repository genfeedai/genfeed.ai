import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { useGenerationReceiptMedia } from '@hooks/ui/generation-receipts/use-generation-receipt-media';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const findByIds = vi.fn();
  // useAuthedService returns a stable getter across renders.
  const getService = async () => ({ findByIds });
  return { findByIds, getService };
});
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getService,
}));

function ingredient(id: string, isDeleted = false): IIngredient {
  return { id, isDeleted } as IIngredient;
}

describe('useGenerationReceiptMedia', () => {
  beforeEach(() => {
    mocks.findByIds.mockReset();
  });

  it('loads each distinct output once, in batches the endpoint accepts, and drops deleted outputs', async () => {
    const ids = Array.from({ length: 51 }, (_, index) => `id-${index}`);
    mocks.findByIds.mockImplementation(async (batch: string[]) =>
      batch.map((id) => ingredient(id, id === 'id-3')),
    );

    const { result } = renderHook(() =>
      useGenerationReceiptMedia([...ids, 'id-0']),
    );

    await waitFor(() => expect(result.current.size).toBe(50));
    expect(mocks.findByIds).toHaveBeenCalledTimes(2);
    expect(
      mocks.findByIds.mock.calls.map(([batch]) => batch.length).sort(),
    ).toEqual([1, 50]);
    expect(result.current.get('id-0')).toEqual(ingredient('id-0'));
    expect(result.current.has('id-3')).toBe(false);
  });

  it('requests nothing for a page without media receipts', () => {
    const { result } = renderHook(() => useGenerationReceiptMedia([]));
    expect(result.current.size).toBe(0);
    expect(mocks.findByIds).not.toHaveBeenCalled();
  });

  it('leaves rows without previews when the outputs cannot be read', async () => {
    mocks.findByIds.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useGenerationReceiptMedia(['id-1']));
    await waitFor(() => expect(mocks.findByIds).toHaveBeenCalled());
    expect(result.current.size).toBe(0);
  });

  it('ignores a response that lands after the page changed', async () => {
    let resolve!: (value: IIngredient[]) => void;
    mocks.findByIds.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    mocks.findByIds.mockResolvedValueOnce([ingredient('id-2')]);
    const { result, rerender } = renderHook(
      ({ ids }) => useGenerationReceiptMedia(ids),
      { initialProps: { ids: ['id-1'] } },
    );
    await waitFor(() => expect(mocks.findByIds).toHaveBeenCalledTimes(1));
    rerender({ ids: ['id-2'] });
    await waitFor(() => expect(result.current.has('id-2')).toBe(true));
    resolve([ingredient('id-1')]);
    await Promise.resolve();
    expect(result.current.has('id-1')).toBe(false);
  });
});
