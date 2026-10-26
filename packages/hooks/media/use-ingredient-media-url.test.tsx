// @vitest-environment jsdom
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useIngredientMediaUrl } from './use-ingredient-media-url';

const mocks = vi.hoisted(() => ({
  grant: null as { url: string | null } | null,
}));

vi.mock('@genfeedai/hooks/media/use-authorized-media-preview', () => ({
  useAuthorizedMediaPreview: () => mocks.grant,
}));

describe('useIngredientMediaUrl', () => {
  beforeEach(() => {
    mocks.grant = null;
  });

  it('prefers the issued media grant', () => {
    mocks.grant = { url: 'https://signed.test/a?sig=1' };
    const { result } = renderHook(() =>
      useIngredientMediaUrl({
        id: 'a',
        ingredientUrl: 'https://cdn.test/a.mp4',
      } as IIngredient),
    );

    expect(result.current).toBe('https://signed.test/a?sig=1');
  });

  it('has no URL while the grant is not ready, never a raw CDN path', () => {
    mocks.grant = { url: null };
    const { result } = renderHook(() =>
      useIngredientMediaUrl({ id: 'a' } as IIngredient),
    );

    expect(result.current).toBeUndefined();
  });

  it('uses the ingredient URL when no grant is issued', () => {
    const { result } = renderHook(() =>
      useIngredientMediaUrl({
        id: 'a',
        ingredientUrl: 'https://cdn.test/a.mp4',
      } as IIngredient),
    );

    expect(result.current).toBe('https://cdn.test/a.mp4');
  });

  it('has no URL without an ingredient', () => {
    const { result } = renderHook(() => useIngredientMediaUrl(undefined));

    expect(result.current).toBeUndefined();
  });
});
