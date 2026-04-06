'use client';

import { useUser } from '@clerk/nextjs';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  type IngredientCategory,
  ModalEnum,
  type Platform,
  type SubscriptionTier,
} from '@genfeedai/enums';
import type {
  IAsset,
  IBrand,
  ICredential,
  IImage,
  IIngredient,
  IMusic,
  IPost,
} from '@genfeedai/interfaces';
import type { UsePostModalOptions } from '@genfeedai/interfaces/hooks/use-publication-modal.interface';
import { capitalize } from '@helpers/formatting/format/format.helper';
import { closeModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { Brand } from '@models/organization/brand.model';
import type {
  ModalConfirmProps,
  ModalExportProps,
  ModalMetadataProps,
  ModalPromptProps,
} from '@props/modals/modal.props';
import { logger } from '@services/core/logger.service';
import { UsersService } from '@services/organization/users.service';
import {
  LazyBrandOverlay,
  LazyIngredientOverlay,
  LazyModalConfirm,
  LazyModalCredential,
  LazyModalExport,
  LazyModalGallery,
  LazyModalGenerateIllustration,
  LazyModalMetadata,
  LazyModalPost,
  LazyModalPostBatch,
  LazyModalPostRemix,
  LazyModalPrompt,
  LazyModalUpload,
  LazyPostMetadataOverlay,
} from '@ui/lazy/modal/LazyModal';
import { ModalUpgradePrompt } from '@ui/modals';
import { useRouter } from 'next/navigation';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useState,
} from 'react';

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
  const context = useContext(GlobalModalsContext);
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
  const context = useContext(GlobalModalsContext);
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
  const context = useContext(GlobalModalsContext);
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
  const context = useContext(GlobalModalsContext);
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
  const context = useContext(GlobalModalsContext);
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
  const context = useContext(GlobalModalsContext);
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
  const context = useContext(GlobalModalsContext);
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
  const context = useContext(GlobalModalsContext);
  if (!context) {
    throw new Error('usePromptModal must be used within GlobalModalsProvider');
  }
  return {
    closePromptModal: context.closePromptModal,
    openPromptModal: context.openPromptModal,
  };
}

