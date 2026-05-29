import { IngredientStatus } from '@genfeedai/enums';
import type { IFormat, IIngredient } from '@genfeedai/interfaces';
import type { IGenerationItem } from '@genfeedai/interfaces/components/generation.interface';
import type { LayoutProps } from '@genfeedai/props/layout/layout.props';
import { useCallback, useState } from 'react';
import { AssetSelectionContext } from './asset-selection.context';

export function AssetSelectionProvider({ children }: LayoutProps) {
  const [selectedIngredient, setSelectedAsset] = useState<IIngredient | null>(
    null,
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentFormat, setCurrentFormat] = useState<IFormat | null>({
    height: 1920,
    width: 1080,
  });

  const [generatedAssetId, setGeneratedAssetId] = useState<string | null>(null);
  const [generatedAssetIds, setGeneratedAssetIds] = useState<string[]>([]);
  const [generationQueue, setGenerationQueue] = useState<IGenerationItem[]>([]);

  const activeGenerations = generationQueue.filter((item) =>
    item.status.includes(IngredientStatus.PROCESSING),
  );

  const addToGenerationQueue = useCallback((item: IGenerationItem) => {
    setGenerationQueue((prev) => [...prev, item]);
  }, []);

  const updateGenerationStatus = useCallback(
    (id: string, updates: Partial<IGenerationItem>) => {
      setGenerationQueue((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...updates } : item)),
      );
    },
    [],
  );

  const removeFromQueue = useCallback((id: string) => {
    setGenerationQueue((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setSelectedAsset(null);
    setIsGenerating(false);
    setGeneratedAssetId(null);
    setGeneratedAssetIds([]);
    setGenerationQueue([]);
    setCurrentFormat({ height: 1920, width: 1080 });
  }, []);

  return (
    <AssetSelectionContext.Provider
      value={{
        activeGenerations,
        addToGenerationQueue,
        clearAll,
        currentFormat,
        generatedAssetId,
        generatedAssetIds,
        generationQueue,
        isGenerating,
        removeFromQueue,
        selectedIngredient,
        setCurrentFormat,
        setGeneratedAssetId,
        setGeneratedAssetIds,
        setIsGenerating,
        setSelectedAsset,
        updateGenerationStatus,
      }}
    >
      {children}
    </AssetSelectionContext.Provider>
  );
}
