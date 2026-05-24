'use client';

import {
  useConfirmModal,
  useUploadModal,
} from '@genfeedai/contexts/providers/global-modals/global-modals.provider';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import {
  ArticleStatus,
  AssetCategory,
  AssetParent,
  CredentialPlatform,
  IngredientCategory,
  IngredientStatus,
  ModalEnum,
} from '@genfeedai/enums';
import type {
  IArticle,
  IBrand,
  ICredential,
  IImage,
  ILink,
  IVideo,
} from '@genfeedai/interfaces';
import type { UseBrandDetailReturn } from '@genfeedai/props/pages/brand-detail.props';
import { AssetsService } from '@genfeedai/services/content/assets.service';
import { ClipboardService } from '@genfeedai/services/core/clipboard.service';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { PublicService } from '@genfeedai/services/external/public.service';
import { BrandsService } from '@genfeedai/services/social/brands.service';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useSocketManager } from '@hooks/utils/use-socket-manager/use-socket-manager';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';

interface BrandMediaState {
  brand: IBrand | null;
  videos: IVideo[];
  images: IImage[];
  articles: IArticle[];
  links: ILink[];
  selectedLink: ILink | null;
}

type BrandMediaAction =
  | { type: 'SET_BRAND'; brand: IBrand; links: ILink[] }
  | {
      type: 'SET_MEDIA';
      videos: IVideo[];
      images: IImage[];
      articles: IArticle[];
    }
  | { type: 'SELECT_LINK'; link: ILink | null }
  | { type: 'RESET' };

const initialBrandMediaState: BrandMediaState = {
  articles: [],
  brand: null,
  images: [],
  links: [],
  selectedLink: null,
  videos: [],
};

function brandMediaReducer(
  state: BrandMediaState,
  action: BrandMediaAction,
): BrandMediaState {
  switch (action.type) {
    case 'SET_BRAND':
      return { ...state, brand: action.brand, links: action.links };
    case 'SET_MEDIA':
      return {
        ...state,
        articles: action.articles,
        images: action.images,
        videos: action.videos,
      };
    case 'SELECT_LINK':
      return { ...state, selectedLink: action.link };
    case 'RESET':
      return initialBrandMediaState;
  }
}

