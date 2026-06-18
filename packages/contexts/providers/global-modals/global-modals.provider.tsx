'use client';
import type { IngredientCategory, Platform } from '@genfeedai/enums';
import { capitalize } from '@genfeedai/helpers/formatting/format/format.helper';
import type {
  IAsset,
  IBrand,
  ICredential,
  IIngredient,
  IPost,
} from '@genfeedai/interfaces';
import type { UsePostModalOptions } from '@genfeedai/interfaces/hooks/use-publication-modal.interface';
import type { Brand } from '@genfeedai/models/organization/brand.model';
import type {
  ModalConfirmProps,
  ModalExportProps,
  ModalMetadataProps,
  ModalPromptProps,
} from '@genfeedai/props/modals/modal.props';
import {
  scheduleModalGlobalSideEffectCleanup,
  useRouteModalGlobalSideEffectCleanup,
} from '@ui/utils/modal-global-side-effects';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
} from 'react';
import GlobalModalsRenderer from './GlobalModalsRenderer';
import { useGlobalModalsState } from './useGlobalModalsState';

export interface GallerySelectItem {
  id: string;
  [key: string]: unknown;
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
  openUpload: (config: {
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
    onConfirm?: (ingredient?: IIngredient | IAsset) => void;
    onComplete?: (ingredients: (IIngredient | IAsset)[]) => void;
  }) => void;
  closeUpload: () => void;
  openGallery: (config: {
    category: IngredientCategory;
    onSelect: (item: GallerySelectItem | GallerySelectItem[] | null) => void;
    title?: string;
    selectedId?: string;
    format?: string;
    isNoneAllowed?: boolean;
    maxSelectableItems?: number;
    accountReference?: IAsset | null;
    onSelectAccountReference?: (assets: IAsset[]) => void;
    selectedReferences?: string[];
  }) => void;
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
  openGenerateIllustration: (config: {
    postId: string;
    initialPrompt?: string;
    platform?: Platform;
    onConfirm: (imageId: string) => void;
  }) => void;
  closeGenerateIllustration: () => void;
  openPostRemixModal: (
    post: IPost,
    onSubmit: (description: string, label?: string) => Promise<void>,
  ) => void;
  closePostRemixModal: () => void;
}

const GlobalModalsContext = createContext<GlobalModalsContextValue | null>(
  null,
);

export function usePostModal(options: UsePostModalOptions = {}): {
  handlePostClose: () => void;
  openPostBatchModal: (ingredient: IIngredient | IIngredient[]) => void;
  publishIngredient: IIngredient | null;
} {
  const context = use(GlobalModalsContext);
  if (!context) {
    throw new Error('usePostModal must be used within GlobalModalsProvider');
  }

  const handlePostClose = useCallback(() => {
    context.handlePostClose();
    if (options.onClose) {
      options.onClose();
    }
    if (options.onRefresh) {
      options.onRefresh();
    }
  }, [context, options]);

  return {
    handlePostClose,
    openPostBatchModal: context.openPostBatchModal,
    publishIngredient: context.publishIngredient,
  };
}

export function useConfirmModal(): Pick<
  GlobalModalsContextValue,
  'closeConfirm' | 'openConfirm'
> {
  const context = use(GlobalModalsContext);
  if (!context) {
    throw new Error('useConfirmModal must be used within GlobalModalsProvider');
  }
  return {
    closeConfirm: context.closeConfirm,
    openConfirm: context.openConfirm,
  };
}

export function useUploadModal(
  options: { onConfirm?: (ingredient?: IIngredient | IAsset) => void } = {},
) {
  const context = use(GlobalModalsContext);
  if (!context) {
    throw new Error('useUploadModal must be used within GlobalModalsProvider');
  }

  const openUpload = useCallback(
    (config: {
      category: string;
      parentId?: string;
      parentModel?: string;
      width?: number;
      height?: number;
      isResizeEnabled?: boolean;
      isMultiple?: boolean;
      maxFiles?: number;
      initialFiles?: File[];
      autoSubmit?: boolean;
      onConfirm?: (ingredient?: IIngredient | IAsset) => void;
      onComplete?: (ingredients: (IIngredient | IAsset)[]) => void;
    }) => {
      context.openUpload({
        ...config,
        onConfirm: config.onConfirm || options.onConfirm,
      });
    },
    [context, options.onConfirm],
  );

  return {
    closeUpload: context.closeUpload,
    openUpload,
  };
}

