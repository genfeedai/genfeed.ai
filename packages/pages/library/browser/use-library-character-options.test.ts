import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLibraryCharacterOptions } from './use-library-character-options';

const { listAllCharacters } = vi.hoisted(() => ({
  listAllCharacters: vi.fn(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => () => Promise.resolve({ listAllCharacters }),
}));

vi.mock('@genfeedai/services/content/personas.service', () => ({
  PersonasService: { getInstance: vi.fn() },
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

describe('useLibraryCharacterOptions', () => {
  beforeEach(() => {
    listAllCharacters.mockReset();
  });

  it('requests characters for the given brand and refetches when it changes', async () => {
    listAllCharacters.mockImplementation(
      async ({ brandId }: { brandId: string }) => [
        { avatarIngredientId: null, id: `char-${brandId}`, label: brandId },
      ],
    );

    const { result, rerender } = renderHook(
      ({ brandId }) => useLibraryCharacterOptions({ brandId, isEnabled: true }),
      { initialProps: { brandId: 'brand-a' } },
    );

    await waitFor(() => expect(result.current[0]?.id).toBe('char-brand-a'));
    expect(listAllCharacters).toHaveBeenLastCalledWith(
      expect.objectContaining({ brandId: 'brand-a' }),
    );
    const firstSignal = listAllCharacters.mock.calls[0][0]
      .signal as AbortSignal;

    rerender({ brandId: 'brand-b' });

    expect(firstSignal.aborted).toBe(true);
    await waitFor(() => expect(result.current[0]?.id).toBe('char-brand-b'));
    expect(listAllCharacters).toHaveBeenLastCalledWith(
      expect.objectContaining({ brandId: 'brand-b' }),
    );
    expect(result.current).toHaveLength(1);
  });

  it('drops the previous brand options while the next brand loads', async () => {
    let resolveB: (value: unknown[]) => void = () => undefined;
    listAllCharacters
      .mockResolvedValueOnce([{ id: 'a1', label: 'A' }])
      .mockReturnValueOnce(
        new Promise<unknown[]>((resolve) => {
          resolveB = resolve;
        }),
      );

    const { result, rerender } = renderHook(
      ({ brandId }) => useLibraryCharacterOptions({ brandId, isEnabled: true }),
      { initialProps: { brandId: 'brand-a' } },
    );
    await waitFor(() => expect(result.current).toHaveLength(1));

    rerender({ brandId: 'brand-b' });
    expect(result.current).toEqual([]);

    await act(async () => resolveB([{ id: 'b1', label: 'B' }]));
    await waitFor(() => expect(result.current[0]?.id).toBe('b1'));
  });

  it('loads nothing when disabled', () => {
    renderHook(() =>
      useLibraryCharacterOptions({ brandId: 'brand-a', isEnabled: false }),
    );

    expect(listAllCharacters).not.toHaveBeenCalled();
  });
});