export function useBrandDetail(): UseBrandDetailReturn {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const { brands } = useBrand();

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

  const [state, dispatch] = useReducer(
    brandMediaReducer,
    initialBrandMediaState,
  );

  const brandId = state.brand?.id ?? '';

  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isGeneratingBanner, setIsGeneratingBanner] = useState(false);
  const [isGeneratingLogo, setIsGeneratingLogo] = useState(false);
  const [pendingAssetId, setPendingAssetId] = useState<string | null>(null);
  const [deletingRefId, setDeletingRefId] = useState<string | null>(null);
  const [generateModalType, setGenerateModalType] = useState<
    'banner' | 'logo' | null
  >(null);

  useEffect(() => {
    const orgSlug = typeof params?.orgSlug === 'string' ? params.orgSlug : '';

    if (!orgSlug || !matchedRouteBrand?.slug || !pathname || !routeBrandParam) {
      return;
    }

    const oldRouteMatch = pathname.match(
      /\/~\/settings\/brands\/[^/]+(\/.*)?$/,
    );
    const canonicalRouteMatch = pathname.match(/\/settings(\/.*)?$/);
    const suffix = oldRouteMatch?.[1] ?? canonicalRouteMatch?.[1] ?? '';
    const canonicalPath = `/${orgSlug}/${matchedRouteBrand.slug}/settings${suffix}`;
    const usesIdAsSlug = matchedRouteBrand.id === routeBrandParam;

    if ((oldRouteMatch || usesIdAsSlug) && pathname !== canonicalPath) {
      router.replace(canonicalPath);
    }
  }, [matchedRouteBrand, params?.orgSlug, pathname, routeBrandParam, router]);

  const findLatestMedia = useCallback(async () => {
    if (!state.brand?.id) {
      return;
    }

    const mediaQuery = {
      brand: state.brand.id,
      limit: 3,
      sort: 'createdAt: -1',
    };
    const articleQuery = {
      brand: state.brand.id,
      limit: 3,
      sortBy: 'createdAt',
      sortOrder: 'desc' as const,
      status: [ArticleStatus.PUBLIC],
    };

    try {
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

      let newVideos: IVideo[] = [];
      let newImages: IImage[] = [];
      let newArticles: IArticle[] = [];

      if (videosResult.status === 'fulfilled') {
        logger.info(`GET /public/videos success`, videosResult.value);
        newVideos = videosResult.value as unknown as IVideo[];
      } else {
        logger.error(`GET /public/videos failed`, videosResult.reason);
      }

      if (imagesResult.status === 'fulfilled') {
        logger.info(`GET /public/images success`, imagesResult.value);
        newImages = imagesResult.value as unknown as IImage[];
      } else {
        logger.error(`GET /public/images failed`, imagesResult.reason);
      }

      if (articlesResult.status === 'fulfilled') {
        logger.info(`GET /public/articles success`, articlesResult.value);
        newArticles = articlesResult.value as unknown as IArticle[];
      } else {
        logger.error(`GET /public/articles failed`, articlesResult.reason);
      }

      dispatch({
        articles: newArticles,
        images: newImages,
        type: 'SET_MEDIA',
        videos: newVideos,
      });
    } catch (error) {
      logger.error(`GET /public/media failed`, error);
      dispatch({ articles: [], images: [], type: 'SET_MEDIA', videos: [] });
    }
  }, [state.brand?.id, publicService]);

  const findOneBrand = useCallback(
    async (isRefreshing = false) => {
      if (!brandSlug) {
        return;
      }

      setIsLoading(!isRefreshing);
      const url = `GET /brands/slug?slug=${brandSlug}`;

      try {
        const service = await getBrandsService();
        const brandResponse = await service.findOneBySlug(brandSlug);

        logger.info(`${url} success`, brandResponse);

        dispatch({
          brand: brandResponse,
          links: brandResponse.links || [],
          type: 'SET_BRAND',
        });
        setIsLoading(false);
      } catch (error) {
        logger.error(`${url} failed`, error);
        setIsLoading(false);
      }
    },
    [brandSlug, getBrandsService],
  );

  const handleOpenUploadModal = useCallback(
    (category: AssetCategory) => {
      if (!state.brand?.id) {
        return;
      }

      openUpload({
        category,
        onConfirm: () => {
          findOneBrand(true);
        },
        parentId: state.brand.id,
        parentModel: 'Brand',
      });
    },
    [state.brand?.id, findOneBrand, openUpload],
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
            await findOneBrand(true);
          } catch (error) {
            logger.error(`${url} failed`, error);
            notificationsService.error(`${url} failed`);
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
    dispatch({ link: null, type: 'SELECT_LINK' });
    findOneBrand(true);
  }, [findOneBrand]);

  const handleUpdateAccount = useCallback(
    async (field: string, value: boolean | string) => {
      if (!state.brand || isUpdating) {
        return;
      }

      const url = `PATCH /brands/${state.brand.id}`;
      setIsUpdating(true);

      try {
        const service = await getBrandsService();
        const updateData: Record<string, boolean | string> = {};
        updateData[field] = value;

        const updatedAccount = await service.patch(state.brand.id, updateData);

        logger.info(`${url} success`, updatedAccount);
        dispatch({
          brand: updatedAccount as IBrand,
          links: (updatedAccount as IBrand).links || state.links,
          type: 'SET_BRAND',
        });
      } catch (error) {
        logger.error(`${url} failed`, error);
        notificationsService.error(`${url} failed`);
      } finally {
        setIsUpdating(false);
      }
    },
    [
      state.brand,
      state.links,
      getBrandsService,
      isUpdating,
      notificationsService,
    ],
  );

  const _confirmGenerateAsset = useCallback(
    async (type: 'banner' | 'logo', modelKey: string) => {
      if (!state.brand) {
        return;
      }

      const isBanner = type === 'banner';
      if (isBanner) {
        setIsGeneratingBanner(true);
      } else {
        setIsGeneratingLogo(true);
      }

      try {
        const assetsService = await getAssetsService();
        const response = await assetsService.postGenerate({
          category: isBanner ? AssetCategory.BANNER : AssetCategory.LOGO,
          model: modelKey,
          parent: state.brand.id,
          parentModel: AssetParent.BRAND,
          text: state.brand.label,
        });

        if (response?.id) {
          setPendingAssetId(response.id);
        }
      } catch (error) {
        logger.error('Failed to generate asset', error);
        notificationsService.error('Failed to generate asset');
        setIsGeneratingBanner(false);
        setIsGeneratingLogo(false);
        setPendingAssetId(null);
      }
    },
    [state.brand, getAssetsService, notificationsService],
  );

  const handleGenerateBanner = useCallback(() => {
    if (!state.brand) {
      return;
    }
    setGenerateModalType('banner');
    openModal(ModalEnum.BRAND_GENERATE);
  }, [state.brand]);

  const handleGenerateLogo = useCallback(() => {
    if (!state.brand) {
      return;
    }
    setGenerateModalType('logo');
    openModal(ModalEnum.BRAND_GENERATE);
  }, [state.brand]);

  const selectLink = useCallback((link: ILink | null) => {
    dispatch({ link, type: 'SELECT_LINK' });
  }, []);

  useEffect(() => {
    if (hasBrandId) {
      findOneBrand();
    }
  }, [findOneBrand, hasBrandId]);

  useEffect(() => {
    if (state.brand?.id) {
      findLatestMedia();
    }
  }, [state.brand?.id, findLatestMedia]);

  useEffect(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const isCurrentlyDashboard = origin.startsWith(EnvironmentService.apps.app);

    if (isCurrentlyDashboard || !brandId) {
      return;
    }
    if (!pathname) {
      return;
    }

    const match = pathname.match(/\/brands\/([^/]+)/);
    if (match && match[1] !== brandId) {
      const newPath = pathname.replace(/\/brands\/[^/]+/, `/brands/${brandId}`);
      router.replace(newPath);
    }
  }, [brandId, pathname, router]);

  useEffect(() => {
    const unsubscribe = subscribe(
      'asset-status',
      (data: {
        assetId: string;
        status: string;
        metadata?: { category?: string };
      }) => {
        const { assetId, status, metadata } = data;

        logger.info('Asset status websocket event received', {
          assetId,
          metadata,
          pendingAssetId,
          status,
        });

        if (!pendingAssetId) {
          return;
        }
        if (String(assetId) !== String(pendingAssetId)) {
          return;
        }

        logger.info('Processing asset status update', {
          assetId,
          category: metadata?.category,
          status,
        });

        if (status === 'completed') {
          const isBanner = metadata?.category === AssetCategory.BANNER;
          setIsGeneratingBanner(false);
          setIsGeneratingLogo(false);
          setPendingAssetId(null);

          notificationsService.success(
            `${isBanner ? 'Banner' : 'Logo'} generated successfully`,
          );

          if (brandId) {
            findOneBrand(true);
          }
        } else if (status === 'failed') {
          setIsGeneratingBanner(false);
          setIsGeneratingLogo(false);
          setPendingAssetId(null);

          notificationsService.error('Failed to generate asset');
        }
      },
    );

    return () => {
      unsubscribe();
    };
  }, [brandId, findOneBrand, notificationsService, pendingAssetId, subscribe]);

  const socialConnections = useMemo(() => {
    const connections: UseBrandDetailReturn['socialConnections'] = [];

    const isPlatformConnected = (platform: CredentialPlatform): boolean =>
      !!state.brand?.credentials?.some(
        (cred: ICredential) =>
          cred.platform === platform && cred.isConnected === true,
      );

    if (
      isPlatformConnected(CredentialPlatform.YOUTUBE) &&
      state.brand?.youtubeUrl
    ) {
      connections.push({
        handle: state.brand.youtubeHandle,
        platform: CredentialPlatform.YOUTUBE,
        url: state.brand.youtubeUrl,
      });
    }

    if (
      isPlatformConnected(CredentialPlatform.TIKTOK) &&
      state.brand?.tiktokUrl
    ) {
      connections.push({
        handle: state.brand.tiktokHandle,
        platform: CredentialPlatform.TIKTOK,
        url: state.brand.tiktokUrl,
      });
    }

    if (
      isPlatformConnected(CredentialPlatform.INSTAGRAM) &&
      state.brand?.instagramUrl
    ) {
      connections.push({
        handle: state.brand.instagramHandle,
        platform: CredentialPlatform.INSTAGRAM,
        url: state.brand.instagramUrl,
      });
    }

    if (
      isPlatformConnected(CredentialPlatform.TWITTER) &&
      state.brand?.twitterUrl
    ) {
      connections.push({
        handle: state.brand.twitterHandle,
        platform: CredentialPlatform.TWITTER,
        url: state.brand.twitterUrl,
      });
    }

    return connections;
  }, [
    state.brand?.credentials,
    state.brand?.instagramHandle,
    state.brand?.instagramUrl,
    state.brand?.tiktokHandle,
    state.brand?.tiktokUrl,
    state.brand?.twitterHandle,
    state.brand?.twitterUrl,
    state.brand?.youtubeHandle,
    state.brand?.youtubeUrl,
  ]);

  const connectedPlatformsCount = useMemo(
    () =>
      state.brand?.credentials?.filter(
        (cred: ICredential) => cred.isConnected === true,
      ).length || 0,
    [state.brand?.credentials],
  );

  return {
    articles: state.articles,
    brand: state.brand,
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
    hasBrandId,
    images: state.images,
    isGeneratingBanner,
    isGeneratingLogo,
    isLoading,
    links: state.links,
    selectedLink: state.selectedLink,
    selectLink,
    setGenerateModalType,
    socialConnections,
    videos: state.videos,
  };
}