export function useGalleryModal(): Pick<
  GlobalModalsContextValue,
  'closeGallery' | 'openGallery'
> {
  const context = use(GlobalModalsContext);
  if (!context) {
    throw new Error('useGalleryModal must be used within GlobalModalsProvider');
  }
  return {
    closeGallery: context.closeGallery,
    openGallery: context.openGallery,
  };
}

export function useIngredientOverlay(): Pick<
  GlobalModalsContextValue,
  'closeIngredientOverlay' | 'openIngredientOverlay'
> {
  const context = use(GlobalModalsContext);
  if (!context) {
    throw new Error(
      'useIngredientOverlay must be used within GlobalModalsProvider',
    );
  }
  return {
    closeIngredientOverlay: context.closeIngredientOverlay,
    openIngredientOverlay: context.openIngredientOverlay,
  };
}

export function useExportModal(): Pick<
  GlobalModalsContextValue,
  'closeExport' | 'openExport'
> {
  const context = use(GlobalModalsContext);
  if (!context) {
    throw new Error('useExportModal must be used within GlobalModalsProvider');
  }
  return {
    closeExport: context.closeExport,
    openExport: context.openExport,
  };
}

export function useCredentialModal(): Pick<
  GlobalModalsContextValue,
  'closeCredentialModal' | 'openCredentialModal'
> {
  const context = use(GlobalModalsContext);
  if (!context) {
    throw new Error(
      'useCredentialModal must be used within GlobalModalsProvider',
    );
  }
  return {
    closeCredentialModal: context.closeCredentialModal,
    openCredentialModal: context.openCredentialModal,
  };
}

export function usePromptModal(): Pick<
  GlobalModalsContextValue,
  'closePromptModal' | 'openPromptModal'
> {
  const context = use(GlobalModalsContext);
  if (!context) {
    throw new Error('usePromptModal must be used within GlobalModalsProvider');
  }
  return {
    closePromptModal: context.closePromptModal,
    openPromptModal: context.openPromptModal,
  };
}

export function useConfirmDeleteModal() {
  const context = use(GlobalModalsContext);
  if (!context) {
    throw new Error(
      'useConfirmDeleteModal must be used within GlobalModalsProvider',
    );
  }

  const openConfirmDelete = useCallback(
    (config: {
      entity: { id: string; label?: string; [key: string]: unknown } | null;
      entityName: string;
      onConfirm: () => void | Promise<void>;
      confirmLabel?: string;
    }) => {
      if (!config.entity) {
        return;
      }

      const entityLabel =
        config.entity.label || config.entity.id || config.entityName;
      const label = `Delete ${capitalize(config.entityName)}`;
      const message = `Are you sure you want to delete "${entityLabel}"? This action cannot be undone.`;

      context.openConfirm({
        confirmLabel: config.confirmLabel || 'Delete',
        isError: true,
        label,
        message,
        onConfirm: config.onConfirm,
      });
    },
    [context],
  );

  return {
    closeConfirmDelete: context.closeConfirm,
    openConfirmDelete,
  };
}

export function useMetadataModal(): Pick<
  GlobalModalsContextValue,
  'closeMetadataModal' | 'openMetadataModal'
> {
  const context = use(GlobalModalsContext);
  if (!context) {
    throw new Error(
      'useMetadataModal must be used within GlobalModalsProvider',
    );
  }
  return {
    closeMetadataModal: context.closeMetadataModal,
    openMetadataModal: context.openMetadataModal,
  };
}

