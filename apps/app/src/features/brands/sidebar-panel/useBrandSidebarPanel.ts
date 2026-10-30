'use client';

import {
  useConfirmModal,
  useUploadModal,
} from '@genfeedai/contexts/providers/global-modals/global-modals.provider';
import { type AssetCategory, ModalEnum } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { IBrand, ILink } from '@genfeedai/contracts/interfaces';
import { openModal } from '@genfeedai/helpers/ui/modal/modal.helper';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import { useElements } from '@genfeedai/hooks/data/elements/use-elements/use-elements';
import { Brand } from '@genfeedai/models/organization/brand.model';
import type { BrandSidebarPanelProps } from '@genfeedai/props/ui/brands/brand-sidebar.props';
import { AssetsService } from '@genfeedai/services/content/assets.service';
import { ClipboardService } from '@genfeedai/services/core/clipboard.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { BrandsService } from '@genfeedai/services/social/brands.service';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type BrandOverlayRecord,
  buildSocialConnections,
  getAccountConnectionStatus,
} from '@ui/modals/brands/brand/ModalBrand.types';
import { useCallback, useMemo, useState } from 'react';

export type UseBrandSidebarPanelReturn = {
  activeBrand: BrandOverlayRecord | null;
  connectedPlatformsCount: number;
  error: string | null;
  generateCost: number;
  generateModalType: 'banner' | 'logo' | null;
  isLoadingBrand: boolean;
  selectedLink: ILink | null;
  socialConnections: ReturnType<typeof buildSocialConnections>;
  handleCopy: (text?: string) => Promise<void>;
  handleGenerateBanner: () => void;
  handleGenerateConfirm: () => Promise<void>;
  handleGenerateLogo: () => void;
  handleLinkConfirm: () => Promise<void>;
  handleOpenLinkModal: (link?: ILink) => void;
  handleOpenUploadModal: (category: AssetCategory) => void;
  handleRefresh: () => Promise<void>;
  handleRequestDeleteReference: (assetId: string) => void;
  handleUpdateBrandField: (
    field: string,
    value: boolean | string,
  ) => Promise<void>;
};

/**
 * Loads one brand for the right-sidebar overview and owns its in-place edits
 * (public profile, name and description, references, links, banner and logo).
 */
