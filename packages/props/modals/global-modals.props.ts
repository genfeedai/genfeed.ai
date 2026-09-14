import type {
  IngredientCategory,
  Platform,
  PostRepurposeMode,
} from '@genfeedai/contracts';
import type {
  IAsset,
  IBrand,
  ICredential,
  IIngredient,
  IPost,
} from '@genfeedai/contracts/interfaces';
import type { Brand } from '@genfeedai/models/organization/brand.model';
import type {
  ModalConfirmProps,
  ModalExportProps,
  ModalMetadataProps,
  ModalPromptProps,
} from '@genfeedai/props/modals/modal.props';
import type { GallerySelectItem } from '@genfeedai/props/modals/modal-gallery.props';
import type { PostRepurposeSource } from '@genfeedai/props/modals/modal-post-repurpose.props';
import type { ReactNode } from 'react';

export interface GlobalModalUploadConfig {
  category: IngredientCategory | string;
  parentId?: string;
  parentModel?: string;
  width?: number;
  height?: number;
  isResizeEnabled?: boolean;
  isMultiple?: boolean;
  maxFiles?: number;
  initialFiles?: File[];
  autoSubmit?: boolean;
  onComplete?: (ingredients: (IIngredient | IAsset)[]) => void;
}

export interface GlobalModalGalleryConfig {
  category: IngredientCategory;
  onSelect: (items: GallerySelectItem[]) => void;
  title?: string;
  selectedId?: string;
  format?: string;
  isNoneAllowed?: boolean;
  maxSelectableItems?: number;
  accountReference?: IAsset | null;
  onSelectAccountReference?: (assets: IAsset[]) => void;
  selectedReferences?: string[];
}

export interface GlobalModalIllustrationConfig {
  postId: string;
  initialPrompt?: string;
  platform?: Platform;
  onConfirm: (imageId: string) => void;
}

export interface GlobalModalConfirmDeleteConfig {
  entity: { id: string; label?: string; [key: string]: unknown } | null;
  entityName: string;
  onConfirm: () => void | Promise<void>;
  confirmLabel?: string;
}

export interface GlobalModalsContextValue {
  publishIngredient: IIngredient | null;
  openPostBatchModal: (ingredient: IIngredient | IIngredient[]) => void;
  handlePostClose: () => void;
  openPostMetadataOverlay: (post: IPost, onConfirm?: () => void) => void;
  closePostMetadataOverlay: () => void;
  openConfirm: (
    config: Omit<ModalConfirmProps, 'onConfirm'> & {
      onConfirm: () => void | Promise<void>;
    },
  ) => void;
  closeConfirm: () => void;
  openUpload: (config: GlobalModalUploadConfig) => void;
  closeUpload: () => void;
  openGallery: (config: GlobalModalGalleryConfig) => void;
  closeGallery: () => void;
  openIngredientOverlay: (
    ingredient: IIngredient | null,
    onConfirm?: () => void,
  ) => void;
  closeIngredientOverlay: () => void;
  openExport: (config: ModalExportProps) => void;
  closeExport: () => void;
  openCredentialModal: (
    credential: ICredential | null,
    onConfirm: () => void,
  ) => void;
  closeCredentialModal: () => void;
  openPromptModal: (
    config: Omit<ModalPromptProps, 'onConfirm'> & {
      onConfirm: (prompt: string) => void;
    },
  ) => void;
  closePromptModal: () => void;
  openMetadataModal: (config: ModalMetadataProps) => void;
  closeMetadataModal: () => void;
  openBrandOverlay: (
    brand: IBrand | Brand | null,
    onConfirm?: () => void,
    initialView?: 'edit' | 'overview',
  ) => void;
  closeBrandOverlay: () => void;
  openGenerateIllustration: (config: GlobalModalIllustrationConfig) => void;
  closeGenerateIllustration: () => void;
  openPostRemixModal: (
    post: IPost,
    onSubmit: (description: string, label?: string) => Promise<void>,
  ) => void;
  closePostRemixModal: () => void;
  openPostRepurposeModal: (
    source: PostRepurposeSource,
    onSubmit: (platform: Platform, mode: PostRepurposeMode) => Promise<void>,
  ) => void;
  closePostRepurposeModal: () => void;
}

export interface GlobalModalsProviderProps {
  children: ReactNode;
}
