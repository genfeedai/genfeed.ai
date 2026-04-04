import type { ReactNode } from 'react';
import type { IIngredient } from '../index';

export interface IActionHandlers {
  onToggleFavorite?: (ingredient: IIngredient) => void;
  onPublish?: (ingredient: IIngredient, platform: string) => void;
  onUpscale?: (ingredient: IIngredient) => void;
  onDelete?: (ingredient: IIngredient) => void;
  onClone?: (ingredient: IIngredient) => void;
  onReverse?: (ingredient: IIngredient) => void;
  onMirror?: (ingredient: IIngredient) => void;
  onTrim?: (ingredient: IIngredient) => void;
  onPortrait?: (ingredient: IIngredient) => void;
  onSquare?: (ingredient: IIngredient) => void;
  onLandscape?: (ingredient: IIngredient) => void;
  onConvertToGif?: (ingredient: IIngredient) => void;
  onConvertToVideo?: (ingredient: IIngredient) => void;
  onUseAsVideoReference?: (ingredient: IIngredient) => void;
  onCreateVariation?: (ingredient: IIngredient) => void;
  onDownload?: (ingredient: IIngredient) => void;
  onVote?: (ingredient: IIngredient) => void;
  onGenerateCaptions?: (ingredient: IIngredient) => void;
  onAddTextOverlay?: (ingredient: IIngredient) => void;
  onMerge?: (ingredient: IIngredient) => void;
  onShowPrompt?: (ingredient: IIngredient) => void;
  onUsePrompt?: (ingredient: IIngredient) => void;
  onShare?: (ingredient: IIngredient) => void;
  onValidate?: (ingredient: IIngredient) => void;
  onArchive?: (ingredient: IIngredient) => void;
  onMarkValidated?: (ingredient: IIngredient) => void;
  onMarkArchived?: (ingredient: IIngredient) => void;
  onMarkRejected?: (ingredient: IIngredient) => void;
  onReAnimate?: (ingredient: IIngredient) => void;
  onFeature?: (ingredient: IIngredient) => void;
  onEdit?: (ingredient: IIngredient) => void;
  onEditIngredient?: (ingredient: IIngredient) => void;
  onEditCaption?: (ingredient: IIngredient) => void;
  onFullscreenMobile?: (ingredient: IIngredient) => void;
  onRename?: (ingredient: IIngredient, newName: string) => void;
  onCopy?: (ingredient: IIngredient) => void;
  onCopyPrompt?: (ingredient: IIngredient) => void;
  onMoreOptions?: (ingredient: IIngredient) => void;
  onMoreActions?: (ingredient: IIngredient) => void;
  onSeeDetails?: (ingredient: IIngredient) => void;
  onConvertToPreset?: (ingredient: IIngredient) => void;
  onSetAsLogo?: (ingredient: IIngredient) => void;
  onSetAsBanner?: (ingredient: IIngredient) => void;
  onManageTags?: (ingredient: IIngredient) => void;
}

export type TooltipPositionType = 'top' | 'bottom' | 'left' | 'right';
export type QuickActionVariant = 'primary' | 'ghost' | 'error';

export interface IQuickAction {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
  onClick: () => void | Promise<void>;
  isLoading?: boolean;
  isDisabled?: boolean;
  tooltip?: string;
  tooltipPosition?: TooltipPositionType;
  variant?: QuickActionVariant;
  showInMenu?: boolean;
  dividerBefore?: boolean;
  sectionLabel?: string;
}

export interface QuickActionsProps {
  actions: IQuickAction[];
  className?: string;
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  showLabels?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export interface ILoadingStates {
  isPublishing?: boolean;
  isUpscaling?: boolean;
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
}
