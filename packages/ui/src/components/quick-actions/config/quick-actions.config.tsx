import { IngredientStatus } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import type {
  IActionHandlers,
  IQuickAction,
} from '@genfeedai/contracts/interfaces/ui/quick-actions.interface';
import {
  Archive,
  ArrowLeftRight,
  CircleCheck,
  Clipboard,
  Copy,
  Download,
  Ellipsis,
  ExternalLink,
  Film,
  Hash,
  LayoutGrid,
  Maximize2,
  MessageSquareText,
  Minus,
  Pencil,
  Plus,
  RectangleHorizontal,
  RectangleVertical,
  RefreshCw,
  Scissors,
  Share2,
  Sparkles,
  Square,
  Star,
  Terminal,
  ThumbsUp,
  Trash2,
  Upload,
  Video,
  X,
} from 'lucide-react';

const ICON_CLASS = 'size-4';

/**
 * Base configuration for creating a quick action.
 */
interface ActionConfig {
  id: string;
  icon: React.ReactNode;
  label: string;
  tooltip: string;
  tooltipPosition?: 'top' | 'bottom' | 'left' | 'right';
  variant?: IQuickAction['variant'];
  showInMenu?: boolean;
  sectionLabel?: string;
  dividerBefore?: boolean;
}

/**
 * Creates a standard quick action from a config object.
 */
function createStandardAction(
  ingredient: IIngredient,
  handler: ((ingredient: IIngredient) => void) | undefined,
  config: ActionConfig,
  isLoading?: boolean,
): IQuickAction | null {
  if (!handler) {
    return null;
  }

  return {
    ...config,
    isLoading,
    onClick: () => handler(ingredient),
  };
}

export const createPublishAction = (
  ingredient: IIngredient,
  handler?: IActionHandlers['onPublish'],
  isLoading?: boolean,
): IQuickAction | null => {
  if (!handler) {
    return null;
  }

  return {
    icon: <Upload className="size-4" />,
    id: 'publish',
    isLoading,
    label: 'Publish',
    onClick: () => handler(ingredient, 'auto'),
    showInMenu: true,
    tooltip: 'Publish',
    tooltipPosition: 'top',
    variant: 'primary',
  };
};

export const createMergeAction = (
  ingredient: IIngredient,
  handler?: IActionHandlers['onMerge'],
  isLoading?: boolean,
  isSelected?: boolean,
): IQuickAction | null => {
  if (!handler) {
    return null;
  }

  return {
    icon: isSelected ? <Minus className="size-4" /> : <Plus />,
    id: 'merge',
    isLoading,
    label: isSelected ? 'Remove' : 'Add',
    onClick: () => handler(ingredient),
    tooltip: isSelected ? 'Remove From Merge' : 'Add To Merge',
    tooltipPosition: 'top',
  };
};

export const createUpscaleAction = (
  ingredient: IIngredient,
  handler?: IActionHandlers['onUpscale'],
  isLoading?: boolean,
): IQuickAction | null =>
  createStandardAction(
    ingredient,
    handler,
    {
      dividerBefore: true,
      icon: <Maximize2 className={ICON_CLASS} />,
      id: 'upscale',
      label: 'Upscale',
      sectionLabel: 'Enhance',
      showInMenu: true,
      tooltip: 'Upscale',
      tooltipPosition: 'top',
    },
    isLoading,
  );

export const createExtendAction = (
  ingredient: IIngredient,
  handler?: IActionHandlers['onExtend'],
  isLoading?: boolean,
): IQuickAction | null => {
  if (
    ingredient.status !== IngredientStatus.GENERATED &&
    ingredient.status !== IngredientStatus.VALIDATED
  ) {
    return null;
  }

  return createStandardAction(
    ingredient,
    handler,
    {
      icon: <Film className={ICON_CLASS} />,
      id: 'extend',
      label: 'Extend',
      showInMenu: true,
      tooltip: 'Extend from last frame',
      tooltipPosition: 'top',
    },
    isLoading,
  );
};

