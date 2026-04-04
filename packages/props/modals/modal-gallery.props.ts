import type { IAsset, IImage, IMusic, IVideo } from '@genfeedai/interfaces';
import type { IngredientCategory, IngredientFormat } from '@genfeedai/enums';
import type { Dispatch, SetStateAction } from 'react';

/**
 * Props for ModalGalleryHeader component
 */
export interface ModalGalleryHeaderProps {
  category: IngredientCategory;
  activeTab: 'media' | 'references' | 'uploads' | 'creations';
  localFormat: IngredientFormat;
  filterReferenceId: string;
  tabs: Array<{ id: string; label: string }>;
  accountReference: IAsset | null;
  onTabChange: (tab: 'media' | 'references' | 'uploads' | 'creations') => void;
  onClearFilter: () => void;
  onUseAccountReference: () => void;
  onReloadItems?: () => void;
}

/**
 * Props for ModalGalleryContent component
 */
export interface ModalGalleryContentProps {
  category: IngredientCategory;
  activeTab: 'media' | 'references' | 'uploads' | 'creations';
  isLoading: boolean;
  isLoadingReferences?: boolean;
  isLoadingCreations?: boolean;
  items: (IVideo | IMusic | IImage)[];
  selectedItems: string[];
  selectedItem: string;
  playingId: string;
  localFormat: IngredientFormat;
  references?: IAsset[];
  uploads?: IImage[];
  creations?: IImage[];
  onSelectItem: (item: IVideo | IMusic | IImage) => void;
  onSelectReference: (selectedIds: string[]) => void;
  onSelectionLimit: () => void;
  selectionLimit: number;
  getFormatLabel: (formatValue?: IngredientFormat) => string;
  getImageFormat: (image: IImage) => IngredientFormat | null;
  onMusicPlayPause: (musicId: string, musicUrl: string) => void;
}

/**
 * Props for ModalGalleryFooter component
 */
export interface ModalGalleryFooterProps {
  category: IngredientCategory;
  activeTab: 'media' | 'references' | 'uploads' | 'creations';
  isLoading: boolean;
  selectedItems: string[];
  selectedItemsData: (IVideo | IMusic | IImage)[];
  selectedItem: string;
  isNoneAllowed: boolean;
  onClear: () => void;
  onSelect: (item: IAsset | IImage | (IAsset | IImage)[] | null) => void;
  onSelectAccountReference?: (assets: IAsset[]) => void;
  onClose: () => void;
  onConfirm: () => void;
  onPageChange: (page: number) => void;
}

/**
 * Props for ModalGalleryItemVideo component
 */
export interface ModalGalleryItemVideoProps {
  video: IVideo;
  onSelect: (video: IVideo) => void;
}

/**
 * Props for ModalGalleryItemImage component
 */
export interface ModalGalleryItemImageProps {
  image: IImage;
  isSelected: boolean;
  localFormat: IngredientFormat;
  onSelect: (image: IImage) => void;
  getFormatLabel: (formatValue?: IngredientFormat) => string;
  getImageFormat: (image: IImage) => IngredientFormat | null;
}

/**
 * Props for ModalGalleryItemMusic component
 */
export interface ModalGalleryItemMusicProps {
  music: IMusic;
  isSelected: boolean;
  isPlaying: boolean;
  onSelect: (music: IMusic) => void;
  onPlayPause: (musicId: string, musicUrl: string) => void;
}

/**
 * Props for ModalGalleryItemReference component
 */
export interface ModalGalleryItemReferenceProps {
  reference: IAsset;
  isSelected: boolean;
  onSelect: (selectedIds: string[]) => void;
  onSelectionLimit: () => void;
  selectionLimit: number;
  selectedItems: string[];
}

/**
 * Props for useModalGallery hook
 */
export interface UseModalGalleryProps {
  category: IngredientCategory;
  isOpen: boolean;
  format: IngredientFormat;
  selectedId?: string;
  maxSelectableItems?: number;
  selectedReferences?: string[];
  filterReferenceId?: string;
}

/**
 * Return type for useModalGallery hook
 */
export interface UseModalGalleryReturn {
  // State
  items: (IVideo | IMusic | IImage)[];
  isLoading: boolean;
  selectedItem: string;
  selectedItems: string[];
  selectedItemsData: (IVideo | IMusic | IImage)[];
  activeTab: 'media' | 'references' | 'uploads' | 'creations';
  localFormat: IngredientFormat;
  playingId: string;
  filterReferenceId: string;
  uploads: IImage[];
  references: IAsset[];
  creations: IImage[];
  isLoadingReferences: boolean;
  isLoadingCreations: boolean;

  // Handlers
  setSelectedItem: (id: string) => void;
  setSelectedItems: Dispatch<SetStateAction<string[]>>;
  setSelectedItemsData: Dispatch<SetStateAction<(IVideo | IMusic | IImage)[]>>;
  setActiveTab: (tab: 'media' | 'references' | 'uploads' | 'creations') => void;
  setLocalFormat: (format: IngredientFormat) => void;
  setFilterReferenceId: Dispatch<SetStateAction<string>>;
  findAllItems: (pageOverride?: number) => Promise<void>;
  findAllUploads: (pageOverride?: number) => Promise<void>;
  findAllCreations: (pageOverride?: number) => Promise<void>;
  findAllReferences: () => Promise<void>;
  handleItemSelect: (item: IVideo | IMusic | IImage | IAsset) => void;
  handleMusicPlayPause: (musicId: string, musicUrl: string) => void;
  notifySelectionLimit: () => void;

  // Computed
  selectionLimit: number;
  tabs: Array<{ id: string; label: string }>;
}
