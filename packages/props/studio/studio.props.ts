import type {
  AssetScope,
  ComponentSize,
  IngredientFormat,
} from '@genfeedai/contracts';
import type { IIngredient, ITag } from '@genfeedai/contracts/interfaces';

export interface StudioQuickActionsProps {
  selectedIngredient: IIngredient;
  availableTags?: ITag[];
  isLoadingTags?: boolean;
  isUpdatingTags?: boolean;
  onManageTags?: (ingredient: IIngredient) => void;
  onPublish?: (ingredient: IIngredient, platform: string) => void;
  onRename?: (ingredient: IIngredient) => void;
  onUpscale?: (ingredient: IIngredient) => void;
  onExtend?: (ingredient: IIngredient) => void;
  onDelete?: (ingredient: IIngredient) => void;
  onClone?: (ingredient: IIngredient) => void;
  onReverse?: (ingredient: IIngredient) => void;
  onMirror?: (ingredient: IIngredient) => void;
  onRepostVariant?: (ingredient: IIngredient) => void;
  onTrim?: (ingredient: IIngredient) => void;
  onPortrait?: (ingredient: IIngredient) => void;
  onSquare?: (ingredient: IIngredient) => void;
  onLandscape?: (ingredient: IIngredient) => void;
  onConvertToGif?: (ingredient: IIngredient) => void;
  onConvertToVideo?: (ingredient: IIngredient) => void;
  onUseAsVideoReference?: (ingredient: IIngredient) => void;
  onCreateVariation?: (ingredient: IIngredient) => void;
  onDownload?: (
    ingredient: IIngredient,
  ) => undefined | Promise<undefined | Window | null | undefined>;
  onVote?: (ingredient: IIngredient) => void;
  onToggleFavorite?: (ingredient: IIngredient) => void;
  onGenerateCaptions?: (ingredient: IIngredient) => void;
  onAddTextOverlay?: (ingredient: IIngredient) => void;
  onMerge?: (ingredient: IIngredient) => void;
  onShowPrompt?: (ingredient: IIngredient) => void;
  onReprompt?: (ingredient: IIngredient) => void;
  onUsePrompt?: (ingredient: IIngredient) => void;
  onRefresh?: () => void;
  onShare?: (ingredient: IIngredient) => void;
  onCopy?: (ingredient: IIngredient) => void;
  onEdit?: (ingredient: IIngredient) => void;
  onMoreOptions?: (ingredient: IIngredient) => void;
  onSeeDetails?: (ingredient: IIngredient) => void;
  onConvertToPreset?: (ingredient: IIngredient) => void;
  onMarkValidated?: (ingredient: IIngredient) => void;
  onMarkArchived?: (ingredient: IIngredient) => void;
  onMarkRejected?: (ingredient: IIngredient) => void;
  onSetAsLogo?: (ingredient: IIngredient) => void;
  onSetAsBanner?: (ingredient: IIngredient) => void;
  onScopeChange?: (scope: AssetScope, updatedItem?: IIngredient) => void;
  onOpenInEditor?: (ingredient: IIngredient) => void;
  onResize?: (ingredient: IIngredient, format: IngredientFormat) => void;
  isPublishing?: boolean;
  isUpscaling?: boolean;
  isExtending?: boolean;
  isDeleting?: boolean;
  isCloning?: boolean;
  isReversing?: boolean;
  isMirroring?: boolean;
  isTrimming?: boolean;
  isPortraiting?: boolean;
  isSquaring?: boolean;
  isLandscaping?: boolean;
  isConverting?: boolean;
  isConvertingToVideo?: boolean;
  isDownloading?: boolean;
  isVoting?: boolean;
  isTogglingFavorite?: boolean;
  isGeneratingCaptions?: boolean;
  isAddingTextOverlay?: boolean;
  isMerging?: boolean;
  isUsingPrompt?: boolean;
  isMarkingValidated?: boolean;
  isMarkingArchived?: boolean;
  isMarkingRejected?: boolean;
  isSettingAsLogo?: boolean;
  isSettingAsBanner?: boolean;
  isResizing?: boolean;
  size?: ComponentSize.SM | ComponentSize.MD | ComponentSize.LG;
  align?: 'start' | 'end';
  isSelected?: boolean;
  isMasonryCompact?: boolean;
  /** Renders flat inside a sidebar header: no floating shell, Publish labelled. */
  isHeaderEmbedded?: boolean;
}
