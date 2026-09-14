'use client';
import type { UsePostModalOptions } from '@genfeedai/contracts/interfaces/hooks/use-publication-modal.interface';
import { capitalize } from '@genfeedai/helpers/formatting/format/format.helper';
import type {
  GlobalModalConfirmDeleteConfig,
  GlobalModalsContextValue,
  GlobalModalsProviderProps,
  GlobalModalUploadConfig,
} from '@genfeedai/props/modals/global-modals.props';

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

export type {
  GlobalModalsContextValue,
  GlobalModalsProviderProps,
} from '@genfeedai/props/modals/global-modals.props';

const GlobalModalsContext = createContext<GlobalModalsContextValue | null>(
  null,
);

export function usePostModal(
  options: UsePostModalOptions = {},
): Pick<
  GlobalModalsContextValue,
  'handlePostClose' | 'openPostBatchModal' | 'publishIngredient'
> {
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
  options: Pick<GlobalModalUploadConfig, 'onComplete'> = {},
) {
  const context = use(GlobalModalsContext);
  if (!context) {
    throw new Error('useUploadModal must be used within GlobalModalsProvider');
  }

  const openUpload = useCallback(
    (config: GlobalModalUploadConfig) => {
      context.openUpload({
        ...config,
        onComplete: config.onComplete || options.onComplete,
      });
    },
    [context, options.onComplete],
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
    (config: GlobalModalConfirmDeleteConfig) => {
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

export function usePostRepurposeModal(): Pick<
  GlobalModalsContextValue,
  'closePostRepurposeModal' | 'openPostRepurposeModal'
> {
  const context = use(GlobalModalsContext);
  if (!context) {
    throw new Error(
      'usePostRepurposeModal must be used within GlobalModalsProvider',
    );
  }
  return {
    closePostRepurposeModal: context.closePostRepurposeModal,
    openPostRepurposeModal: context.openPostRepurposeModal,
  };
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
    closePostRepurposeModal: state.closePostRepurposeModal,
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
    openPostRepurposeModal: state.openPostRepurposeModal,
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
