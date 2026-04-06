import type {
  AssetScope,
  ComponentSize,
  IngredientFormat,
} from '@genfeedai/enums';
import type {
  IAudio,
  ICredential,
  IImage,
  IIngredient,
  IPost,
  IVideo,
} from '@genfeedai/interfaces';
import type { Dispatch, ReactNode, RefObject, SetStateAction } from 'react';

export interface IngredientListProps<T extends IIngredient = IIngredient> {
  ingredients: T[];
  selectedIngredientId: string[];
  scrollFocusedIngredientId?: string | null;
  isActionsEnabled?: boolean;
  highlightSelection?: boolean;
  isSquare?: boolean;
  isLoading?: boolean;
  format?: IngredientFormat;
  emptyLabel?: string;
  onShareIngredient?: (ingredient: T) => void;
  onClickIngredient?: (ingredient: T) => void; // Primary click action (select for edit or open modal)
  onDeleteIngredient?: (ingredient: T) => void;
  onVoteIngredient?: (ingredient: T) => void;
  onPublishIngredient?: (ingredient: T) => void;
  onToggleFavorite?: (ingredient: T) => void;
  onCopyPrompt?: (ingredient: T) => void;
  onReprompt?: (ingredient: T) => void;
  onEditIngredient?: (ingredient: T) => void;
  onMarkArchived?: (ingredient: T) => void | Promise<void>;
  onMarkValidated?: (ingredient: T) => void | Promise<void>;
  onMarkRejected?: (ingredient: T) => void | Promise<void>;
  onSeeDetails?: (ingredient: T) => void;
  onConvertToVideo?: (ingredient: T) => void;
  onUseAsVideoReference?: (ingredient: T) => void;
  onCreateVariation?: (ingredient: T) => void;
  onConvertToPortrait?: (ingredient: T) => void;
  onGenerateCaptions?: (ingredient: T) => void;
  onReverse?: (ingredient: T) => void;
  onMirror?: (ingredient: T) => void;
  onUpdateParent?: (ingredient: T, parentId: string | null) => void;
  onScopeChange?: (scope: AssetScope, updatedIngredient?: IIngredient) => void;
  onRefresh?: () => void;
  isPortraiting?: boolean;
  isGeneratingCaptions?: boolean;
  isMirroring?: boolean;
  isReversing?: boolean;
  isDragEnabled?: boolean;
  ignoreFormatCompatibility?: boolean;
}

export interface IngredientsMediaGridProps {
  emptyLabel: string;
  items: IIngredient[];
  isLoading: boolean;
  isActionsEnabled: boolean;
  isDragEnabled: boolean;
  format?: IngredientFormat;
  selectedIds: string[];
  onDeleteIngredient: (ingredient: IIngredient) => void;
  onMarkArchived: (ingredient: IIngredient) => Promise<void> | void;
  onConvertToPortrait: (ingredient: IIngredient) => Promise<void> | void;
  onGenerateCaptions: (ingredient: IIngredient) => Promise<void> | void;
  onReverse?: (ingredient: IIngredient) => Promise<void> | void;
  onMirror?: (ingredient: IIngredient) => Promise<void> | void;
  onSeeDetails: (ingredient: IIngredient) => Promise<void> | void;
  onUpdateParent: (
    ingredient: IIngredient,
    parentId: string | null,
  ) => Promise<void> | void;
  onRefresh: () => void;
  onPublishIngredient: (ingredient: IIngredient) => void;
  onClickIngredient: (ingredient: IIngredient) => void;
  isPortraiting: boolean;
  isGeneratingCaptions: boolean;
  isMirroring?: boolean;
  isReversing?: boolean;
  onScopeChange?: (scope: AssetScope, updatedIngredient?: IIngredient) => void;
  onConvertToVideo?: (ingredient: IIngredient) => void;
  onCopyPrompt?: (ingredient: IIngredient) => void;
  onReprompt?: (ingredient: IIngredient) => void;
}

export interface IngredientsTypeProps {
  type: string;
}