export function useConfirmDeleteModal() {
  const context = useContext(GlobalModalsContext);
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
  const context = useContext(GlobalModalsContext);
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
  const context = useContext(GlobalModalsContext);
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
  const context = useContext(GlobalModalsContext);
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
  const context = useContext(GlobalModalsContext);
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
  const context = useContext(GlobalModalsContext);
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
  const { credentials, refreshBrands, settings } = useBrand();
  const { user } = useUser();
  const router = useRouter();
  const { href } = useOrgUrl();

  const getUsersService = useAuthedService((token: string) =>
    UsersService.getInstance(token),
  );

  // Memoized callbacks for LazyModalPost to prevent infinite re-renders
  const handlePostConfirm = useCallback(() => {}, []);
  const handlePostCreated = useCallback(
    (postId: string) => {
      closeModal(ModalEnum.POST);
      router.push(href(`/posts/${postId}`));
    },
    [router],
  );

  const [publishIngredients, setPublishIngredients] = useState<IIngredient[]>(
    [],
  );
  const [openTrigger, setOpenTrigger] = useState(0);

  const [confirmQueue, setConfirmQueue] = useState<
    Array<{
      id: string;
      label?: string;
      message?: string;
      confirmLabel?: string;
      cancelLabel?: string;
      isError?: boolean;
      onConfirm: () => void | Promise<void>;
    }>
  >([]);

  const [uploadConfig, setUploadConfig] = useState<{
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
  } | null>(null);
  const [uploadTrigger, setUploadTrigger] = useState(0);

  const [galleryConfig, setGalleryConfig] = useState<{
    isOpen: boolean;
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
  } | null>(null);

  const [ingredientOverlayData, setIngredientOverlayData] = useState<{
    ingredient: IIngredient | null;
    onConfirm?: () => void;
  } | null>(null);
  const [ingredientOverlayTrigger, setIngredientOverlayTrigger] = useState(0);

  const [exportConfig, setExportConfig] = useState<ModalExportProps | null>(
    null,
  );

  const [credentialData, setCredentialData] = useState<{
    credential: ICredential | null;
    onConfirm: () => void;
  } | null>(null);
  const [credentialTrigger, setCredentialTrigger] = useState(0);

  const [promptConfig, setPromptConfig] = useState<{
    originalPrompt?: string;
    enhancedPrompt?: string;
    style?: string;
    mood?: string;
    camera?: string;
    onConfirm: (prompt: string) => void;
  } | null>(null);

  const [metadataConfig, setMetadataConfig] =
    useState<ModalMetadataProps | null>(null);

  const [brandOverlayData, setBrandOverlayData] = useState<{
    brand: IBrand | Brand | null;
    onConfirm?: () => void;
    initialView?: 'edit' | 'overview';
  } | null>(null);
  const [brandOverlayTrigger, setBrandOverlayTrigger] = useState(0);

  const [postMetadataOverlayData, setPostMetadataOverlayData] = useState<{
    post: IPost | null;
    onConfirm?: () => void;
  } | null>(null);

  const [generateIllustrationConfig, setGenerateIllustrationConfig] = useState<{
    postId: string;
    initialPrompt?: string;
    platform?: Platform;
    onConfirm: (imageId: string) => void;
  } | null>(null);
  const [generateIllustrationTrigger, setGenerateIllustrationTrigger] =
    useState(0);

  const [postRemixData, setPostRemixData] = useState<{
    post: IPost;
    onSubmit: (description: string, label?: string) => Promise<void>;
  } | null>(null);
  const [postRemixTrigger, setPostRemixTrigger] = useState(0);

  const publishIngredient = publishIngredients[0] ?? null;

  const openPostBatchModal = useCallback(
    (ingredient: IIngredient | IIngredient[]) => {
      setPublishIngredients(
        Array.isArray(ingredient) ? ingredient.filter(Boolean) : [ingredient],
      );
      setOpenTrigger((prev) => prev + 1);
    },
    [],
  );

  const closePublishModal = useCallback(() => {
    setPublishIngredients([]);
    window.dispatchEvent(new CustomEvent('refresh-ingredients'));
  }, []);

  const openConfirm = useCallback(
    (
      config: Omit<ModalConfirmProps, 'onConfirm'> & {
        onConfirm: () => void | Promise<void>;
      },
    ) => {
      const id = `confirm-${Date.now()}-${Math.random()}`;
      setConfirmQueue((prev) => [...prev, { ...config, id }]);
    },
    [],
  );

  const closeConfirm = useCallback(() => {
    setConfirmQueue((prev) => {
      const newQueue = prev.slice(1);
      if (newQueue.length === 0) {
        closeModal(ModalEnum.CONFIRM);
      }
      return newQueue;
    });
  }, []);

  const currentConfirm = confirmQueue[0];

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
      setUploadConfig(config);
      setUploadTrigger((prev) => prev + 1);
    },
    [],
  );

  const closeUpload = useCallback(() => {
    setUploadConfig(null);
  }, []);

  const openGallery = useCallback(
    (config: {
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
    }) => {
      setGalleryConfig({ ...config, isOpen: true });
    },
    [],
  );

  const closeGallery = useCallback(() => {
    setGalleryConfig(null);
    closeModal(ModalEnum.GALLERY);
  }, []);

  const openIngredientOverlay = useCallback(
    (ingredient: IIngredient | null, onConfirm?: () => void) => {
      setIngredientOverlayData({ ingredient, onConfirm });
      setIngredientOverlayTrigger((prev) => prev + 1);
    },
    [],
  );

  const closeIngredientOverlay = useCallback(() => {
    setIngredientOverlayData(null);
  }, []);

  const openExport = useCallback((config: ModalExportProps) => {
    setExportConfig(config);
  }, []);

  const closeExport = useCallback(() => {
    setExportConfig(null);
    closeModal(ModalEnum.EXPORT);
  }, []);

  const openCredentialModal = useCallback(
    (credential: ICredential | null, onConfirm: () => void) => {
      setCredentialData({ credential, onConfirm });
      setCredentialTrigger((prev) => prev + 1);
    },
    [],
  );

  const closeCredentialModal = useCallback(() => {
    setCredentialData(null);
  }, []);

  const openPromptModal = useCallback(
    (
      config: Omit<ModalPromptProps, 'onConfirm'> & {
        onConfirm: (prompt: string) => void;
      },
    ) => {
      setPromptConfig(config);
    },
    [],
  );

  const closePromptModal = useCallback(() => {
    setPromptConfig(null);
    closeModal(ModalEnum.PROMPT);
  }, []);

  const openMetadataModal = useCallback((config: ModalMetadataProps) => {
    setMetadataConfig(config);
  }, []);

  const closeMetadataModal = useCallback(() => {
    setMetadataConfig(null);
    closeModal(ModalEnum.METADATA);
  }, []);

  const openBrandOverlay = useCallback(
    (
      brand: IBrand | Brand | null,
      onConfirm?: () => void,
      initialView: 'edit' | 'overview' = 'edit',
    ) => {
      setBrandOverlayData({ brand, initialView, onConfirm });
      setBrandOverlayTrigger((prev) => prev + 1);
    },
    [],
  );

  const closeBrandOverlay = useCallback(() => {
    setBrandOverlayData(null);
  }, []);

  const openPostMetadataOverlay = useCallback(
    (post: IPost, onConfirm?: () => void) => {
      setPostMetadataOverlayData({ onConfirm, post });
    },
    [],
  );

  const closePostMetadataOverlay = useCallback(() => {
    setPostMetadataOverlayData(null);
    closeModal(ModalEnum.POST_METADATA);
  }, []);

  const openGenerateIllustration = useCallback(
    (config: {
      postId: string;
      initialPrompt?: string;
      platform?: Platform;
      onConfirm: (imageId: string) => void;
    }) => {
      setGenerateIllustrationConfig(config);
      setGenerateIllustrationTrigger((prev) => prev + 1);
    },
    [],
  );

  const closeGenerateIllustration = useCallback(() => {
    setGenerateIllustrationConfig(null);
    closeModal(ModalEnum.GENERATE_ILLUSTRATION);
  }, []);

  const openPostRemixModal = useCallback(
    (
      post: IPost,
      onSubmit: (description: string, label?: string) => Promise<void>,
    ) => {
      setPostRemixData({ onSubmit, post });
      setPostRemixTrigger((prev) => prev + 1);
    },
    [],
  );

  const closePostRemixModal = useCallback(() => {
    setPostRemixData(null);
    closeModal(ModalEnum.POST_REMIX);
  }, []);

  const contextValue: GlobalModalsContextValue = {
    closeBrandOverlay,
    closeConfirm,
    closeCredentialModal,
    closeExport,
    closeGallery,
    closeGenerateIllustration,
    closeIngredientOverlay,
    closeMetadataModal,
    closePostMetadataOverlay,
    closePostRemixModal,
    closePromptModal,
    closeUpload,
    handlePostClose: closePublishModal,
    openBrandOverlay,
    openConfirm,
    openCredentialModal,
    openExport,
    openGallery,
    openGenerateIllustration,
    openIngredientOverlay,
    openMetadataModal,
    openPostBatchModal,
    openPostMetadataOverlay,
    openPostRemixModal,
    openPromptModal,
    openUpload,
    publishIngredient,
  };

  return (
    <GlobalModalsContext.Provider value={contextValue}>
      {children}

      <LazyModalPost
        credentials={credentials}
        onConfirm={handlePostConfirm}
        onCreated={handlePostCreated}
      />

      <LazyModalPostBatch
        key={openTrigger}
        ingredient={publishIngredient || undefined}
        ingredients={
          publishIngredients.length > 1 ? publishIngredients : undefined
        }
        credentials={credentials}
        onConfirm={closePublishModal}
        isOpen={publishIngredients.length > 0}
        openKey={openTrigger}
      />

      {currentConfirm && (
        <LazyModalConfirm
          key={currentConfirm.id}
          label={currentConfirm.label}
          message={currentConfirm.message}
          confirmLabel={currentConfirm.confirmLabel}
          cancelLabel={currentConfirm.cancelLabel}
          isError={currentConfirm.isError}
          isOpen={Boolean(currentConfirm)}
          openKey={currentConfirm.id}
          onClose={closeConfirm}
          onConfirm={async () => {
            await currentConfirm.onConfirm();
            closeConfirm();
          }}
        />
      )}

      {uploadConfig && (
        <LazyModalUpload
          key={uploadTrigger}
          isOpen={Boolean(uploadConfig)}
          openKey={uploadTrigger}
          category={uploadConfig.category}
          parentId={uploadConfig.parentId}
          parentModel={uploadConfig.parentModel}
          width={uploadConfig.width}
          height={uploadConfig.height}
          isResizeEnabled={uploadConfig.isResizeEnabled}
          isMultiple={uploadConfig.isMultiple}
          maxFiles={uploadConfig.maxFiles}
          initialFiles={uploadConfig.initialFiles}
          autoSubmit={uploadConfig.autoSubmit}
          onConfirm={(ingredient?: IIngredient | IAsset) => {
            uploadConfig.onConfirm?.(ingredient);
            closeUpload();
          }}
          onComplete={(ingredients) => {
            uploadConfig.onComplete?.(ingredients);
          }}
        />
      )}

      {galleryConfig && (
        <LazyModalGallery
          isOpen={galleryConfig.isOpen}
          category={galleryConfig.category}
          title={galleryConfig.title}
          selectedId={galleryConfig.selectedId}
          format={galleryConfig.format}
          isNoneAllowed={galleryConfig.isNoneAllowed}
          maxSelectableItems={galleryConfig.maxSelectableItems}
          accountReference={galleryConfig.accountReference}
          onSelectAccountReference={galleryConfig.onSelectAccountReference}
          selectedReferences={galleryConfig.selectedReferences}
          onClose={closeGallery}
          onSelect={(
            item: IAsset | IImage | IMusic | (IAsset | IImage)[] | null,
          ) => {
            galleryConfig.onSelect(
              item as GallerySelectItem | GallerySelectItem[] | null,
            );
            closeGallery();
          }}
        />
      )}

      {ingredientOverlayData?.ingredient && (
        <LazyIngredientOverlay
          key={ingredientOverlayTrigger}
          isOpen={Boolean(ingredientOverlayData.ingredient)}
          openKey={ingredientOverlayTrigger}
          ingredient={ingredientOverlayData.ingredient}
          onConfirm={() => {
            ingredientOverlayData.onConfirm?.();
          }}
          onClose={closeIngredientOverlay}
        />
      )}

      {exportConfig && (
        <LazyModalExport
          isOpen={Boolean(exportConfig)}
          onExport={(format, fields) => {
            exportConfig.onExport(format, fields);
            closeExport();
          }}
        />
      )}

      {credentialData && (
        <LazyModalCredential
          key={credentialTrigger}
          isOpen={Boolean(credentialData)}
          openKey={credentialTrigger}
          credential={credentialData.credential}
          onConfirm={() => {
            credentialData.onConfirm();
            closeCredentialModal();
          }}
        />
      )}

      {promptConfig && (
        <LazyModalPrompt
          isOpen={Boolean(promptConfig)}
          originalPrompt={promptConfig.originalPrompt}
          enhancedPrompt={promptConfig.enhancedPrompt}
          style={promptConfig.style}
          mood={promptConfig.mood}
          camera={promptConfig.camera}
          onUsePrompt={(promptData) => {
            promptConfig.onConfirm(promptData.text);
            closePromptModal();
          }}
        />
      )}

      {metadataConfig && (
        <LazyModalMetadata
          isOpen={Boolean(metadataConfig)}
          ingredientId={metadataConfig.ingredientId}
          ingredientCategory={metadataConfig.ingredientCategory}
          metadata={metadataConfig.metadata}
          scope={metadataConfig.scope}
          folder={metadataConfig.folder}
          onConfirm={metadataConfig.onConfirm}
        />
      )}

      {brandOverlayData && (
        <LazyBrandOverlay
          key={brandOverlayTrigger}
          isOpen={Boolean(brandOverlayData)}
          openKey={brandOverlayTrigger}
          brand={brandOverlayData.brand}
          initialView={brandOverlayData.initialView}
          onConfirm={async (_isRefreshing, createdBrandId) => {
            if (createdBrandId) {
              // Select the newly created brand
              try {
                const service = await getUsersService();
                await service.patchMeBrand(createdBrandId, {
                  isSelected: true,
                });

                logger.info(`Selected newly created brand: ${createdBrandId}`);

                // Reload user data to update selected brand in Clerk
                await user?.reload();

                // Refresh brands list to include the new brand
                await refreshBrands();
              } catch (error) {
                logger.error('Failed to select newly created brand', error);
                // Still reload user and refresh brands even if selection fails
                await user?.reload();
                await refreshBrands();
              }
            } else {
              // Just reload user data and refresh brands list (for updates)
              await user?.reload();
              await refreshBrands();
            }

            // Call custom onConfirm if provided
            brandOverlayData.onConfirm?.();
          }}
          onClose={closeBrandOverlay}
        />
      )}

      {postMetadataOverlayData?.post && (
        <LazyPostMetadataOverlay
          post={postMetadataOverlayData.post}
          onConfirm={() => {
            postMetadataOverlayData.onConfirm?.();
            closePostMetadataOverlay();
          }}
          onClose={closePostMetadataOverlay}
        />
      )}

      {generateIllustrationConfig && (
        <LazyModalGenerateIllustration
          key={generateIllustrationTrigger}
          isOpen={Boolean(generateIllustrationConfig)}
          openKey={generateIllustrationTrigger}
          postId={generateIllustrationConfig.postId}
          initialPrompt={generateIllustrationConfig.initialPrompt}
          platform={generateIllustrationConfig.platform}
          onConfirm={(imageId) => {
            generateIllustrationConfig.onConfirm(imageId);
            closeGenerateIllustration();
          }}
          onClose={closeGenerateIllustration}
        />
      )}

      <ModalUpgradePrompt
        currentTier={settings?.subscriptionTier as SubscriptionTier | undefined}
      />

      {postRemixData && (
        <LazyModalPostRemix
          key={postRemixTrigger}
          isOpen={Boolean(postRemixData)}
          openKey={postRemixTrigger}
          post={postRemixData.post}
          onSubmit={async (description, label) => {
            await postRemixData.onSubmit(description, label);
            closePostRemixModal();
          }}
          onClose={closePostRemixModal}
        />
      )}
    </GlobalModalsContext.Provider>
  );
}
