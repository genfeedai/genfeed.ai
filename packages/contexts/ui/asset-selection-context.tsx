import { IngredientStatus } from '@genfeedai/contracts';
import type { IFormat, IIngredient } from '@genfeedai/contracts/interfaces';
import type { IGenerationItem } from '@genfeedai/contracts/interfaces/components/generation.interface';
import type { LayoutProps } from '@genfeedai/props/layout/layout.props';
import { useCallback, useMemo, useState } from 'react';
import { useBrand } from '../user/brand-context/brand-context';
import { AssetSelectionContext } from './asset-selection.context';
import { createCanonicalAssetSelection } from './canonical-asset-selection';

export function AssetSelectionProvider({ children }: LayoutProps) {
  const { brandId, organizationId } = useBrand();
  const [selectedIngredient, setSelectedAsset] = useState<IIngredient | null>(
    null,
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentFormat, setCurrentFormat] = useState<IFormat | null>({
    height: 1920,
    width: 1080,
  });

  const [generatedAssetId, setGeneratedAssetId] = useState<string | null>(null);
  const [generationQueue, setGenerationQueue] = useState<IGenerationItem[]>([]);

  const activeGenerations = useMemo(
    () =>
      generationQueue.filter((item) =>
        item.status.includes(IngredientStatus.PROCESSING),
      ),
    [generationQueue],
  );
  const selectedCanonicalAsset = useMemo(
    () =>
      createCanonicalAssetSelection(selectedIngredient, {
        brandId,
        organizationId,
      }),
    [brandId, organizationId, selectedIngredient],
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
    setGenerationQueue([]);
    setCurrentFormat({ height: 1920, width: 1080 });
  }, []);

  const contextValue = useMemo(
    () => ({
      activeGenerations,
      addToGenerationQueue,
      clearAll,
      currentFormat,
      generatedAssetId,
      generationQueue,
      isGenerating,
      removeFromQueue,
      selectedCanonicalAsset,
      selectedIngredient,
      setCurrentFormat,
      setGeneratedAssetId,
      setIsGenerating,
      setSelectedAsset,
      updateGenerationStatus,
    }),
    // setCurrentFormat, setGeneratedAssetId, setIsGenerating, setSelectedAsset are stable useState setters — omitted from deps
    [
      activeGenerations,
      addToGenerationQueue,
      clearAll,
      currentFormat,
      generatedAssetId,
      generationQueue,
      isGenerating,
      removeFromQueue,
      selectedCanonicalAsset,
      selectedIngredient,
      updateGenerationStatus,
    ],
  );

  return (
    <AssetSelectionContext.Provider value={contextValue}>
      {children}
    </AssetSelectionContext.Provider>
  );
}