export const createCloneAction = (
  ingredient: IIngredient,
  handler?: IActionHandlers['onClone'],
  isLoading?: boolean,
): IQuickAction | null =>
  createStandardAction(
    ingredient,
    handler,
    {
      icon: <Copy className={ICON_CLASS} />,
      id: 'clone',
      label: 'Clone',
      showInMenu: true,
      tooltip: 'Duplicate',
      tooltipPosition: 'top',
    },
    isLoading,
  );

export const createFavoriteAction = (
  ingredient: IIngredient,
  handler?: IActionHandlers['onToggleFavorite'],
  isLoading?: boolean,
): IQuickAction | null => {
  if (!handler) {
    return null;
  }

  return {
    icon: (
      <Star
        className={`size-4 ${ingredient.isFavorite ? 'fill-foreground' : ''}`}
      />
    ),
    id: 'favorite',
    isLoading,
    label: 'Favorite',
    onClick: () => handler(ingredient),
    showInMenu: true,
    tooltip: ingredient.isFavorite
      ? 'Remove from favorites'
      : 'Add to favorites',
    tooltipPosition: 'top',
    variant: 'ghost',
  };
};

export const createVoteAction = (
  ingredient: IIngredient,
  handler?: IActionHandlers['onVote'],
  isLoading?: boolean,
): IQuickAction | null => {
  if (!handler) {
    return null;
  }

  return {
    icon: <ThumbsUp className="size-4" />,
    id: 'vote',
    isLoading,
    label: `Vote ${ingredient.totalVotes || 0}`,
    onClick: () => handler(ingredient),
    showInMenu: true,
    tooltip: 'Vote for this ingredient',
    tooltipPosition: 'top',
    variant: ingredient.hasVoted ? 'primary' : 'ghost',
  };
};

export const createDownloadAction = (
  ingredient: IIngredient,
  handler?: IActionHandlers['onDownload'],
  isLoading?: boolean,
): IQuickAction | null =>
  createStandardAction(
    ingredient,
    handler,
    {
      icon: <Download className={ICON_CLASS} />,
      id: 'download',
      label: 'Download',
      showInMenu: true,
      tooltip: 'Download',
      tooltipPosition: 'top',
    },
    isLoading,
  );

export const createCaptionsAction = (
  ingredient: IIngredient,
  handler?: IActionHandlers['onGenerateCaptions'],
  isLoading?: boolean,
): IQuickAction | null =>
  createStandardAction(
    ingredient,
    handler,
    {
      icon: <MessageSquareText className={ICON_CLASS} />,
      id: 'captions',
      label: 'Add Captions',
      showInMenu: true,
      tooltip: 'Add Captions',
      tooltipPosition: 'top',
    },
    isLoading,
  );

export const createTextOverlayAction = (
  ingredient: IIngredient,
  handler?: IActionHandlers['onAddTextOverlay'],
  isLoading?: boolean,
): IQuickAction | null =>
  createStandardAction(
    ingredient,
    handler,
    {
      icon: <Pencil className={ICON_CLASS} />,
      id: 'text-overlay',
      label: 'Add Text Overlay',
      showInMenu: true,
      tooltip: 'Add Text Overlay',
      tooltipPosition: 'top',
    },
    isLoading,
  );

export const createReverseAction = (
  ingredient: IIngredient,
  handler?: IActionHandlers['onReverse'],
  isLoading?: boolean,
): IQuickAction | null =>
  createStandardAction(
    ingredient,
    handler,
    {
      icon: <RefreshCw className={ICON_CLASS} />,
      id: 'reverse',
      label: 'Reverse Video',
      sectionLabel: 'Enhance',
      showInMenu: true,
      tooltip: 'Reverse',
      tooltipPosition: 'top',
    },
    isLoading,
  );

export const createMirrorAction = (
  ingredient: IIngredient,
  handler?: IActionHandlers['onMirror'],
  isLoading?: boolean,
): IQuickAction | null =>
  createStandardAction(
    ingredient,
    handler,
    {
      icon: <ArrowLeftRight className={ICON_CLASS} />,
      id: 'mirror',
      label: 'Mirror Flip',
      sectionLabel: 'Enhance',
      showInMenu: true,
      tooltip: 'Mirror',
      tooltipPosition: 'top',
    },
    isLoading,
  );

