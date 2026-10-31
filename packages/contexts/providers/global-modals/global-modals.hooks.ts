'use client';

import type { UsePostModalOptions } from '@genfeedai/contracts/interfaces/hooks/use-publication-modal.interface';
import { capitalize } from '@genfeedai/helpers/formatting/format/format.helper';
import type {
  GlobalModalConfirmDeleteConfig,
  GlobalModalsContextValue,
  GlobalModalUploadConfig,
} from '@genfeedai/props/modals/global-modals.props';
import { use, useCallback } from 'react';
import { GlobalModalsContext } from './global-modals.context';

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

export function useBrandCreateModal(): Pick<
  GlobalModalsContextValue,
  'closeBrandCreateModal' | 'openBrandCreateModal'
> {
  const context = use(GlobalModalsContext);
  if (!context) {
    throw new Error(
      'useBrandCreateModal must be used within GlobalModalsProvider',
    );
  }
  return {
    closeBrandCreateModal: context.closeBrandCreateModal,
    openBrandCreateModal: context.openBrandCreateModal,
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