export interface IngredientSoundProps {
  ingredients: IIngredient[];
  setIngredients: Dispatch<SetStateAction<IIngredient[]>>;
}

export interface ChildrenManagerProps {
  currentIngredient: IIngredient;
  onUpdate: () => void;
  isRealtime?: boolean;
  format?: string;
}

export interface ParentsManagerProps {
  currentIngredient: IIngredient;
  onUpdate: () => void;
  isRealtime?: boolean;
}

export interface IngredientTabsSharingProps {
  ingredient: IIngredient;
  isUpdating?: boolean;
  onUpdateSharing?: (field: string, value: boolean | string) => void;
}

export interface IngredientTabsTagsProps {
  ingredient: IIngredient;
  onUpdate?: () => void;
  isPostMode?: boolean;
}

export interface IngredientTabsChildrenProps {
  ingredient: IIngredient;
  onUpdate?: () => void;
  format?: string;
}

export interface ExtendedIngredientTabsChildrenProps
  extends IngredientTabsChildrenProps {
  onAddChild?: (child: IIngredient) => void;
  onRemoveChild?: (childId: string) => void;
  onViewChild?: (child: IIngredient) => void;
}

export interface IngredientTabsCaptionsProps {
  ingredient: IVideo;
  onReload?: () => void;
}

export interface IngredientChildrenManagerProps {
  ingredient: IIngredient;
  onChildrenChange?: (children: string[]) => void;
  isDisabled?: boolean;
}

export interface IngredientParentsManagerProps {
  ingredient: IIngredient;
  onParentsChange?: (parents: string[]) => void;
  isDisabled?: boolean;
}

export interface VideoTextOverlayPanelProps {
  video: IVideo;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

/**
 * Ingredient detail page props (Next.js page component)
 */
export interface IngredientDetailPageProps {
  params: Promise<{
    type: string;
    id: string;
  }>;
}

/**
 * Ingredient detail content props
 */
export interface IngredientDetailProps {
  type: string;
  id: string;
}

/**
 * Ingredient detail component props
 */
export interface IngredientDetailImageProps {
  image: IImage;
  childIngredients: IIngredient[];

  onVoteIngredient?: (image: IImage) => void;
  onEditImage?: (image: IImage) => void;
  onUpscaleImage?: (image: IImage) => void;
  onPublishImage?: (image: IImage, platform: string) => void;
  onCloneImage?: (image: IImage) => void;
  onConvertToVideo?: (image: IImage) => void;
  onUseAsVideoReference?: (image: IImage) => void;
  onCreateVariation?: (image: IImage) => void;
  onShareImage?: (image: IImage) => void;
  onDownloadImage?: (
    image: IImage,
  ) => undefined | Promise<undefined | Window | null | undefined>;
  onCopyPrompt?: (image: IImage) => void;
  onReprompt?: (image: IImage) => void;
  onUsePrompt?: (image: IImage) => void;
  onSeeDetails?: (image: IImage) => void;
  onUpdateMetadata?: (field: string, value: string) => Promise<any>;
  onUpdateSharing?: (field: string, value: boolean | string) => Promise<any>;
  onScopeChange?: (scope: AssetScope, updatedIngredient?: IIngredient) => void;

  isUpscaling?: boolean;
  isPublishing?: boolean;
  isCloning?: boolean;
  isConvertingToVideo?: boolean;
  isDownloading?: boolean;
  isVoting?: boolean;
  isUpdating?: boolean;
}

export interface IngredientDetailVideoProps {
  video: IVideo;
  childIngredients: IIngredient[];
  credentials?: ICredential[];
  videoRef?: RefObject<HTMLVideoElement | null>;

