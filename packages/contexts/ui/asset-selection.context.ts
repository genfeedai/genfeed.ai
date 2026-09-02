import type { IAssetSelectionContextType } from '@genfeedai/contracts/interfaces/components/asset-selection.interface';
import { createContext, useContext } from 'react';

export const AssetSelectionContext = createContext<IAssetSelectionContextType>({
  activeGenerations: [],
  addToGenerationQueue: () => {},
  clearAll: () => {},
  currentFormat: null,
  generatedAssetId: null,
  generationQueue: [],
  isGenerating: false,
  removeFromQueue: () => {},
  selectedCanonicalAsset: null,
  selectedIngredient: null,
  setCurrentFormat: () => {},
  setGeneratedAssetId: () => {},
  setIsGenerating: () => {},
  setSelectedAsset: () => {},
  updateGenerationStatus: () => {},
});

export function useAssetSelection() {
  const context = useContext(AssetSelectionContext);
  if (!context) {
    throw new Error(
      'useAssetSelection must be used within AssetSelectionProvider',
    );
  }
  return context;
}
