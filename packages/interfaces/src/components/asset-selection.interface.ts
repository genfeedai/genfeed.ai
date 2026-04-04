import type { IFormat, IIngredient } from '../index';
import type { IGenerationItem } from './generation.interface';

export interface IAssetSelectionContextType {
  selectedIngredient: IIngredient | null;
  currentFormat: IFormat | null;
  isGenerating: boolean;
  generatedAssetId: string | null;
  generatedAssetIds: string[];
  generationQueue: IGenerationItem[];
  activeGenerations: IGenerationItem[];

  setSelectedAsset: (ingredient: IIngredient | null) => void;
  setIsGenerating: (generating: boolean) => void;
  setCurrentFormat: (format: IFormat | null) => void;
  setGeneratedAssetId: (id: string | null) => void;
  setGeneratedAssetIds: (ids: string[]) => void;
  addToGenerationQueue: (item: IGenerationItem) => void;
  updateGenerationStatus: (
    id: string,
    updates: Partial<IGenerationItem>,
  ) => void;
  removeFromQueue: (id: string) => void;
  clearAll: () => void;
}