export function useBrandOverlay(): Pick<
  GlobalModalsContextValue,
  'closeBrandOverlay' | 'openBrandOverlay'
> {
  const context = use(GlobalModalsContext);
  if (!context) {
    throw new Error('useBrandOverlay must be used within GlobalModalsProvider');
  }
  return {
    closeBrandOverlay: context.closeBrandOverlay,
    openBrandOverlay: context.openBrandOverlay,
  };
}

export function usePostMetadataOverlay(): Pick<
  GlobalModalsContextValue,
  'closePostMetadataOverlay' | 'openPostMetadataOverlay'
> {
  const context = use(GlobalModalsContext);
  if (!context) {
    throw new Error(
      'usePostMetadataOverlay must be used within GlobalModalsProvider',
    );
  }
  return {
    closePostMetadataOverlay: context.closePostMetadataOverlay,
    openPostMetadataOverlay: context.openPostMetadataOverlay,
  };
}

export function useGenerateIllustrationModal(): Pick<
  GlobalModalsContextValue,
  'closeGenerateIllustration' | 'openGenerateIllustration'
> {
  const context = use(GlobalModalsContext);
  if (!context) {
    throw new Error(
      'useGenerateIllustrationModal must be used within GlobalModalsProvider',
    );
  }
  return {
    closeGenerateIllustration: context.closeGenerateIllustration,
    openGenerateIllustration: context.openGenerateIllustration,
  };
}

export function usePostRemixModal(): Pick<
  GlobalModalsContextValue,
  'closePostRemixModal' | 'openPostRemixModal'
> {
  const context = use(GlobalModalsContext);
  if (!context) {
    throw new Error(
      'usePostRemixModal must be used within GlobalModalsProvider',
    );
  }
  return {
    closePostRemixModal: context.closePostRemixModal,
    openPostRemixModal: context.openPostRemixModal,
  };
}

export interface GlobalModalsProviderProps {
  children: ReactNode;
}

export function GlobalModalsProvider({
  children,
}: GlobalModalsProviderProps): ReactNode {
  const state = useGlobalModalsState();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname ?? ''}?${searchParams?.toString() ?? ''}`;

  useRouteModalGlobalSideEffectCleanup(routeKey);

  useEffect(() => {
    if (state.hasOpenGlobalModal) {
      return;
    }

    return scheduleModalGlobalSideEffectCleanup();
  }, [state.hasOpenGlobalModal]);

  const contextValue: GlobalModalsContextValue = {
    closeBrandOverlay: state.closeBrandOverlay,
    closeConfirm: state.closeConfirm,
    closeCredentialModal: state.closeCredentialModal,
    closeExport: state.closeExport,
    closeGallery: state.closeGallery,
    closeGenerateIllustration: state.closeGenerateIllustration,
    closeIngredientOverlay: state.closeIngredientOverlay,
    closeMetadataModal: state.closeMetadataModal,
    closePostMetadataOverlay: state.closePostMetadataOverlay,
    closePostRemixModal: state.closePostRemixModal,
    closePromptModal: state.closePromptModal,
    closeUpload: state.closeUpload,
    handlePostClose: state.handlePostClose,
    openBrandOverlay: state.openBrandOverlay,
    openConfirm: state.openConfirm,
    openCredentialModal: state.openCredentialModal,
    openExport: state.openExport,
    openGallery: state.openGallery,
    openGenerateIllustration: state.openGenerateIllustration,
    openIngredientOverlay: state.openIngredientOverlay,
    openMetadataModal: state.openMetadataModal,
    openPostBatchModal: state.openPostBatchModal,
    openPostMetadataOverlay: state.openPostMetadataOverlay,
    openPostRemixModal: state.openPostRemixModal,
    openPromptModal: state.openPromptModal,
    openUpload: state.openUpload,
    publishIngredient: state.publishIngredient,
  };

  return (
    <GlobalModalsContext.Provider value={contextValue}>
      {children}
      <GlobalModalsRenderer {...state} />
    </GlobalModalsContext.Provider>
  );
}