export function useBrandSidebarPanel({
  brand,
  onChange,
}: BrandSidebarPanelProps): UseBrandSidebarPanelReturn {
  const brandId = brand.id;
  const clipboardService = ClipboardService.getInstance();
  const queryClient = useQueryClient();
  const { openConfirm } = useConfirmModal();
  const { openUpload } = useUploadModal();
  const { imageModels } = useElements();

  const getBrandsService = useAuthedService((token: string) =>
    BrandsService.getInstance(token),
  );
  const getAssetsService = useAuthedService((token: string) =>
    AssetsService.getInstance(token),
  );

  const [error, setError] = useState<string | null>(null);
  const [selectedLink, setSelectedLink] = useState<ILink | null>(null);
  const [generateModalType, setGenerateModalType] = useState<
    'banner' | 'logo' | null
  >(null);

  const queryKey = useMemo(() => ['brand-sidebar', brandId], [brandId]);

  const rowBrand = useMemo(
    () => new Brand(brand as Partial<IBrand>) as BrandOverlayRecord,
    [brand],
  );

  const {
    data: loadedBrand,
    isLoading: isLoadingBrand,
    refetch,
  } = useQuery({
    queryFn: async () => {
      const service = await getBrandsService();
      return (await service.findOne(brandId)) as BrandOverlayRecord;
    },
    queryKey,
  });

  const activeBrand: BrandOverlayRecord | null = loadedBrand ?? rowBrand;

  const handleRefresh = useCallback(async () => {
    await refetch();
    onChange?.();
  }, [onChange, refetch]);

  const handleCopy = useCallback(
    async (text?: string) => {
      if (!text) {
        return;
      }

      await clipboardService.copyToClipboard(text);
    },
    [clipboardService],
  );

  const handleOpenUploadModal = useCallback(
    (category: AssetCategory) => {
      openUpload({
        category,
        onComplete: () => {
          void handleRefresh();
        },
        parentId: brandId,
        parentModel: 'Brand',
      });
    },
    [brandId, handleRefresh, openUpload],
  );

  const handleUpdateBrandField = useCallback(
    async (field: string, value: boolean | string) => {
      try {
        const service = await getBrandsService();
        const updatedBrand = await service.patch(brandId, { [field]: value });
        queryClient.setQueryData(queryKey, updatedBrand as BrandOverlayRecord);
        setError(null);
        onChange?.();
      } catch (updateError) {
        logger.error('Failed to update brand field', updateError);
        setError('Failed to update brand field');
      }
    },
    [brandId, getBrandsService, onChange, queryClient, queryKey],
  );

  const handleRequestDeleteReference = useCallback(
    (assetId: string) => {
      openConfirm({
        cancelLabel: 'Cancel',
        confirmLabel: 'Delete',
        isError: true,
        label: 'Delete Branding Reference',
        message: 'Are you sure you want to delete this branding reference?',
        onConfirm: async () => {
          try {
            const service = await getAssetsService();
            await service.delete(assetId);
            await handleRefresh();
          } catch (deleteError) {
            logger.error('Failed to delete branding reference', deleteError);
            setError('Failed to delete branding reference');
          }
        },
      });
    },
    [getAssetsService, handleRefresh, openConfirm],
  );

  // Links are edited through the shared `ModalBrandLink` dialog, the same path
  // the Social settings page uses. This hook only tracks which link is edited.
  const handleOpenLinkModal = useCallback((link?: ILink) => {
    setSelectedLink(link ?? null);
    openModal(ModalEnum.BRAND_LINK);
  }, []);

  const handleLinkConfirm = useCallback(async () => {
    setSelectedLink(null);
    await handleRefresh();
  }, [handleRefresh]);

  const handleGenerateBanner = useCallback(() => {
    setGenerateModalType('banner');
    openModal(ModalEnum.BRAND_GENERATE);
  }, []);

  const handleGenerateLogo = useCallback(() => {
    setGenerateModalType('logo');
    openModal(ModalEnum.BRAND_GENERATE);
  }, []);

  const handleGenerateConfirm = useCallback(async () => {
    setGenerateModalType(null);
    await handleRefresh();
  }, [handleRefresh]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: buildSocialConnections only reads activeBrand.credentials; depending on the whole brand would rebuild on every refresh that leaves credentials untouched.
  const socialConnections = useMemo(
    () => buildSocialConnections(activeBrand),
    [activeBrand?.credentials],
  );

  // Counts rows that are actually connected, not a raw `isConnected` tally,
  // which still counts an identity-less or expired credential as connected.
  const connectedPlatformsCount = useMemo(
    () =>
      socialConnections.filter(
        (connection) => getAccountConnectionStatus(connection) === 'connected',
      ).length,
    [socialConnections],
  );

  const generateCost = useMemo(() => {
    const modelToUse =
      activeBrand?.defaultImageModel ||
      MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4_FAST;
    const model = imageModels.find(
      (imageModel) => imageModel.key === modelToUse,
    );
    return model?.cost || 5;
  }, [activeBrand?.defaultImageModel, imageModels]);

  return {
    activeBrand,
    connectedPlatformsCount,
    error,
    generateCost,
    generateModalType,
    handleCopy,
    handleGenerateBanner,
    handleGenerateConfirm,
    handleGenerateLogo,
    handleLinkConfirm,
    handleOpenLinkModal,
    handleOpenUploadModal,
    handleRefresh,
    handleRequestDeleteReference,
    handleUpdateBrandField,
    isLoadingBrand,
    selectedLink,
    socialConnections,
  };
}
