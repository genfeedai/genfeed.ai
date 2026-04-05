import type { IIngredient } from '@genfeedai/interfaces';
import type {
  IActionHandlers,
  IQuickAction,
} from '@genfeedai/interfaces/ui/quick-actions.interface';
import { IngredientStatus } from '@genfeedai/enums';
import {
  HiArrowDownTray,
  HiArrowPath,
  HiArrowsPointingOut,
  HiArrowsRightLeft,
  HiArrowTopRightOnSquare,
  HiArrowUpTray,
  HiCheckCircle,
  HiClipboardDocument,
  HiCommandLine,
  HiDocumentDuplicate,
  HiEllipsisHorizontal,
  HiFilm,
  HiHandThumbUp,
  HiHashtag,
  HiOutlineChatBubbleBottomCenterText,
  HiOutlineMinus,
  HiPencil,
  HiPlus,
  HiScissors,
  HiShare,
  HiSparkles,
  HiSquaresPlus,
  HiStar,
  HiTrash,
  HiVideoCamera,
  HiXMark,
} from 'react-icons/hi2';
import {
  MdOutlineCropLandscape,
  MdOutlineCropPortrait,
  MdOutlineCropSquare,
} from 'react-icons/md';

const ICON_CLASS = 'w-4 h-4';

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
    icon: <HiArrowUpTray className="w-4 h-4" />,
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
    icon: isSelected ? <HiOutlineMinus className="w-4 h-4" /> : <HiPlus />,
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
      icon: <HiArrowsPointingOut className={ICON_CLASS} />,
      id: 'upscale',
      label: 'Upscale',
      sectionLabel: 'Enhance',
      showInMenu: true,
      tooltip: 'Upscale',
      tooltipPosition: 'top',
    },
    isLoading,
  );

export const createCloneAction = (
  ingredient: IIngredient,
  handler?: IActionHandlers['onClone'],
  isLoading?: boolean,
): IQuickAction | null =>
  createStandardAction(
    ingredient,
    handler,
    {
      icon: <HiDocumentDuplicate className={ICON_CLASS} />,
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
      <HiStar
        className={`w-4 h-4 ${ingredient.isFavorite ? 'fill-yellow-500' : ''}`}
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
    icon: <HiHandThumbUp className="w-4 h-4" />,
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
      icon: <HiArrowDownTray className={ICON_CLASS} />,
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
      icon: <HiOutlineChatBubbleBottomCenterText className={ICON_CLASS} />,
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
      icon: <HiPencil className={ICON_CLASS} />,
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
      icon: <HiArrowPath className={ICON_CLASS} />,
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
      icon: <HiArrowsRightLeft className={ICON_CLASS} />,
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
      icon: <HiScissors className={ICON_CLASS} />,
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
      icon: <MdOutlineCropPortrait className={ICON_CLASS} />,
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
      icon: <MdOutlineCropSquare className={ICON_CLASS} />,
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
      icon: <MdOutlineCropLandscape className={ICON_CLASS} />,
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
      icon: <HiFilm className={ICON_CLASS} />,
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
      icon: <HiVideoCamera className={ICON_CLASS} />,
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
      icon: <HiSparkles className={ICON_CLASS} />,
      id: 'use-as-video-reference',
      label: 'Set as Video Reference',
      showInMenu: true,
      tooltip: 'Set as Video Reference',
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
      icon: <HiSquaresPlus className={ICON_CLASS} />,
      id: 'create-variation',
      label: 'Create Variation',
      showInMenu: true,
      tooltip: 'Create Image Variation',
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
      icon: <HiTrash className={`${ICON_CLASS} text-white`} />,
      id: 'delete',
      label: 'Delete',
      showInMenu: true,
      tooltip: 'Delete this ingredient permanently',
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
    icon: <HiClipboardDocument className="w-4 h-4" />,
    id: 'prompt',
    label: 'Prompt',
    onClick: () => handler(ingredient),
    showInMenu: true,
    tooltip: 'View prompt',
    tooltipPosition: 'top',
  };
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
    icon: <HiCommandLine className="w-4 h-4" />,
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
      icon: <HiShare className={ICON_CLASS} />,
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
      icon: <HiPencil className={ICON_CLASS} />,
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
      icon: <HiEllipsisHorizontal className={ICON_CLASS} />,
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
    icon: <HiArrowTopRightOnSquare className={ICON_CLASS} />,
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
      <HiCheckCircle
        className={`w-4 h-4 ${isValidated ? 'text-green-500' : 'text-white'}`}
      />
    ),
    id: 'mark-validated',
    isLoading,
    label: isValidated ? 'Validated' : 'Valid',
    onClick: () => handler(ingredient),
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
      <HiXMark
        className={`w-4 h-4 ${isRejected ? 'text-red-500' : 'text-white'}`}
      />
    ),
    id: 'mark-rejected',
    isLoading,
    label: isRejected ? 'Rejected' : 'Reject',
    onClick: () => handler(ingredient),
    tooltip: isRejected ? 'Already rejected' : 'Reject',
    tooltipPosition: 'top',
    variant: isRejected ? ('error' as const) : undefined,
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
      icon: <HiCheckCircle className={ICON_CLASS} />,
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
      icon: <MdOutlineCropLandscape className={ICON_CLASS} />,
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
      icon: <MdOutlineCropLandscape className={ICON_CLASS} />,
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
    icon: <HiHashtag className={ICON_CLASS} />,
    id: 'manage-tags',
    label: 'Tags',
    showInMenu: true,
    tooltip: 'Manage Tags',
    tooltipPosition: 'top',
  });
