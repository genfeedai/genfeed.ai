'use client';

import {
  useConfirmModal,
  useUploadModal,
} from '@genfeedai/contexts/providers/global-modals/global-modals.hooks';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import {
  AssetCategory,
  IngredientCategory,
  IngredientStatus,
  ModalEnum,
} from '@genfeedai/contracts';
import {
  BRAND_HANDLE_FORMAT_MESSAGE,
  createBrandAppRoute,
  isValidBrandHandle,
  normalizeBrandHandle,
} from '@genfeedai/contracts/constants';
import type {
  IArticle,
  IBrand,
  IImage,
  ILink,
  IVideo,
} from '@genfeedai/contracts/interfaces';
import type { UseBrandDetailReturn } from '@genfeedai/props/pages/brand-detail.props';
import { AssetsService } from '@genfeedai/services/content/assets.service';
import { ClipboardService } from '@genfeedai/services/core/clipboard.service';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { PublicService } from '@genfeedai/services/external/public.service';
import { BrandsService } from '@genfeedai/services/social/brands.service';
import { ErrorHandler } from '@genfeedai/utils/error/error-handler.util';
import { buildLatestBrandArticlesQuery } from '@helpers/content/latest-brand-articles-query.helper';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useRouteParams } from '@hooks/navigation/use-route-params';
import { useSocketManager } from '@hooks/utils/use-socket-manager/use-socket-manager';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  buildSocialConnections,
  getAccountConnectionStatus,
} from '@ui/modals/brands/brand/ModalBrand.types';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSaveQueue } from '@/hooks/utils/use-save-queue/use-save-queue';

const BRAND_SETTINGS_PATH_PATTERN = /\/~\/settings\/brands\/[^/]+(\/.*)?$/;
const SETTINGS_PATH_PATTERN = /\/settings(\/.*)?$/;
const BRAND_ID_PATH_PATTERN = /\/brands\/([^/]+)/;
const BRAND_PATH_SEGMENT_PATTERN = /\/brands\/[^/]+/;

/** The brand as the settings pages show it: the record plus its links. */
interface BrandDetailData {
  brand: IBrand;
  links: ILink[];
}

interface BrandLatestMedia {
  articles: IArticle[];
  images: IImage[];
  videos: IVideo[];
}

const EMPTY_LINKS: ILink[] = [];
const EMPTY_LATEST_MEDIA: BrandLatestMedia = {
  articles: [],
  images: [],
  videos: [],
};

function brandDetailQueryKey(brandSlug: string) {
  return ['brand-detail', brandSlug] as const;
}

