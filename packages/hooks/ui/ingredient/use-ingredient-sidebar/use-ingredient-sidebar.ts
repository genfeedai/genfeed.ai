import { useAssetSelection } from '@genfeedai/contexts/ui/asset-selection.context';
import { useContextSidebar } from '@genfeedai/contexts/ui/context-sidebar-context';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { useCallback } from 'react';

/**
 * Shows one ingredient in the shell's right context sidebar. The selection
 * lives in the shared asset selection, and `IngredientSidebarPanel` (mounted
 * once inside the protected frame) renders it, so any page can inspect an
 * ingredient without owning a panel.
 */
export function useIngredientSidebar(): {
  closeIngredientSidebar: () => void;
  openIngredientSidebar: (ingredient: IIngredient) => void;
} {
  const { setSelectedAsset } = useAssetSelection();
  const reveal = useContextSidebar()?.reveal;

  const openIngredientSidebar = useCallback(
    (ingredient: IIngredient) => {
      setSelectedAsset(ingredient);
      reveal?.();
    },
    [reveal, setSelectedAsset],
  );

  const closeIngredientSidebar = useCallback(() => {
    setSelectedAsset(null);
  }, [setSelectedAsset]);

  return { closeIngredientSidebar, openIngredientSidebar };
}
