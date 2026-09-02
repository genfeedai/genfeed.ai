import type {
  IngredientCategory,
  IngredientFormat,
} from '@genfeedai/contracts';
import type {
  IAsset,
  IImage,
  IMusic,
  IVideo,
} from '@genfeedai/contracts/interfaces';
import type { ComponentType, Dispatch, SetStateAction } from 'react';

/**
 * What the gallery modal hands back through `onSelect`: the ingredient kinds the
 * gallery can list. Brand-level reference assets never travel this callback —
 * they leave through `onSelectAccountReference`, which is typed `IAsset[]`.
 *
 * An empty array is the "nothing selected" signal; the modal never emits `null`.
 */
export type GallerySelectItem = IImage | IMusic | IVideo;

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

export interface ModalGalleryFooterProps {
  category: IngredientCategory;
  activeTab: 'media' | 'references' | 'uploads' | 'creations';
  isLoading: boolean;
  selectedItems: string[];
  selectedItemsData: (IVideo | IMusic | IImage)[];
  selectedItem: string;
  isNoneAllowed: boolean;
  onClear: () => void;
  onSelect: (items: GallerySelectItem[]) => void;
  onSelectAccountReference?: (assets: IAsset[]) => void;
  onClose: () => void;
  onConfirm: () => void;
  onPageChange: (page: number) => void;
}

export interface ModalGalleryItemVideoProps {
  video: IVideo;
  onSelect: (video: IVideo) => void;
}

export interface ModalGalleryItemImageProps {
  image: IImage;
  isSelected: boolean;
  localFormat: IngredientFormat;
  onSelect: (image: IImage) => void;
  getFormatLabel: (formatValue?: IngredientFormat) => string;
  getImageFormat: (image: IImage) => IngredientFormat | null;
}

export interface ModalGalleryItemMusicProps {
  music: IMusic;
  isSelected: boolean;
  isPlaying: boolean;
  onSelect: (music: IMusic) => void;
  onPlayPause: (musicId: string, musicUrl: string) => void;
}

export interface ModalGalleryItemReferenceProps {
  reference: IAsset;
  isSelected: boolean;
  onSelect: (selectedIds: string[]) => void;
  onSelectionLimit: () => void;
  selectionLimit: number;
  selectedItems: string[];
}

export interface ModalGalleryUploadsTabProps {
  uploads: IImage[];
  isLoading: boolean;
  localFormat: IngredientFormat;
  selectedItems: string[];
  onSelectItem: (item: IImage) => void;
  getFormatLabel: (formatValue?: IngredientFormat) => string;
  getImageFormat: (image: IImage) => IngredientFormat | null;
  onUploadClick: () => void;
}

export interface ModalGalleryCreationsTabProps {
  creations: IImage[];
  isLoadingCreations: boolean;
  localFormat: IngredientFormat;
  selectedItems: string[];
  onSelectItem: (item: IImage) => void;
  getFormatLabel: (formatValue?: IngredientFormat) => string;
  getImageFormat: (image: IImage) => IngredientFormat | null;
}

export interface ModalGalleryReferencesTabProps {
  references: IAsset[];
  isLoadingReferences: boolean;
  selectedItems: string[];
  onSelectReference: (selectedIds: string[]) => void;
  onSelectionLimit: () => void;
  selectionLimit: number;
}

export interface ModalGalleryEmptyStateProps {
  emptyIcon: ComponentType<{ className?: string }>;
  emptyMessage: string;
  category: IngredientCategory;
}

export interface UseModalGalleryProps {
  category: IngredientCategory;
  isOpen: boolean;
  format: IngredientFormat;
  selectedId?: string;
  maxSelectableItems?: number;
  selectedReferences?: string[];
  filterReferenceId?: string;
}

export interface UseModalGalleryReturn {
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

  selectionLimit: number;
  tabs: Array<{ id: string; label: string }>;
}
