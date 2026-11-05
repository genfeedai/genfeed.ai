import type {
  IngredientCategory,
  IngredientFormat,
  IngredientOrigin,
} from '@genfeedai/contracts';
import type {
  IAsset,
  IImage,
  IIngredient,
  IMusic,
  IPaginatedResponse,
  IVideo,
} from '@genfeedai/contracts/interfaces';
import type { AccountMediaReference } from '@genfeedai/contracts/interfaces/components/media-reference.interface';
import type { Dispatch, SetStateAction } from 'react';

/**
 * What the gallery modal hands back through `onSelect`: the ingredient kinds the
 * gallery can list. Brand-level reference assets never travel this callback —
 * they leave through `onSelectAccountReference`, which is typed `IAsset[]`.
 *
 * An empty array is the "nothing selected" signal; the modal never emits `null`.
 */
export type GallerySelectItem = IImage | IMusic | IVideo;

/**
 * `media` is the Library for images and videos (and the track list for music);
 * `references` is the brand's reference assets, offered to image pickers.
 */
export type GalleryTab = 'media' | 'references';

/** A paged list the gallery loads itself: music tracks or brand references. */
export type GalleryLoadedPage =
  | { tab: 'media'; data: IPaginatedResponse<GallerySelectItem> }
  | { tab: 'references'; data: IPaginatedResponse<IAsset> };

export interface ModalGalleryHeaderProps {
  category: IngredientCategory;
  activeTab: GalleryTab;
  localFormat: IngredientFormat;
  tabs: Array<{ id: GalleryTab; label: string }>;
  accountReference: IAsset | null;
  onTabChange: (tab: GalleryTab) => void;
  onUseAccountReference: () => void;
  /** Called once an upload from the picker finishes. */
  onUploaded: () => void;
}

/** Music tracks and brand references; images and videos use the Library. */
export interface ModalGalleryContentProps {
  category: IngredientCategory;
  activeTab: GalleryTab;
  isLoading: boolean;
  isLoadingReferences?: boolean;
  items: (IVideo | IMusic | IImage)[];
  selectedItems: string[];
  selectedItem: string;
  references?: IAsset[];
  onSelectItem: (item: IVideo | IMusic | IImage) => void;
  onSelectReference: (selectedIds: string[]) => void;
  onSelectionLimit: () => void;
  selectionLimit: number;
}

export interface ModalGalleryFooterProps {
  currentPage: number;
  totalPages: number;
  category: IngredientCategory;
  activeTab: GalleryTab;
  isLoading: boolean;
  selectedItems: string[];
  selectedItem: string;
  isNoneAllowed: boolean;
  onClear: () => void;
  onSelect: (items: GallerySelectItem[]) => void;
  onSelectAccountReference?: (assets: AccountMediaReference[]) => void;
  onClose: () => void;
  onConfirm: () => void;
  onPageChange: (page: number) => void;
}

/**
 * The image and video picker: the Library's search, filters and masonry grid,
 * with a tile click toggling the asset in the picker's selection.
 */
export interface ModalGalleryLibraryProps {
  category: IngredientCategory;
  library: UseGalleryLibraryReturn;
  selectedIds: string[];
  onToggleItem: (item: IIngredient) => void;
}

export interface UseGalleryLibraryProps {
  category: IngredientCategory;
  isOpen: boolean;
}

export interface UseGalleryLibraryReturn {
  items: IIngredient[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  search: string;
  origins: IngredientOrigin[];
  isStarredOnly: boolean;
  sort: string;
  onSearchChange: (value: string) => void;
  onOriginsChange: (origins: IngredientOrigin[]) => void;
  onStarredOnlyChange: (isStarredOnly: boolean) => void;
  onSortChange: (sort: string) => void;
  onClearFilters: () => void;
  /** Reload the first page, e.g. after an upload. */
  onRefresh: () => void;
}

export interface ModalGalleryItemMusicProps {
  music: IMusic;
  isSelected: boolean;
  onSelect: (music: IMusic) => void;
}

export interface ModalGalleryItemReferenceProps {
  reference: IAsset;
  isSelected: boolean;
  onSelect: (selectedIds: string[]) => void;
  onSelectionLimit: () => void;
  selectionLimit: number;
  selectedItems: string[];
}

export interface ModalGalleryReferencesTabProps {
  references: IAsset[];
  isLoadingReferences: boolean;
  selectedItems: string[];
  onSelectReference: (selectedIds: string[]) => void;
  onSelectionLimit: () => void;
  selectionLimit: number;
}

export interface UseModalGalleryProps {
  category: IngredientCategory;
  isOpen: boolean;
  format: IngredientFormat;
  selectedId?: string;
  maxSelectableItems?: number;
  selectedReferences?: string[];
}

export interface UseModalGalleryReturn {
  currentPage: number;
  totalPages: number;
  items: (IVideo | IMusic | IImage)[];
  isLoading: boolean;
  selectedItem: string;
  selectedItems: string[];
  selectedItemsData: (IVideo | IMusic | IImage)[];
  activeTab: GalleryTab;
  localFormat: IngredientFormat;
  references: IAsset[];
  isLoadingReferences: boolean;

  setSelectedItem: (id: string) => void;
  setSelectedItems: Dispatch<SetStateAction<string[]>>;
  setSelectedItemsData: Dispatch<SetStateAction<(IVideo | IMusic | IImage)[]>>;
  setActiveTab: (tab: GalleryTab) => void;
  loadPage: (page?: number) => Promise<void>;
  handleItemSelect: (item: IVideo | IMusic | IImage | IAsset) => void;
  notifySelectionLimit: () => void;

  selectionLimit: number;
  tabs: Array<{ id: GalleryTab; label: string }>;
}