export function useBrandDetail(): UseBrandDetailReturn {
  const params = useRouteParams();
  const pathname = usePathname();
  const router = useRouter();
  const { brands, refreshBrands } = useBrand();

  const notificationsService = NotificationsService.getInstance();
  const publicService = PublicService.getInstance();
  const clipboardService = ClipboardService.getInstance();

  const { openConfirm } = useConfirmModal();
  const { openUpload } = useUploadModal();
  const { subscribe } = useSocketManager();
  const getBrandsService = useAuthedService((token: string) =>
    BrandsService.getInstance(token),
  );

  const getAssetsService = useAuthedService((token: string) =>
    AssetsService.getInstance(token),
  );

  const brandParam = params?.slug ?? params?.brandSlug;
  const routeBrandParam = Array.isArray(brandParam)
    ? brandParam[0]
    : (brandParam ?? '');
  const matchedRouteBrand = useMemo(
    () =>
      brands.find(
        (brand) =>
          brand.slug === routeBrandParam || brand.id === routeBrandParam,
      ),
    [brands, routeBrandParam],
  );
  const brandSlug = matchedRouteBrand?.slug ?? routeBrandParam;
  const hasBrandId = Boolean(brandSlug);

  const queryClient = useQueryClient();
  const brandQuery = useAuthedQuery<BrandsService, BrandDetailData>({
    enabled: hasBrandId,
    // An identity that settles after an OAuth redirect re-keys the read; the
    // loaded brand stays on screen while it does.
    keepPreviousDataWithin: brandDetailQueryKey(brandSlug),
    queryFn: async (service) => {
      const url = `GET /brands/slug?slug=${brandSlug}`;
      try {
        const brandResponse = await service.findOneBySlug(brandSlug);
        logger.info(`${url} success`, brandResponse);
        return { brand: brandResponse, links: brandResponse.links || [] };
      } catch (error) {
        logger.error(`${url} failed`, error);
        throw error;
      }
    },
    queryKey: brandDetailQueryKey(brandSlug),
    service: (token: string) => BrandsService.getInstance(token),
  });
  const { refetch: refetchBrand } = brandQuery;
  const brandData = brandQuery.data ?? null;
  const brand = brandData?.brand ?? null;
  const links = brandData?.links ?? EMPTY_LINKS;
  const brandId = brand?.id ?? '';
  const [selectedLink, setSelectedLink] = useState<ILink | null>(null);

  // Queued saves run after the render that enqueued them, so they read the
  // brand from this ref rather than from a stale closure.
  const brandStateRef = useRef<{ brand: IBrand | null; links: ILink[] }>({
    brand: null,
    links: [],
  });
  if (brandData && brandStateRef.current.brand !== brandData.brand) {
    brandStateRef.current = brandData;
  }

  const applyBrand = useCallback(
    (nextBrand: IBrand, nextLinks: ILink[]) => {
      brandStateRef.current = { brand: nextBrand, links: nextLinks };
      queryClient.setQueriesData<BrandDetailData>(
        { queryKey: brandDetailQueryKey(brandSlug) },
        () => ({ brand: nextBrand, links: nextLinks }),
      );
    },
    [brandSlug, queryClient],
  );

  const { enqueueSave, isSaving: isUpdating } = useSaveQueue();

  // Only a brand with nothing cached yet shows the skeleton; a return visit
  // paints the cached brand and refreshes it in the background.
  const isLoading = !hasBrandId || brandQuery.isPending;
  const [isGeneratingBanner, setIsGeneratingBanner] = useState(false);
  const [isGeneratingLogo, setIsGeneratingLogo] = useState(false);
  const [deletingRefId, setDeletingRefId] = useState<string | null>(null);
  const [generateModalType, setGenerateModalType] = useState<
    'banner' | 'logo' | null
  >(null);

  useEffect(() => {
    const orgSlug = typeof params?.orgSlug === 'string' ? params.orgSlug : '';

    if (!orgSlug || !matchedRouteBrand?.slug || !pathname || !routeBrandParam) {
      return;
    }

    const oldRouteMatch = pathname.match(BRAND_SETTINGS_PATH_PATTERN);
    const canonicalRouteMatch = pathname.match(SETTINGS_PATH_PATTERN);
    const suffix = oldRouteMatch?.[1] ?? canonicalRouteMatch?.[1] ?? '';
    const canonicalPath = createBrandAppRoute(
      orgSlug,
      matchedRouteBrand.slug,
      `/settings${suffix}`,
    );
    const usesIdAsSlug = matchedRouteBrand.id === routeBrandParam;

    if ((oldRouteMatch || usesIdAsSlug) && pathname !== canonicalPath) {
      router.replace(canonicalPath);
    }
  }, [matchedRouteBrand, params?.orgSlug, pathname, routeBrandParam, router]);

  const latestMediaQuery = useQuery<BrandLatestMedia>({
    enabled: Boolean(brandId),
    queryFn: async () => {
      const mediaQuery = {
        brand: brandId,
        limit: 3,
        sort: 'createdAt: -1',
      };
      const articleQuery = buildLatestBrandArticlesQuery(brandId);

      const [videosResult, imagesResult, articlesResult] =
        await Promise.allSettled([
          publicService.findPublicVideos({
            ...mediaQuery,
            category: IngredientCategory.VIDEO,
            status: [IngredientStatus.GENERATED, IngredientStatus.VALIDATED],
          }),
          publicService.findPublicImages({
            ...mediaQuery,
            category: IngredientCategory.IMAGE,
            status: [IngredientStatus.GENERATED, IngredientStatus.VALIDATED],
          }),
          publicService.findPublicArticles(articleQuery),
        ]);

      let videos: IVideo[] = [];
      let images: IImage[] = [];
      let articles: IArticle[] = [];

      if (videosResult.status === 'fulfilled') {
        logger.info(`GET /public/videos success`, videosResult.value);
        videos = videosResult.value;
      } else {
        logger.error(`GET /public/videos failed`, videosResult.reason);
      }

      if (imagesResult.status === 'fulfilled') {
        logger.info(`GET /public/images success`, imagesResult.value);
        images = imagesResult.value;
      } else {
        logger.error(`GET /public/images failed`, imagesResult.reason);
      }

      if (articlesResult.status === 'fulfilled') {
        logger.info(`GET /public/articles success`, articlesResult.value);
        articles = articlesResult.value;
      } else {
        logger.error(`GET /public/articles failed`, articlesResult.reason);
      }

      return { articles, images, videos };
    },
    queryKey: ['brand-detail-media', brandId],
  });
  const latestMedia = latestMediaQuery.data ?? EMPTY_LATEST_MEDIA;

  // A refresh keeps the loaded brand on screen; overlapping refreshes are
  // ordered by React Query, so only the latest answer is kept.
  const findOneBrand = useCallback(async () => {
    if (hasBrandId) {
      await refetchBrand();
    }
  }, [hasBrandId, refetchBrand]);

  const handleOpenUploadModal = useCallback(
    (category: AssetCategory) => {
      if (!brand?.id) {
        return;
      }

      openUpload({
        category,
        onComplete: () => {
          findOneBrand();
        },
        parentId: brand.id,
        parentModel: 'Brand',
      });
    },
    [brand?.id, findOneBrand, openUpload],
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
          setDeletingRefId(assetId);
          const url = `DELETE /assets/${assetId}`;

          try {
            const service = await getAssetsService();
            await service.delete(assetId);
            await findOneBrand();
          } catch (error) {
            logger.error(`${url} failed`, error);
            notificationsService.error('Failed to delete branding reference');
          } finally {
            setDeletingRefId(null);
          }
        },
      });
    },
    [findOneBrand, getAssetsService, openConfirm, notificationsService],
  );

  const handleCopy = async (text?: string) => {
    if (!text) {
      return;
    }
    await clipboardService.copyToClipboard(text);
  };

  const handleLinkConfirm = useCallback(() => {
    setSelectedLink(null);
    findOneBrand();
  }, [findOneBrand]);

  const handleUpdateAccount = useCallback(
    (field: string, value: boolean | string): Promise<void> => {
      if (!brand) {
        return Promise.resolve();
      }

      return enqueueSave(async () => {
        const previousBrand = brandStateRef.current.brand;
        const previousLinks = brandStateRef.current.links;

        if (!previousBrand) {
          return;
        }

        const url = `PATCH /brands/${previousBrand.id}`;

        // Optimistic: flip public-profile switch immediately (scope is the field).
        if (field === 'scope') {
          applyBrand(
            { ...previousBrand, [field]: value } as IBrand,
            previousLinks,
          );
        }

        try {
          const service = await getBrandsService();
          const updateData: Record<string, boolean | string> = {};
          updateData[field] = value;

          const updatedAccount = (await service.patch(
            previousBrand.id,
            updateData,
          )) as IBrand;

          logger.info(`${url} success`, updatedAccount);
          applyBrand(updatedAccount, updatedAccount.links || previousLinks);
        } catch (error) {
          const { message, status, validationErrors } =
            ErrorHandler.extractErrorDetails(error);
          const isValidationError =
            message === 'Validation failed' ||
            Boolean(validationErrors?.length);
          const isUnexpectedError = status === undefined || status >= 500;
          logger.error(`${url} failed`, {
            error,
            reportToSentry: false,
            tags: { surface: 'brand-settings' },
          });
          notificationsService.error(
            isValidationError
              ? 'Some brand settings are invalid. Review them and try again.'
              : isUnexpectedError
                ? 'Brand settings could not be saved. Please try again.'
                : message,
          );
          applyBrand(previousBrand, previousLinks);
          // Rethrow so inline editors revert their draft instead of treating a
          // failed save as success.
          throw error;
        }
      });
    },
    [brand, applyBrand, enqueueSave, getBrandsService, notificationsService],
  );

  // The handle is the `[brandSlug]` route segment, so a saved rename moves the
  // page to the new URL; the brand list refresh keeps the switcher in step.
  const handleUpdateHandle = useCallback(
    async (value: string): Promise<void> => {
      const handle = normalizeBrandHandle(value);
      if (!brand || handle === brand.slug) {
        return;
      }

      if (!isValidBrandHandle(handle)) {
        notificationsService.error(BRAND_HANDLE_FORMAT_MESSAGE);
        throw new Error(BRAND_HANDLE_FORMAT_MESSAGE);
      }

      await handleUpdateAccount('slug', handle);

      const orgSlug = typeof params?.orgSlug === 'string' ? params.orgSlug : '';
      if (orgSlug && pathname && routeBrandParam) {
        const currentPrefix = createBrandAppRoute(orgSlug, routeBrandParam);
        const suffix = pathname.startsWith(currentPrefix)
          ? pathname.slice(currentPrefix.length)
          : '/settings';
        router.replace(createBrandAppRoute(orgSlug, handle, suffix));
      }

      await refreshBrands();
    },
    [
      handleUpdateAccount,
      notificationsService,
      params?.orgSlug,
      pathname,
      refreshBrands,
      routeBrandParam,
      router,
      brand,
    ],
  );

  const handleGenerateBanner = useCallback(() => {
    if (!brand) {
      return;
    }
    setGenerateModalType('banner');
    openModal(ModalEnum.BRAND_GENERATE);
  }, [brand]);

  const handleGenerateLogo = useCallback(() => {
    if (!brand) {
      return;
    }
    setGenerateModalType('logo');
    openModal(ModalEnum.BRAND_GENERATE);
  }, [brand]);

  const selectLink = useCallback((link: ILink | null) => {
    setSelectedLink(link);
  }, []);

  useEffect(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const isCurrentlyDashboard = origin.startsWith(EnvironmentService.apps.app);

    if (isCurrentlyDashboard || !brandId) {
      return;
    }
    if (!pathname) {
      return;
    }

    const match = pathname.match(BRAND_ID_PATH_PATTERN);
    if (match && match[1] !== brandId) {
      const newPath = pathname.replace(
        BRAND_PATH_SEGMENT_PATTERN,
        `/brands/${brandId}`,
      );
      router.replace(newPath);
    }
  }, [brandId, pathname, router]);

  useEffect(() => {
    const unsubscribe = subscribe(
      'asset-status',
      (data: {
        assetId: string;
        status: string;
        metadata?: { category?: string; parentId?: string };
      }) => {
        const { status, metadata } = data;

        // Generation runs on a webhook after the request returns, so the page
        // follows any logo or banner of this brand rather than a tracked id.
        if (!brandId || metadata?.parentId !== brandId) {
          return;
        }

        const isBanner = metadata?.category === AssetCategory.BANNER;
        setIsGeneratingBanner(false);
        setIsGeneratingLogo(false);

        if (status === 'completed') {
          notificationsService.success(
            `${isBanner ? 'Banner' : 'Logo'} generated successfully`,
          );
          findOneBrand();
        } else if (status === 'failed') {
          notificationsService.error(
            `${isBanner ? 'Banner' : 'Logo'} generation failed. Your current ${
              isBanner ? 'banner' : 'logo'
            } was kept.`,
          );
        }
      },
    );

    return () => {
      unsubscribe();
    };
  }, [brandId, findOneBrand, notificationsService, subscribe]);

  // Delegates to the same helper the settings/accounts accounts table
  // and ModalBrand use, so a disconnected-but-not-deleted or identity-less
  // credential shows "Needs reconnect" consistently everywhere instead of
  // silently disappearing from just this hook's consumers. Depends on the
  // credentials array specifically (not the whole brand object) so this
  // doesn't get a new identity on every brand refresh that leaves
  // credentials untouched.
  // biome-ignore lint/correctness/useExhaustiveDependencies: buildSocialConnections only reads brand.credentials — depending on the whole brand object would give this a new identity on every refresh that leaves credentials untouched.
  const socialConnections = useMemo(
    () => buildSocialConnections(brand),
    [brand?.credentials],
  );

  // Counts rows that are actually connected — not a raw `isConnected`
  // tally, which still counts an identity-less or expired credential as
  // connected even though its own row reads "Needs reconnect".
  const connectedPlatformsCount = useMemo(
    () =>
      socialConnections.filter(
        (connection) => getAccountConnectionStatus(connection) === 'connected',
      ).length,
    [socialConnections],
  );

  return {
    articles: latestMedia.articles,
    brand,
    brandId,
    connectedPlatformsCount,
    deletingRefId,
    generateModalType,
    handleCopy,
    handleGenerateBanner,
    handleGenerateLogo,
    handleLinkConfirm,
    handleOpenUploadModal,
    handleRefreshBrand: findOneBrand,
    handleRequestDeleteReference,
    handleUpdateAccount,
    handleUpdateHandle,
    hasBrandId,
    images: latestMedia.images,
    isGeneratingBanner,
    isGeneratingLogo,
    isLoading,
    isUpdating,
    links,
    selectedLink,
    selectLink,
    setGenerateModalType,
    socialConnections,
    videos: latestMedia.videos,
  };
}
