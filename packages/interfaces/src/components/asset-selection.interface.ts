import type { AgentArtifactReference, IFormat, IIngredient } from '../index';
import type { IGenerationItem } from './generation.interface';

export interface CanonicalAssetSelectionVersion {
  id: string;
  number?: number;
  parentId?: string;
}

/**
 * Client presentation of one selected canonical media record. The reference is
 * still re-authorized by the server before it enters conversation context.
 */
export interface CanonicalAssetSelection {
  asset: IIngredient;
  reference: Extract<AgentArtifactReference, { kind: 'ingredient' }>;
  version: CanonicalAssetSelectionVersion;
}

export interface IAssetSelectionContextType {
  selectedIngredient: IIngredient | null;
  currentFormat: IFormat | null;
  isGenerating: boolean;
  generatedAssetId: string | null;
  generatedAssetIds: string[];
  generationQueue: IGenerationItem[];
  activeGenerations: IGenerationItem[];
  selectedCanonicalAsset: CanonicalAssetSelection | null;

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
