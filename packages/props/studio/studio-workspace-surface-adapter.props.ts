import type {
  IGenerationItem,
  IIngredient,
} from '@genfeedai/contracts/interfaces';

export interface StudioWorkspaceSurfaceAdapterProps {
  error?: string | null;
  isLoading?: boolean;
  isProcessing?: boolean;
  mode: string;
  versions?: readonly IIngredient[];
}

export interface StudioWorkspaceInspectorProps
  extends StudioWorkspaceSurfaceAdapterProps {
  activeGenerations: readonly IGenerationItem[];
  brandLabel: string;
  currentFormat: { height: number; width: number } | null;
  generationQueue: readonly IGenerationItem[];
  organizationId: string;
  selectedAsset: IIngredient | null;
  selectedVersionId: string | null;
  selectedVersionNumber?: number;
}
