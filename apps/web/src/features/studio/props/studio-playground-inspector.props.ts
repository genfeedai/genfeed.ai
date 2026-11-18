import type { IIngredient, IPost } from '@genfeedai/contracts/interfaces';
import type { StudioPlaygroundJob } from '@genfeedai/contracts/interfaces/studio/studio-playground.interface';
import type { useIngredientGenerationCost } from '@/components/ingredients/inspector/use-ingredient-generation-cost';
import type { resolveStudioAssetFacts } from '@/features/studio/playground/utils/studio-playground-asset';
import type { readStoredPrompt } from '@/features/studio/playground/utils/studio-playground-prompt-slots';
import type { resolveRecipeForJob } from '@/features/studio/playground/utils/studio-playground-recipe';
import type { StudioPlaygroundInspectorProps } from '@/features/studio/props/studio-playground.props';

export type InspectorTab = 'history' | 'recipe' | 'used-in';

export interface StudioInspectorPreviewProps {
  hasPreviewError: boolean;
  isFocused: boolean;
  isPreviewLoading: boolean;
  isPreviewUnsupported: boolean;
  isReady: boolean;
  /** The asset the preview was read for; null while its source is unavailable. */
  ingredient: IIngredient | null;
  job: StudioPlaygroundJob;
  label: string;
  onMediaMeasured: (width: number, height: number) => void;
  onPreviewFailed: () => void;
  onPreviewLoaded: () => void;
  onRetry: () => void;
  previewRevision: number;
  previewScope: string;
  previewUrl: string | undefined;
}

export interface StudioInspectorFactsProps {
  facts: ReturnType<typeof resolveStudioAssetFacts>;
  generationCost: ReturnType<typeof useIngredientGenerationCost>;
  label: string;
}

export interface StudioInspectorRecipePanelProps {
  currentReceipt: IIngredient | null;
  promptText: string;
  receiptError: boolean;
  recipe: ReturnType<typeof resolveRecipeForJob>;
  storedPrompt: ReturnType<typeof readStoredPrompt>;
  onEditSlots: () => void;
}

export interface StudioInspectorUsedInPanelProps {
  isLoading: boolean;
  posts: readonly IPost[];
}

export interface StudioInspectorHistoryPanelProps {
  childAssets: readonly IIngredient[];
  isLoading: boolean;
  onSelect: (job: StudioPlaygroundJob) => void;
  siblingJobs: readonly StudioPlaygroundJob[];
}

export interface StudioInspectorActionsProps
  extends Pick<
    StudioPlaygroundInspectorProps,
    | 'isUseAsReferenceEnabled'
    | 'job'
    | 'onAnimate'
    | 'onEdit'
    | 'onOpenInEditor'
    | 'onRemix'
    | 'onSelect'
    | 'onUseAsReference'
    | 'onUseInPost'
    | 'onVary'
    | 'parentJob'
    | 'transformActions'
  > {
  /** The job as continuations read it: carrying the receipt asset once loaded. */
  continuationJob: StudioPlaygroundJob;
  ingredient: IIngredient | null;
  label: string;
}