export const createTrimAction = (
  ingredient: IIngredient,
  handler?: IActionHandlers['onTrim'],
  isLoading?: boolean,
): IQuickAction | null =>
  createStandardAction(
    ingredient,
    handler,
    {
      icon: <Scissors className={ICON_CLASS} />,
      id: 'trim',
      label: 'Trim Video',
      showInMenu: true,
      tooltip: 'Trim',
      tooltipPosition: 'top',
    },
    isLoading,
  );

export const createPortraitAction = (
  ingredient: IIngredient,
  handler?: IActionHandlers['onPortrait'],
  isLoading?: boolean,
): IQuickAction | null =>
  createStandardAction(
    ingredient,
    handler,
    {
      icon: <RectangleVertical className={ICON_CLASS} />,
      id: 'portrait',
      label: 'Reframe to Portrait',
      showInMenu: true,
      tooltip: 'Portrait',
      tooltipPosition: 'top',
    },
    isLoading,
  );

export const createSquareAction = (
  ingredient: IIngredient,
  handler?: IActionHandlers['onSquare'],
  isLoading?: boolean,
): IQuickAction | null =>
  createStandardAction(
    ingredient,
    handler,
    {
      icon: <Square className={ICON_CLASS} />,
      id: 'square',
      label: 'Reframe to Square',
      showInMenu: true,
      tooltip: 'Square',
      tooltipPosition: 'top',
    },
    isLoading,
  );

export const createLandscapeAction = (
  ingredient: IIngredient,
  handler?: IActionHandlers['onLandscape'],
  isLoading?: boolean,
): IQuickAction | null =>
  createStandardAction(
    ingredient,
    handler,
    {
      icon: <RectangleHorizontal className={ICON_CLASS} />,
      id: 'landscape',
      label: 'Reframe to Landscape',
      showInMenu: true,
      tooltip: 'Landscape',
      tooltipPosition: 'top',
    },
    isLoading,
  );

export const createGifAction = (
  ingredient: IIngredient,
  handler?: IActionHandlers['onConvertToGif'],
  isLoading?: boolean,
): IQuickAction | null =>
  createStandardAction(
    ingredient,
    handler,
    {
      icon: <Film className={ICON_CLASS} />,
      id: 'gif',
      label: 'Transform to GIF',
      showInMenu: true,
      tooltip: 'GIF',
      tooltipPosition: 'top',
    },
    isLoading,
  );

export const createVideoAction = (
  ingredient: IIngredient,
  handler?: IActionHandlers['onConvertToVideo'],
  isLoading?: boolean,
): IQuickAction | null =>
  createStandardAction(
    ingredient,
    handler,
    {
      icon: <Video className={ICON_CLASS} />,
      id: 'convert-to-video',
      label: 'Convert to Video',
      showInMenu: true,
      tooltip: 'Convert to Video',
      tooltipPosition: 'top',
    },
    isLoading,
  );

export const createUseAsVideoReferenceAction = (
  ingredient: IIngredient,
  handler?: IActionHandlers['onUseAsVideoReference'],
  isLoading?: boolean,
): IQuickAction | null =>
  createStandardAction(
    ingredient,
    handler,
    {
      icon: <Sparkles className={ICON_CLASS} />,
      id: 'use-as-video-reference',
      label: 'Add to Storyboard',
      showInMenu: true,
      tooltip: 'Add to Storyboard',
      tooltipPosition: 'top',
    },
    isLoading,
  );

export const createVariationAction = (
  ingredient: IIngredient,
  handler?: IActionHandlers['onCreateVariation'],
  isLoading?: boolean,
): IQuickAction | null =>
  createStandardAction(
    ingredient,
    handler,
    {
      icon: <LayoutGrid className={ICON_CLASS} />,
      id: 'remix',
      label: 'Remix',
      showInMenu: true,
      tooltip: 'Remix this image',
      tooltipPosition: 'top',
    },
    isLoading,
  );

