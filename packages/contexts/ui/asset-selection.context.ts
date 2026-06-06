import type { IAssetSelectionContextType } from '@genfeedai/interfaces/components/asset-selection.interface';
import { createContext, useContext } from 'react';

export const AssetSelectionContext = createContext<IAssetSelectionContextType>({
  activeGenerations: [],
  addToGenerationQueue: () => {},
  clearAll: () => {},
  currentFormat: null,
  generatedAssetId: null,
  generatedAssetIds: [],
  generationQueue: [],
  isGenerating: false,
  removeFromQueue: () => {},
  selectedIngredient: null,
  setCurrentFormat: () => {},
  setGeneratedAssetId: () => {},
  setGeneratedAssetIds: () => {},
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
