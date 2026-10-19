'use client';

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import {
  ModalEnum,
  type Platform,
  type PostRepurposeMode,
} from '@genfeedai/contracts';
import type { IIngredient, IPost } from '@genfeedai/contracts/interfaces';
import { closeModal } from '@genfeedai/helpers/ui/modal/modal.helper';
import { useAuthUser } from '@genfeedai/hooks/auth/use-auth-user/use-auth-user';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import type {
  GlobalModalGalleryConfig,
  GlobalModalIllustrationConfig,
  GlobalModalUploadConfig,
} from '@genfeedai/props/modals/global-modals.props';
import type {
  ModalConfirmProps,
  ModalExportProps,
  ModalMetadataProps,
  ModalPromptProps,
} from '@genfeedai/props/modals/modal.props';
import type { PostRepurposeSource } from '@genfeedai/props/modals/modal-post-repurpose.props';
import { logger } from '@genfeedai/services/core/logger.service';
import { UsersService } from '@genfeedai/services/organization/users.service';
import { type ReactNode, useCallback, useState } from 'react';

export function useGlobalModalsState() {
  const { credentials, refreshBrands, settings } = useBrand();
  const { user } = useAuthUser();

  const getUsersService = useAuthedService((token: string) =>
    UsersService.getInstance(token),
  );

  const [publishIngredients, setPublishIngredients] = useState<IIngredient[]>(
    [],
  );
  const [openTrigger, setOpenTrigger] = useState(0);

  const [confirmQueue, setConfirmQueue] = useState<
    Array<{
      children?: ReactNode;
      id: string;
      label?: string;
      message?: string;
      confirmLabel?: string;
      cancelLabel?: string;
      isError?: boolean;
      onConfirm: () => void | Promise<void>;
    }>
  >([]);

  const [uploadConfig, setUploadConfig] =
    useState<GlobalModalUploadConfig | null>(null);
  const [uploadTrigger, setUploadTrigger] = useState(0);

  const [galleryConfig, setGalleryConfig] = useState<
    (GlobalModalGalleryConfig & { isOpen: boolean }) | null
  >(null);

  const [exportConfig, setExportConfig] = useState<ModalExportProps | null>(
    null,
  );

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

  const [brandCreateData, setBrandCreateData] = useState<{
    onConfirm?: () => void;
  } | null>(null);
  const [brandCreateTrigger, setBrandCreateTrigger] = useState(0);

  const [generateIllustrationConfig, setGenerateIllustrationConfig] =
    useState<GlobalModalIllustrationConfig | null>(null);
  const [generateIllustrationTrigger, setGenerateIllustrationTrigger] =
    useState(0);

  const [postRemixData, setPostRemixData] = useState<{
    post: IPost;
    onSubmit: (description: string, label?: string) => Promise<void>;
  } | null>(null);
  const [postRemixTrigger, setPostRemixTrigger] = useState(0);

  const [postRepurposeData, setPostRepurposeData] = useState<{
    source: PostRepurposeSource;
    onSubmit: (platform: Platform, mode: PostRepurposeMode) => Promise<void>;
  } | null>(null);
  const [postRepurposeTrigger, setPostRepurposeTrigger] = useState(0);

  const publishIngredient = publishIngredients[0] ?? null;
  const hasOpenGlobalModal =
    publishIngredients.length > 0 ||
    confirmQueue.length > 0 ||
    uploadConfig != null ||
    galleryConfig != null ||
    exportConfig != null ||
    promptConfig != null ||
    metadataConfig != null ||
    brandCreateData != null ||
    generateIllustrationConfig != null ||
    postRemixData != null ||
    postRepurposeData != null;

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

  const openUpload = useCallback((config: GlobalModalUploadConfig) => {
    setUploadConfig(config);
    setUploadTrigger((prev) => prev + 1);
  }, []);

  const closeUpload = useCallback(() => {
    setUploadConfig(null);
  }, []);

  const openGallery = useCallback((config: GlobalModalGalleryConfig) => {
    setGalleryConfig({ ...config, isOpen: true });
  }, []);

  const closeGallery = useCallback(() => {
    setGalleryConfig(null);
    closeModal(ModalEnum.GALLERY);
  }, []);

  const openExport = useCallback((config: ModalExportProps) => {
    setExportConfig(config);
  }, []);

  const closeExport = useCallback(() => {
    setExportConfig(null);
    closeModal(ModalEnum.EXPORT);
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

  const openBrandCreateModal = useCallback((onConfirm?: () => void) => {
    setBrandCreateData({ onConfirm });
    setBrandCreateTrigger((prev) => prev + 1);
  }, []);

  const closeBrandCreateModal = useCallback(() => {
    setBrandCreateData(null);
  }, []);

  const openGenerateIllustration = useCallback(
    (config: GlobalModalIllustrationConfig) => {
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

  const openPostRepurposeModal = useCallback(
    (
      source: PostRepurposeSource,
      onSubmit: (platform: Platform, mode: PostRepurposeMode) => Promise<void>,
    ) => {
      setPostRepurposeData({ onSubmit, source });
      setPostRepurposeTrigger((prev) => prev + 1);
    },
    [],
  );

  const closePostRepurposeModal = useCallback(() => {
    setPostRepurposeData(null);
    closeModal(ModalEnum.POST_REPURPOSE);
  }, []);

  const handleBrandCreateConfirm = useCallback(
    async (createdBrandId?: string) => {
      if (createdBrandId) {
        try {
          const service = await getUsersService();
          await service.patchMeBrand(createdBrandId);

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

      brandCreateData?.onConfirm?.();
    },
    [getUsersService, user, refreshBrands, brandCreateData],
  );

  return {
    // context value fields
    closeBrandCreateModal,
    closeConfirm,
    closeExport,
    closeGallery,
    closeGenerateIllustration,
    closeMetadataModal,
    closePostRemixModal,
    closePostRepurposeModal,
    closePromptModal,
    closeUpload,
    handlePostClose: closePublishModal,
    openBrandCreateModal,
    openConfirm,
    openExport,
    openGallery,
    openGenerateIllustration,
    openMetadataModal,
    openPostBatchModal,
    openPostRemixModal,
    openPostRepurposeModal,
    openPromptModal,
    openUpload,
    publishIngredient,
    // renderer-specific data
    brandCreateData,
    brandCreateTrigger,
    closePublishModal,
    credentials,
    currentConfirm,
    exportConfig,
    galleryConfig,
    generateIllustrationConfig,
    generateIllustrationTrigger,
    handleBrandCreateConfirm,
    hasOpenGlobalModal,
    metadataConfig,
    openTrigger,
    postRemixData,
    postRemixTrigger,
    postRepurposeData,
    postRepurposeTrigger,
    promptConfig,
    publishIngredients,
    settings,
    uploadConfig,
    uploadTrigger,
  };
}