export const createDeleteAction = (
  ingredient: IIngredient,
  handler?: IActionHandlers['onDelete'],
  isLoading?: boolean,
): IQuickAction | null =>
  createStandardAction(
    ingredient,
    handler,
    {
      dividerBefore: true,
      icon: <Trash2 className={`${ICON_CLASS} text-destructive`} />,
      id: 'delete',
      label: 'Delete',
      showInMenu: true,
      tooltip: 'Move this ingredient to Trash',
      variant: 'error',
    },
    isLoading,
  );

export const createPromptAction = (
  ingredient: IIngredient,
  handler?: IActionHandlers['onShowPrompt'],
): IQuickAction | null => {
  if (
    !handler ||
    (!ingredient.text && !ingredient.prompt && !ingredient.promptText)
  ) {
    return null;
  }

  return {
    icon: <Clipboard className="size-4" />,
    id: 'prompt',
    label: 'Prompt',
    onClick: () => handler(ingredient),
    showInMenu: true,
    tooltip: 'View prompt',
    tooltipPosition: 'top',
  };
};

export const createCopyPromptAction = (
  ingredient: IIngredient,
  handler?: IActionHandlers['onCopy'],
): IQuickAction | null => {
  if (!ingredient.promptText) {
    return null;
  }

  return createStandardAction(ingredient, handler, {
    icon: <Clipboard className={ICON_CLASS} />,
    id: 'copy-prompt',
    label: 'Copy Prompt',
    showInMenu: true,
    tooltip: 'Copy Prompt',
    tooltipPosition: 'top',
  });
};

export const createUsePromptAction = (
  ingredient: IIngredient,
  handler?: IActionHandlers['onUsePrompt'],
  isLoading?: boolean,
): IQuickAction | null => {
  if (!handler || !ingredient.promptText) {
    return null;
  }

  return {
    icon: <Terminal className="size-4" />,
    id: 'use-prompt',
    isLoading,
    label: 'Use Prompt',
    onClick: () => handler(ingredient),
    showInMenu: true,
    tooltip: 'Open in Studio with this prompt',
    tooltipPosition: 'top',
  };
};

export const createShareAction = (
  ingredient: IIngredient,
  handler?: IActionHandlers['onShare'],
  isLoading?: boolean,
): IQuickAction | null =>
  createStandardAction(
    ingredient,
    handler,
    {
      icon: <Share2 className={ICON_CLASS} />,
      id: 'share',
      label: 'Share',
      showInMenu: true,
      tooltip: 'Share',
      tooltipPosition: 'top',
    },
    isLoading,
  );

export const createEditAction = (
  ingredient: IIngredient,
  handler?: IActionHandlers['onEdit'],
  isLoading?: boolean,
): IQuickAction | null =>
  createStandardAction(
    ingredient,
    handler,
    {
      icon: <Pencil className={ICON_CLASS} />,
      id: 'edit',
      label: 'Edit',
      showInMenu: true,
      tooltip: 'Edit',
      tooltipPosition: 'top',
    },
    isLoading,
  );

export const createMoreOptionsAction = (
  ingredient: IIngredient,
  handler?: IActionHandlers['onMoreOptions'],
  isLoading?: boolean,
): IQuickAction | null =>
  createStandardAction(
    ingredient,
    handler,
    {
      icon: <Ellipsis className={ICON_CLASS} />,
      id: 'more-options',
      label: 'More',
      tooltip: 'More',
      tooltipPosition: 'top',
    },
    isLoading,
  );

export const createSeeDetailsAction = (
  ingredient: IIngredient,
  handler?: IActionHandlers['onSeeDetails'],
): IQuickAction | null =>
  createStandardAction(ingredient, handler, {
    icon: <ExternalLink className={ICON_CLASS} />,
    id: 'see-details',
    label: 'See Details',
    showInMenu: true,
    tooltip: 'View full details',
    tooltipPosition: 'top',
  });