  onReload?: (skipNotification?: boolean) => Promise<void>;
  onVoteIngredient?: (video: IVideo) => void;
  onEditVideo?: (video: IVideo) => void;
  onUpscaleVideo?: (video: IVideo) => void;
  onPublishVideo?: (video: IVideo, platform: string) => void;
  onCloneVideo?: (video: IVideo) => void;
  onShareVideo?: (video: IVideo) => void;
  onDownloadVideo?: (
    video: IVideo,
  ) => undefined | Promise<undefined | Window | null | undefined>;
  onCopyPrompt?: (video: IVideo) => void;
  onReprompt?: (video: IVideo) => void;
  onUsePrompt?: (video: IVideo) => void;
  onConvertToGif?: (video: IVideo) => void;
  onReverseVideo?: (video: IVideo) => void;
  onPortraitVideo?: (video: IVideo) => void;
  onMirrorVideo?: (video: IVideo) => void;
  onTrimVideo?: (video: IVideo) => void;
  onGenerateCaptions?: (video: IVideo) => void;
  onAddTextOverlay?: (video: IVideo) => void;
  onSeeDetails?: (video: IVideo) => void;
  onUpdateMetadata?: (field: string, value: string) => Promise<any>;
  onUpdateSharing?: (field: string, value: boolean | string) => Promise<any>;

  isUpscaling?: boolean;
  isPublishing?: boolean;
  isCloning?: boolean;
  isDownloading?: boolean;
  isVoting?: boolean;
  isUpdating?: boolean;
  isConverting?: boolean;
  isReversing?: boolean;
  isPortraiting?: boolean;
  isMirroring?: boolean;
  isTrimming?: boolean;
  isGeneratingCaptions?: boolean;
  isAddingTextOverlay?: boolean;
}

export interface IngredientDetailAudioProps {
  ingredient: IAudio;
  className?: string;
  showWaveform?: boolean;
}

/**
 * Ingredient tabs component props
 */
export interface IngredientTabsProps {
  ingredient: IIngredient | null;
  onClose?: () => void;
  onUpdate?: (ingredient: IIngredient) => void;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

/**
 * Individual tab component props
 */
export interface TabsIngredientInfoProps {
  ingredient: IIngredient;
  onUpdate?: (data: Partial<IIngredient>) => void;
  onUpdateMetadata?: (field: string, value: string) => Promise<any>;
  isEditable?: boolean;
  isUpdating?: boolean | any;
}

export interface IngredientTabsPromptsProps {
  ingredient: IIngredient;
  showHistory?: boolean;
  onPromptEdit?: (prompt: string) => void;
  isEditable?: boolean;
}

export interface IngredientTabsPostsProps {
  ingredient: IIngredient;
  posts?: IPost[];
  onPublish?: (platform: string) => void;
  onUnpublish?: (publicationId: string) => void;
  isLoading?: boolean;
}

/**
 * Base ingredient action interface
 */
export interface BaseIngredientAction<T extends IIngredient = IIngredient> {
  ingredient: T;
  onEdit?: (ingredient: T) => void;
  onDelete?: (ingredient: T) => void;
  onDownload?: (ingredient: T) => void;
  onShare?: (ingredient: T) => void;
  onDuplicate?: (ingredient: T) => void;
  showAll?: boolean;
  className?: string;
}

/**
 * Ingredient preview props
 */
export interface IngredientPreviewProps {
  ingredient: IIngredient;
  size?:
    | ComponentSize.SM
    | ComponentSize.MD
    | ComponentSize.LG
    | ComponentSize.XL;
  showOverlay?: boolean;
  overlayContent?: ReactNode;
  onClick?: () => void;
  className?: string;
}

/**
 * Ingredient filter props
 */

export interface IngredientFilters {
  type?: string[];
  status?: string[];
  visibility?: string[];
  tags?: string[];
  dateRange?: {
    start: string;
    end: string;
  };
  search?: string;
  [key: string]: unknown;
}

/**
 * Selection actions bar props
 */
export interface SelectionActionsBarProps {
  count: number;
  canMerge?: boolean;
  canPublishCampaign?: boolean;
  isMerging?: boolean;
  onClear: () => void;
  onBulkDelete: () => void;
  onMerge?: () => void;
  onPublishCampaign?: () => void;
}
