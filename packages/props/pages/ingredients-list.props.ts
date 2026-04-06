import type {
  AssetScope,
  IngredientCategory,
  ModalEnum,
} from '@genfeedai/enums';
import type {
  IElementBlacklist,
  IElementCamera,
  IElementMood,
  IElementStyle,
  IFolder,
  IFontFamily,
  IIngredient,
  IModel,
  IPreset,
  ISound,
  ITag,
} from '@genfeedai/interfaces';
import type { IngredientsTypeProps } from '@props/content/ingredient.props';
import type { PageScope } from '@ui-constants/misc.constant';
import type { Dispatch, SetStateAction } from 'react';

export interface IngredientsListProps extends IngredientsTypeProps {
  scope?: PageScope.SUPERADMIN | PageScope.ORGANIZATION | PageScope.BRAND;
}

export interface IngredientsListHeaderProps {
  selectedCount: number;
  canMerge: boolean;
  canPublishCampaign?: boolean;
  isMerging: boolean;
  onClearSelection: () => void;
  onBulkDelete: () => void;
  onMerge: () => void;
  onPublishCampaign?: () => void;
}

export interface IngredientsListSidebarProps {
  scope: PageScope;
  folders: IFolder[];
  selectedFolderId?: string;
  isLoading: boolean;
  onSelectFolder: (folder: IFolder | null) => void;
  onDropIngredient: (ingredient: IIngredient, folder: IFolder | null) => void;
  onCreateFolder: () => void;
}

export interface IngredientsListContentProps {
  type: string;
  scope: PageScope;
  singularType: IngredientCategory | string;
  formatFilter?: string;
  isLoading: boolean;
  filteredIngredients: IIngredient[];
  hasFilteredEmptyState: boolean;
  selectedIngredientIds: string[];
  isActionsEnabled: boolean;
  isDragEnabled: boolean;
  isPortraiting: boolean;
  isGeneratingCaptions: boolean;
  isMirroring?: boolean;
  isReversing?: boolean;
  onSelectionChange: (selectedIds: string[]) => void;
  onDeleteIngredient: (ingredient: IIngredient) => void;
  onArchiveIngredient: (ingredient: IIngredient) => Promise<void> | void;
  onConvertToPortrait: (ingredient: IIngredient) => Promise<void> | void;
  onGenerateCaptions: (ingredient: IIngredient) => Promise<void> | void;
  onReverse?: (ingredient: IIngredient) => Promise<void> | void;
  onMirror?: (ingredient: IIngredient) => Promise<void> | void;
  onSeeDetails: (ingredient: IIngredient) => void;
  onUpdateParent: (
    ingredient: IIngredient,
    parentId: string | null,
  ) => Promise<void> | void;
  onRefresh: () => void;
  onPublishIngredient: (ingredient: IIngredient) => void;
  onOpenIngredientModal: (modalId: ModalEnum, ingredient?: IIngredient) => void;
  onOpenLightbox: (ingredient: IIngredient) => boolean;
  onClearFilters: () => void;
  onSetIngredients: Dispatch<SetStateAction<IIngredient[]>>;
  onScopeChange: (scope: AssetScope, updatedIngredient?: IIngredient) => void;
  onConvertToVideo?: (ingredient: IIngredient) => void;
  onCopyPrompt?: (ingredient: IIngredient) => void;
  onReprompt?: (ingredient: IIngredient) => void;
}

export interface IngredientsListFooterProps {
  scope: PageScope;
  brandId?: string | null;
  mediaIngredients: IIngredient[];
  lightboxOpen: boolean;
  lightboxIndex: number;
  onCloseLightbox: () => void;
  selectedFolderForModal: IFolder | null;
  onFolderModalConfirm: (isRefreshing?: boolean) => void;
}

export interface UseIngredientsListReturn {
  type: string;
  scope: PageScope;
  singularType: IngredientCategory | string;
  formatFilter?: string;
  isLoading: boolean;
  isUsingCache?: boolean;
  cachedAt?: string | null;
  isLoadingFolders: boolean;
  isMerging: boolean;
  ingredients: IIngredient[];
  setIngredients: Dispatch<SetStateAction<IIngredient[]>>;
  filteredIngredients: IIngredient[];
  mediaIngredients: IIngredient[];
  hasFilteredEmptyState: boolean;
  folders: IFolder[];
  selectedFolderId?: string;
  selectedFolderForModal: IFolder | null;
  selectedIngredientIds: string[];
  setSelectedIngredientIds: Dispatch<SetStateAction<string[]>>;
  isActionsEnabled: boolean;
  isDragEnabled: boolean;
  isPortraiting: boolean;
  isGeneratingCaptions: boolean;
  isMirroring: boolean;
  isReversing: boolean;
  lightboxOpen: boolean;
  lightboxIndex: number;
  brandId?: string | null;
  handleRefresh: (isRefreshing?: boolean) => Promise<void>;
  clearFilters: () => void;
  handleScopeChange: (
    scope: AssetScope,
    updatedIngredient?: IIngredient,
  ) => Promise<void>;
  handleDeleteIngredient: (ingredient: IIngredient) => void;
  handleArchiveIngredient: (ingredient: IIngredient) => Promise<void>;
  handleConvertToPortrait: (ingredient: IIngredient) => Promise<void>;
  handleGenerateCaptions: (ingredient: IIngredient) => Promise<void>;
  handleReverse: (ingredient: IIngredient) => Promise<void>;
  handleMirror: (ingredient: IIngredient) => Promise<void>;
  handleSeeDetails: (ingredient: IIngredient) => void;
  handleUpdateParent: (
    ingredient: IIngredient,
    parentId: string | null,
  ) => Promise<void>;
  handleCopyPrompt: (ingredient: IIngredient) => void;
  handleReprompt: (ingredient: IIngredient) => void;
  handleSelectFolder: (folder: IFolder | null) => void;
  handleFolderDrop: (
    ingredient: IIngredient,
    folder: IFolder | null,
  ) => Promise<void>;
  handleCreateFolder: () => void;
  handleFolderModalConfirm: (isRefreshing?: boolean) => void;
  handleMerge: () => Promise<void>;
  handleClearSelection: () => void;
  handleBulkDelete: () => void;
  openIngredientModal: (modalId: ModalEnum, ingredient?: IIngredient) => void;
  openLightboxForIngredient: (ingredient: IIngredient) => boolean;
  closeLightbox: () => void;
  handleConvertToVideo?: (ingredient: IIngredient) => void;
  imageToVideoTarget?: IIngredient | null;
  imageToVideoPromptData?: any;
  isImageToVideoGenerating?: boolean;
  handleImageToVideoPromptChange?: (data: any) => void;
  handleImageToVideoSubmit?: (data: any) => void;
  handleCloseImageToVideoModal?: () => void;
  videoModels?: IModel[];
  presets?: IPreset[];
  moods?: IElementMood[];
  styles?: IElementStyle[];
  cameras?: IElementCamera[];
  sounds?: ISound[];
  tags?: ITag[];
  fontFamilies?: IFontFamily[];
  blacklists?: IElementBlacklist[];
}
