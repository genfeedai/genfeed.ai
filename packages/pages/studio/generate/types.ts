import type { IFolder, IIngredient, IModel, IPreset } from '@genfeedai/interfaces';
import type {
  AvatarVoiceData,
  AvatarVoiceOption,
} from '@genfeedai/interfaces/studio/studio-generate.interface';
import type { IFiltersState } from '@genfeedai/interfaces/utils/filters.interface';
import type { PromptTextareaSchema } from '@genfeedai/client/schemas';
import {
  type IngredientCategory,
  type IngredientFormat,
  ViewType,
} from '@genfeedai/enums';
import type { MutableRefObject } from 'react';

export interface UseAssetLoadingParams {
  brandId: string;
  categoryType: IngredientCategory;
  isReady: boolean;
  syncPlaybackState: (assets: IIngredient[]) => IIngredient[];
  stopAllMusic: () => void;
  filtersRef: MutableRefObject<IFiltersState>;
}

export interface UseAssetLoadingReturn {
  allAssets: IIngredient[];
  setAllAssets: React.Dispatch<React.SetStateAction<IIngredient[]>>;
  isLoading: boolean;
  isLoadingMore: boolean;
  isRefreshing: boolean;
  hasMore: boolean;
  initialLoadComplete: boolean;
  currentPage: number;
  findAllAssets: (
    page?: number,
    append?: boolean,
    skipLoadingState?: boolean,
    overrideBrandId?: string,
  ) => Promise<void>;
  handleLoadMore: () => Promise<void>;
  handleRefresh: () => void;
  resetPaginationState: () => void;
}

export interface UsePromptStateParams {
  categoryType: IngredientCategory;
  initialFormat: IngredientFormat | '';
  parsedSearchParams: URLSearchParams;
  hasPromptConfigInUrl: boolean;
}

export interface UsePromptStateReturn {
  promptText: string;
  setPromptText: React.Dispatch<React.SetStateAction<string>>;
  promptConfig: Partial<Omit<PromptTextareaSchema, 'text'>> & {
    isValid: boolean;
  };
  setPromptConfig: React.Dispatch<
    React.SetStateAction<
      Partial<Omit<PromptTextareaSchema, 'text'>> & { isValid: boolean }
    >
  >;
  promptDataRef: MutableRefObject<
    Partial<PromptTextareaSchema> & { isValid: boolean }
  >;
  hasHydratedPromptState: boolean;
}

export interface UseSocketGenerationParams {
  brandId: string;
  categoryType: IngredientCategory;
  currentModels: IModel[];
  findAllAssets: (
    page?: number,
    append?: boolean,
    skipLoadingState?: boolean,
    overrideBrandId?: string,
  ) => Promise<void>;
  setGeneratedAssetId: (id: string | null) => void;
}

export interface UseSocketGenerationReturn {
  handleGenerateSubmit: (
    promptData: PromptTextareaSchema & { isValid: boolean },
  ) => Promise<void>;
  isGenerationCooldown: boolean;
}

export interface UseAssetActionsParams {
  allAssets: IIngredient[];
  brandId: string;
  categoryType: IngredientCategory;
  currentModels: IModel[];
  currentPage: number;
  findAllAssets: (
    page?: number,
    append?: boolean,
    skipLoadingState?: boolean,
    overrideBrandId?: string,
  ) => Promise<void>;
  handleGenerateSubmit: (
    promptData: PromptTextareaSchema & { isValid: boolean },
  ) => Promise<void>;
  setSelectedAsset: (asset: IIngredient | null) => void;
}

export interface UseAssetActionsReturn {
  handleIngredientClick: (ingredient: IIngredient) => void;
  handleSeeDetails: (ingredient: IIngredient) => void;
  handleCopy: (item: IIngredient) => void;
  handleReprompt: (ingredient: IIngredient) => Promise<void>;
  handleEditIngredient: (ingredient: IIngredient) => void;
  handleConvertImageToVideo: (ingredient: IIngredient) => void;
  handleCreateVariation: (ingredient: IIngredient) => void;
  handleToggleFavorite: (item: IIngredient) => Promise<void>;
  handleMarkValidated: (item: IIngredient) => Promise<void>;
  handleMarkRejected: (item: IIngredient) => Promise<void>;
  handleMarkArchived: (item: IIngredient) => Promise<void>;
  handlePublishIngredient: (ingredient: IIngredient) => void;
  lightboxOpen: boolean;
  setLightboxOpen: React.Dispatch<React.SetStateAction<boolean>>;
  lightboxIndex: number;
  setLightboxIndex: React.Dispatch<React.SetStateAction<number>>;
}

export interface UseTableColumnsParams {
  categoryType: IngredientCategory;
  allAssets: IIngredient[];
  handleCopy: (item: IIngredient) => void;
  handleMusicPlay: (item: IIngredient) => void;
  setLightboxIndex: React.Dispatch<React.SetStateAction<number>>;
  setLightboxOpen: React.Dispatch<React.SetStateAction<boolean>>;
  findAllAssets: (
    page?: number,
    append?: boolean,
    skipLoadingState?: boolean,
  ) => Promise<void>;
  openPostBatchModal: (ingredient: IIngredient | IIngredient[]) => void;
}

export interface UseFiltersParams {
  categoryType: IngredientCategory;
  initialFormat: IngredientFormat | '';
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  setLoadedPages: React.Dispatch<React.SetStateAction<number[]>>;
  setAllAssets: React.Dispatch<React.SetStateAction<IIngredient[]>>;
}

export interface UseFiltersReturn {
  filters: IFiltersState;
  setFilters: React.Dispatch<React.SetStateAction<IFiltersState>>;
  filtersRef: MutableRefObject<IFiltersState>;
  handleFiltersChange: (newFilters: IFiltersState) => void;
}

export interface StudioGenerateContextData {
  avatarData: AvatarVoiceData | undefined;
  avatarOptions: AvatarVoiceOption[];
  voiceOptions: AvatarVoiceOption[];
  selectedAvatar: IIngredient | undefined;
  selectedAvatarPreviewUrl: string | undefined;
  filteredPresets: IPreset[];
  currentModels: IModel[];
  folders: IFolder[];
}

export interface ViewModeState {
  viewMode: ViewType.MASONRY | ViewType.TABLE;
  handleViewModeChange: (mode: ViewType.MASONRY | ViewType.TABLE) => void;
}
