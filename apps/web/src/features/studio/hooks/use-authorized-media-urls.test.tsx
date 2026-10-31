import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthorizedMediaUrls } from './use-authorized-media-urls';

const { previewGrant, getService } = vi.hoisted(() => {
  const previewGrant = vi.fn();
  return {
    getService: vi.fn(async () => ({ previewGrant })),
    previewGrant,
  };
});

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => getService,
}));

function ingredientWith(
  id: string,
  mediaDelivery: IIngredient['mediaDelivery'],
): IIngredient {
  return { cdnUrl: null, id, mediaDelivery } as unknown as IIngredient;
}

describe('useAuthorizedMediaUrls', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses the URL of a ready grant without reading it again', () => {
    const ingredients = {
      'image:a': ingredientWith('a', {
        expiresAt: null,
        id: 'a',
        purpose: 'preview',
        state: 'READY',
        url: 'https://signed.test/a',
      }),
    };
    const { result } = renderHook(() => useAuthorizedMediaUrls(ingredients));
    expect(result.current['image:a']).toBe('https://signed.test/a');
    expect(previewGrant).not.toHaveBeenCalled();
  });

  it('reads a pending grant until its URL is issued', async () => {
    previewGrant.mockResolvedValue({
      expiresAt: null,
      id: 'b',
      purpose: 'preview',
      state: 'READY',
      url: 'https://signed.test/b',
    });
    const ingredients = {
      'image:b': ingredientWith('b', {
        expiresAt: null,
        id: 'b',
        purpose: 'preview',
        state: 'PENDING',
        url: null,
      }),
    };
    const { result } = renderHook(() => useAuthorizedMediaUrls(ingredients));
    expect(result.current['image:b']).toBeUndefined();
    await waitFor(() =>
      expect(result.current['image:b']).toBe('https://signed.test/b'),
    );
    expect(previewGrant).toHaveBeenCalledWith('b', expect.any(AbortSignal));
  });

  it('has no URL for an unsupported grant and does not read it', () => {
    const ingredients = {
      'image:c': ingredientWith('c', {
        expiresAt: null,
        id: 'c',
        purpose: 'preview',
        state: 'UNSUPPORTED',
        url: null,
      }),
    };
    const { result } = renderHook(() => useAuthorizedMediaUrls(ingredients));
    expect(result.current['image:c']).toBeUndefined();
    expect(previewGrant).not.toHaveBeenCalled();
  });
});
