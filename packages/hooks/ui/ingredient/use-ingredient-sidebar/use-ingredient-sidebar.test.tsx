import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  reveal: vi.fn(),
  setSelectedAsset: vi.fn(),
}));

vi.mock('@genfeedai/contexts/ui/asset-selection.context', () => ({
  useAssetSelection: () => ({ setSelectedAsset: mocks.setSelectedAsset }),
}));

vi.mock('@genfeedai/contexts/ui/context-sidebar-context', () => ({
  useContextSidebar: () => ({ reveal: mocks.reveal }),
}));

import { useIngredientSidebar } from './use-ingredient-sidebar';

const ingredient = { id: 'asset-1' } as IIngredient;

describe('useIngredientSidebar', () => {
  beforeEach(() => {
    mocks.reveal.mockClear();
    mocks.setSelectedAsset.mockClear();
  });

  it('selects the ingredient and reveals the sidebar', () => {
    const { result } = renderHook(() => useIngredientSidebar());

    result.current.openIngredientSidebar(ingredient);

    expect(mocks.setSelectedAsset).toHaveBeenCalledWith(ingredient);
    expect(mocks.reveal).toHaveBeenCalledOnce();
  });

  it('clears the selection on close', () => {
    const { result } = renderHook(() => useIngredientSidebar());

    result.current.closeIngredientSidebar();

    expect(mocks.setSelectedAsset).toHaveBeenCalledWith(null);
  });
});