export const createMarkValidatedAction = (
  ingredient: IIngredient,
  handler?: IActionHandlers['onMarkValidated'],
  isLoading?: boolean,
): IQuickAction | null => {
  if (!handler) {
    return null;
  }

  const isValidated = ingredient.status === IngredientStatus.VALIDATED;

  return {
    icon: (
      <CircleCheck
        className={`size-4 ${isValidated ? 'text-success' : 'text-foreground'}`}
      />
    ),
    id: 'mark-validated',
    isDisabled: isValidated,
    isLoading,
    label: isValidated ? 'Validated' : 'Validate',
    onClick: () => handler(ingredient),
    showInMenu: true,
    tooltip: isValidated ? 'Already validated' : 'Valid',
    tooltipPosition: 'top',
    variant: isValidated ? ('primary' as const) : undefined,
  };
};

export const createMarkRejectedAction = (
  ingredient: IIngredient,
  handler?: IActionHandlers['onMarkRejected'],
  isLoading?: boolean,
): IQuickAction | null => {
  if (!handler) {
    return null;
  }

  const isRejected = ingredient.status === IngredientStatus.REJECTED;

  return {
    icon: (
      <X
        className={`size-4 ${isRejected ? 'text-destructive' : 'text-foreground'}`}
      />
    ),
    id: 'mark-rejected',
    isDisabled: isRejected,
    isLoading,
    label: isRejected ? 'Rejected' : 'Reject',
    onClick: () => handler(ingredient),
    showInMenu: true,
    tooltip: isRejected ? 'Already rejected' : 'Reject',
    tooltipPosition: 'top',
    variant: isRejected ? ('error' as const) : undefined,
  };
};

export const createMarkArchivedAction = (
  ingredient: IIngredient,
  handler?: IActionHandlers['onMarkArchived'],
  isLoading?: boolean,
): IQuickAction | null => {
  if (!handler) {
    return null;
  }

  const isArchived = ingredient.status === IngredientStatus.ARCHIVED;

  return {
    icon: <Archive className={ICON_CLASS} />,
    id: 'mark-archived',
    isDisabled: isArchived,
    isLoading,
    label: isArchived ? 'Archived' : 'Archive',
    onClick: () => handler(ingredient),
    showInMenu: true,
    tooltip: isArchived ? 'Already archived' : 'Archive',
    tooltipPosition: 'top',
  };
};

export const createConvertToPresetAction = (
  ingredient: IIngredient,
  handler?: IActionHandlers['onConvertToPreset'],
  isLoading?: boolean,
): IQuickAction | null =>
  createStandardAction(
    ingredient,
    handler,
    {
      icon: <CircleCheck className={ICON_CLASS} />,
      id: 'convert-to-preset',
      label: 'Convert to Preset',
      showInMenu: true,
      tooltip: 'Convert to Preset',
      tooltipPosition: 'top',
      variant: 'primary',
    },
    isLoading,
  );

export const createSetAsLogoAction = (
  ingredient: IIngredient,
  handler?: IActionHandlers['onSetAsLogo'],
  isLoading?: boolean,
): IQuickAction | null =>
  createStandardAction(
    ingredient,
    handler,
    {
      dividerBefore: true,
      icon: <RectangleHorizontal className={ICON_CLASS} />,
      id: 'set-as-logo',
      label: 'Set as Logo',
      sectionLabel: 'Branding',
      showInMenu: true,
      tooltip: 'Set as Account Logo',
      tooltipPosition: 'top',
    },
    isLoading,
  );

export const createSetAsBannerAction = (
  ingredient: IIngredient,
  handler?: IActionHandlers['onSetAsBanner'],
  isLoading?: boolean,
): IQuickAction | null =>
  createStandardAction(
    ingredient,
    handler,
    {
      icon: <RectangleHorizontal className={ICON_CLASS} />,
      id: 'set-as-banner',
      label: 'Set as Banner',
      showInMenu: true,
      tooltip: 'Set as Account Banner',
      tooltipPosition: 'top',
    },
    isLoading,
  );

export const createTagsAction = (
  ingredient: IIngredient,
  handler?: IActionHandlers['onManageTags'],
): IQuickAction | null =>
  createStandardAction(ingredient, handler, {
    dividerBefore: true,
    icon: <Hash className={ICON_CLASS} />,
    id: 'manage-tags',
    label: 'Tags',
    showInMenu: true,
    tooltip: 'Manage Tags',
    tooltipPosition: 'top',
  });
