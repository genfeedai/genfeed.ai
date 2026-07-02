'use client';

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import {
  type IngredientCategory,
  ModalEnum,
  type Platform,
} from '@genfeedai/enums';
import { closeModal } from '@genfeedai/helpers/ui/modal/modal.helper';
import { useAuthUser } from '@genfeedai/hooks/auth/use-auth-user/use-auth-user';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@genfeedai/hooks/navigation/use-org-url';
import type {
  IAsset,
  IBrand,
  ICredential,
  IIngredient,
  IPost,
} from '@genfeedai/interfaces';
import type { Brand } from '@genfeedai/models/organization/brand.model';
import type {
  ModalConfirmProps,
  ModalExportProps,
  ModalMetadataProps,
  ModalPromptProps,
} from '@genfeedai/props/modals/modal.props';
import { logger } from '@genfeedai/services/core/logger.service';
import { UsersService } from '@genfeedai/services/organization/users.service';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import type { GallerySelectItem } from './global-modals.provider';

export function useGlobalModalsState() {
  const { credentials, refreshBrands, settings } = useBrand();
  const { user } = useAuthUser();
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
    [router, href],
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
  const hasOpenGlobalModal =
    publishIngredients.length > 0 ||
    confirmQueue.length > 0 ||
    uploadConfig != null ||
    galleryConfig != null ||
    ingredientOverlayData?.ingredient != null ||
    exportConfig != null ||
    credentialData != null ||
    promptConfig != null ||
    metadataConfig != null ||
    brandOverlayData != null ||
    postMetadataOverlayData?.post != null ||
    generateIllustrationConfig != null ||
    postRemixData != null;

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

  const handleBrandOverlayConfirm = useCallback(
    async (_isRefreshing?: boolean, createdBrandId?: string) => {
      if (createdBrandId) {
        try {
          const service = await getUsersService();
          await service.patchMeBrand(createdBrandId, {
            isSelected: true,
          });

          logger.info(`Selected newly created brand: ${createdBrandId}`);

          await user?.reload();
          await refreshBrands();
        } catch (error) {
          logger.error('Failed to select newly created brand', error);
          await user?.reload();
          await refreshBrands();
        }
      } else {
        await user?.reload();
        await refreshBrands();
      }

      brandOverlayData?.onConfirm?.();
    },
    [getUsersService, user, refreshBrands, brandOverlayData],
  );

  return {
    // context value fields
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
    // renderer-specific data
    brandOverlayData,
    brandOverlayTrigger,
    closePublishModal,
    credentials,
    credentialData,
    credentialTrigger,
    currentConfirm,
    exportConfig,
    galleryConfig,
    generateIllustrationConfig,
    generateIllustrationTrigger,
    handleBrandOverlayConfirm,
    handlePostConfirm,
    handlePostCreated,
    hasOpenGlobalModal,
    ingredientOverlayData,
    ingredientOverlayTrigger,
    metadataConfig,
    openTrigger,
    postMetadataOverlayData,
    postRemixData,
    postRemixTrigger,
    promptConfig,
    publishIngredients,
    settings,
    uploadConfig,
    uploadTrigger,
  };
}
