import type { IImage, IIngredient, ITag, IVideo } from '@genfeedai/interfaces';
import type { AssetScope } from '@genfeedai/enums';
import type { ReactNode } from 'react';

/**
 * Base masonry props shared between image and video components
 */
export interface BaseMasonryProps<T extends IIngredient = IIngredient> {
  isSelected?: boolean;
  isScrollFocused?: boolean;
  isActionsEnabled?: boolean;
  isSquare?: boolean;
  isFormatCompatible?: boolean;
  isPublicGallery?: boolean;
  /** Hide brand logo on profile pages where we're already on the brand page */
  isPublicProfile?: boolean;
  isDragEnabled?: boolean;
  availableTags?: ITag[];
  isLoadingTags?: boolean;
  /** Quality evaluation score (0-100) */
  evaluationScore?: number;
  /** True if cursor is inside masonry grid. Used by items to react to container-level mouse leave */
  isContainerHovered?: boolean;
  onHoverChange?: (isHovered: boolean) => void;
  onClickIngredient?: (ingredient: T) => void;
  onVoteIngredient?: (ingredient: T) => void;
  onDeleteIngredient?: (ingredient: T) => void;
  onPublishIngredient?: (ingredient: T) => void;
  onToggleFavorite?: (ingredient: T) => void;
  onCopyPrompt?: (ingredient: T) => void;
  onReprompt?: (ingredient: T) => void;
  onEditIngredient?: (ingredient: T) => void;
  onShareIngredient?: (ingredient: T) => void;
  onSeeDetails?: (ingredient: T) => void;
  onConvertToVideo?: (ingredient: T) => void;
  onUseAsVideoReference?: (ingredient: T) => void;
  onCreateVariation?: (ingredient: T) => void;
  onReverse?: (ingredient: T) => void;
  onMirror?: (ingredient: T) => void;
  onUpdateParent?: (ingredient: T, parentId: string | null) => void;
  onImageLoad?: () => void;
  onMarkRejected?: (ingredient: T) => void;
  onMarkValidated?: (ingredient: T) => void;
  onMarkArchived?: (ingredient: T) => void;
  onScopeChange?: (scope: AssetScope, updatedItem?: T) => void;
  onRefresh?: () => void;
}

export interface MasonryImageProps extends BaseMasonryProps<IImage> {
  image: IImage;
}

export interface MasonryVideoProps extends BaseMasonryProps<IVideo> {
  video: IVideo;
  isPortraiting?: boolean;
  isGeneratingCaptions?: boolean;
  isMirroring?: boolean;
  isReversing?: boolean;
  onMergeIngredient?: (ingredient: IVideo) => void;
  onMarkArchived?: (ingredient: IVideo) => void | Promise<void>;
  onPortraitVideo?: (ingredient: IVideo) => void;
  onGenerateCaptions?: (ingredient: IVideo) => void;
}

export interface MasonryProps {
  children: ReactNode;
  gap?: number;
  className?: string;
  columns?: {
    default: number;
    sm?: number;
    md?: number;
    lg?: number;
    xl?: number;
  };
}

export interface MasonryBadgeOverlayProps {
  ingredient: IIngredient;
  evaluationScore?: number;
  isPublicGallery?: boolean;
  className?: string;
}
