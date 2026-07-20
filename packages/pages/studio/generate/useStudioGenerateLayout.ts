import { useAssetSelection } from '@contexts/ui/asset-selection.context';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import type { PromptTextareaSchema } from '@genfeedai/client/schemas';
import {
  IngredientCategory,
  IngredientFormat,
  ModelCategory,
} from '@genfeedai/enums';
import type {
  IFolder,
  IImage,
  IIngredient,
  IModel,
  IQueryParams,
} from '@genfeedai/interfaces';
import type { AvatarVoiceData } from '@genfeedai/interfaces/studio/studio-generate.interface';
import { formatVideos } from '@helpers/data/data/data.helper';
import { resolveIngredientAspectRatio } from '@helpers/formatting/aspect-ratio/aspect-ratio.util';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useElements } from '@hooks/data/elements/use-elements/use-elements';
import { useMusicPlayback } from '@hooks/media/use-music-playback/use-music-playback';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import {
  useAssetActions,
  useAssetLoading,
  useFilters,
  usePromptState,
  useSocketGeneration,
  useStoryboardGeneration,
  useTableActions,
  useTableColumns,
  useTableSelection,
  useViewMode,
} from '@pages/studio/generate/hooks';
import {
  buildAvatarVoiceOption,
  buildGenerateLabel,
  computeGenerationEstimateLabel,
  isImageOrVideoCategory,
  resolveAvatarPreviewUrl,
  resolveStoryboardFormat,
} from '@pages/studio/generate/utils';
import type { StudioGeneratePageProps } from '@props/studio/studio.props';
import { usePostModal } from '@providers/global-modals/global-modals.provider';
import { FoldersService } from '@services/content/folders.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { AvatarsService } from '@services/ingredients/avatars.service';
import { ImagesService } from '@services/ingredients/images.service';
import { VoicesService } from '@services/ingredients/voices.service';
import { useQuery } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export function useStudioGenerateLayout({
  defaultCategoryType,
  onCategoryChange,
}: StudioGeneratePageProps) {
  const { brandId, isReady } = useBrand();
  const prevAccountIdRef = useRef<string>(brandId);
  const pathname = usePathname();
  const router = useRouter();
  const { href } = useOrgUrl();

  const searchParams = useSearchParams();
  const searchParamsString = searchParams?.toString() ?? '';
  const parsedSearchParams = useMemo(
    () => new URLSearchParams(searchParamsString),
    [searchParamsString],
  );
  const viewParam = parsedSearchParams.get('view');

  const [categoryType, setCategoryType] = useState<IngredientCategory>(
    defaultCategoryType ?? IngredientCategory.VIDEO,
  );
  const [scrollFocusedAssetId, setScrollFocusedAssetId] = useState<
    string | null
  >(null);

  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );

  useEffect(() => {
    setCategoryType(defaultCategoryType ?? IngredientCategory.VIDEO);
  }, [defaultCategoryType]);

  // Services
  const getImagesService = useAuthedService((token: string) =>
    ImagesService.getInstance(token),
  );

  const getAvatarsService = useAuthedService((token: string) =>
    AvatarsService.getInstance(token),
  );

  const getVoicesService = useAuthedService((token: string) =>
    VoicesService.getInstance(token),
  );

  const getFoldersService = useAuthedService((token: string) =>
    FoldersService.getInstance(token),
  );

  // Asset selection context
  const {
    selectedIngredient,
    setSelectedAsset,
    setGeneratedAssetId,
    activeGenerations,
    clearAll,
  } = useAssetSelection();

  const selectedIngredientIds = useMemo(
    () => (selectedIngredient?.id ? [selectedIngredient.id] : []),
    [selectedIngredient],
  );

  // Elements from backend
  const {
    moods,
    styles,
    cameras,
    fontFamilies,
    presets,
    videoModels,
    imageModels,
    musicModels,
    tags,
    blacklists,
    sounds,
    scenes,
    trainings,
    isLoading: isModelCatalogLoading,
  } = useElements();

  // Initial format
  const formatParam = parsedSearchParams.get('format');
  const initialFormat = useMemo((): IngredientFormat | '' => {
    if (!isImageOrVideoCategory(categoryType)) {
      return '';
    }

    if (formatParam) {
      const formatValue = formatParam.toLowerCase() as IngredientFormat;
      if (Object.values(IngredientFormat).includes(formatValue)) {
        return formatValue;
      }
    }
    return IngredientFormat.PORTRAIT;
  }, [categoryType, formatParam]);

  const initialGalleryFormat = useMemo((): IngredientFormat | '' => {
    if (!isImageOrVideoCategory(categoryType) || !formatParam) {
      return '';
    }

    const formatValue = formatParam.toLowerCase() as IngredientFormat;
    return Object.values(IngredientFormat).includes(formatValue)
      ? formatValue
      : '';
  }, [categoryType, formatParam]);

  // Check for URL config
  const hasPromptConfigInUrl = useMemo(
    () =>
      parsedSearchParams.has('text') ||
      parsedSearchParams.has('referenceImageId'),
    [parsedSearchParams],
  );

  // Prompt state management
  const {
    promptText,
    setPromptText,
    promptConfig,
    setPromptConfig,
    promptDataRef,
  } = usePromptState({
    categoryType,
    hasPromptConfigInUrl,
    initialFormat,
    parsedSearchParams,
  });

  // Music playback
  const [allAssets, setAllAssets] = useState<IIngredient[]>([]);
  const {
    handlePlay: handleMusicPlay,
    stopAll: stopAllMusic,
    syncPlaybackState,
  } = useMusicPlayback({ setAssets: setAllAssets });

  // Filters
  const { filters, setFilters, filtersRef, handleFiltersChange } = useFilters({
    categoryType,
    initialFormat: initialGalleryFormat,
    setAllAssets,
    setCurrentPage: () => {},
    setLoadedPages: () => {},
  });

  // Asset loading
  const {
    allAssets: loadedAssets,
    isLoading,
    isLoadingMore,
    isRefreshing,
    hasMore,
    initialLoadComplete,
    currentPage,
    findAllAssets,
    handleLoadMore,
    handleRefresh,
    resetPaginationState,
  } = useAssetLoading({
    brandId,
    categoryType,
    filtersRef,
    isReady,
    stopAllMusic,
    syncPlaybackState,
  });

  // Sync assets from loading hook
  useEffect(() => {
    setAllAssets(loadedAssets);
  }, [loadedAssets]);

  useEffect(() => {
    if (!isReady || !brandId) {
      return;
    }

    stopAllMusic();
    resetPaginationState();
    void findAllAssets(1, false);
  }, [brandId, findAllAssets, isReady, resetPaginationState, stopAllMusic]);

  useEffect(() => {
    const nextGeneratedAssetId = activeGenerations[0]?.id ?? null;
    if (!nextGeneratedAssetId) {
      return;
    }

    setScrollFocusedAssetId(nextGeneratedAssetId);
    const timeoutId = window.setTimeout(() => {
      setScrollFocusedAssetId((current) =>
        current === nextGeneratedAssetId ? null : current,
      );
    }, 2_000);

    return () => window.clearTimeout(timeoutId);
  }, [activeGenerations]);

  // View mode
  const { viewMode, supportsMasonry, handleViewModeChange } = useViewMode({
    categoryType,
    searchParamsString,
    viewParam,
  });

  // Current models based on category
  const currentModels = useMemo(() => {
    const modelsMap: Partial<Record<IngredientCategory, IModel[]>> = {
      [IngredientCategory.VIDEO]: videoModels,
      [IngredientCategory.IMAGE]: imageModels,
      [IngredientCategory.MUSIC]: musicModels,
    };
    return modelsMap[categoryType] ?? [];
  }, [categoryType, videoModels, imageModels, musicModels]);

  // Socket generation
  const { handleGenerateSubmit, isGenerationCooldown } = useSocketGeneration({
    brandId,
    categoryType,
    currentModels,
    findAllAssets,
    setGeneratedAssetId,
  });

  const {
    appendStoryboardFrames,
    cameraMovementPreset,
    clearStoryboard,
    customCameraPrompt,
    frames: storyboardFrames,
    handleGenerateStoryboard,
    hasInterpolationModel,
    isStoryboardGenerating,
    setCameraMovementPreset,
    setCustomCameraPrompt,
    setFrames: setStoryboardFrames,
  } = useStoryboardGeneration({
    brandId,
    currentModels,
    findAllAssets,
    promptConfig,
    promptText,
    setGeneratedAssetId,
  });

  // Asset actions
  const {
    handleIngredientClick,
    handleSeeDetails,
    handleCopy,
    handleReprompt,
    handleEditIngredient,
    handleConvertImageToVideo,
    handleCreateVariation,
    handleToggleFavorite,
    handleMarkValidated,
    handleMarkRejected,
    handleMarkArchived,
    handlePublishIngredient,
    lightboxOpen,
    setLightboxOpen,
    lightboxIndex,
    setLightboxIndex,
  } = useAssetActions({
    allAssets,
    brandId,
    categoryType,
    currentModels,
    currentPage,
    findAllAssets,
    handleGenerateSubmit,
    setSelectedAsset,
  });

  // Table selection + bulk operations
  const {
    tableSelectedIds,
    setTableSelectedIds,
    isBulkUpdating,
    handleClearSelection,
    handleBulkDelete,
    handleBulkStatusChange,
  } = useTableSelection({ findAllAssets });

  // Table columns and actions
  const { openPostBatchModal } = usePostModal({
    onRefresh: () => findAllAssets(1, false, true),
  });

  const { columns } = useTableColumns({
    allAssets,
    categoryType,
    findAllAssets,
    handleCopy,
    handleMusicPlay,
    openPostBatchModal,
    setLightboxIndex,
    setLightboxOpen,
  });

  const { actions } = useTableActions({
    categoryType,
    handleConvertImageToVideo,
    handleCopy,
    handleEditIngredient,
    handleSeeDetails,
    handleToggleFavorite,
  });

  // Avatar/Voice data loading
  const shouldLoadAvatarData =
    categoryType === IngredientCategory.AVATAR && !!brandId;

  const {
    data: avatarData,
    error: avatarDataError,
    isLoading: isAvatarDataLoading,
  } = useQuery<AvatarVoiceData>({
      enabled: shouldLoadAvatarData,
      queryFn: async () => {
        const [avatarsService, voicesService] = await Promise.all([
          getAvatarsService(),
          getVoicesService(),
        ]);
        const query: IQueryParams = { pagination: false };

        const [allAvatars, allVoices] = await Promise.all([
          avatarsService.findAll(query),
          voicesService.findAll(query),
        ]);

        const avatars = allAvatars.filter(
          (avatar: IIngredient) => avatar.provider === 'heygen',
        );
        const voices = allVoices.filter(
          (voice: IIngredient) => voice.provider === 'elevenlabs',
        );

        logger.info('Loaded avatars and voices', {
          avatars: avatars.length,
          totalAvatars: allAvatars.length,
          totalVoices: allVoices.length,
          voices: voices.length,
        });

        return { avatars, voices };
      },
      queryKey: ['studio-avatar-data', categoryType, brandId],
    });

  useEffect(() => {
    if (avatarDataError instanceof Error) {
      logger.error('Failed to load avatars and voices', avatarDataError);
    }
  }, [avatarDataError]);

  const avatarTemplates = useMemo(
    () => avatarData?.avatars ?? [],
    [avatarData?.avatars],
  );
  const voiceModels = useMemo(
    () => avatarData?.voices ?? [],
    [avatarData?.voices],
  );

  type AvatarVoiceOptionNonNull = NonNullable<
    ReturnType<typeof buildAvatarVoiceOption>
  >;

  const avatarOptions = useMemo(
    () =>
      avatarTemplates
        .map(buildAvatarVoiceOption)
        .filter((option): option is AvatarVoiceOptionNonNull => option !== null)
        .sort((a: AvatarVoiceOptionNonNull, b: AvatarVoiceOptionNonNull) =>
          a.label.localeCompare(b.label),
        ),
    [avatarTemplates],
  );

  const voiceOptions = useMemo(
    () =>
      voiceModels
        .map(buildAvatarVoiceOption)
        .filter((option): option is AvatarVoiceOptionNonNull => option !== null)
        .sort((a: AvatarVoiceOptionNonNull, b: AvatarVoiceOptionNonNull) =>
          a.label.localeCompare(b.label),
        ),
    [voiceModels],
  );

  const selectedAvatar = useMemo(
    () =>
      avatarTemplates.find(
        (avatar: IIngredient) => avatar.id === promptConfig?.avatarId,
      ),
    [avatarTemplates, promptConfig?.avatarId],
  );

  const selectedAvatarPreviewUrl = useMemo(
    () => resolveAvatarPreviewUrl(selectedAvatar),
    [selectedAvatar],
  );

  // Folders
  const { data: folders = [], error: foldersError } = useQuery<IFolder[]>({
    enabled: !!brandId,
    queryFn: async () => {
      const foldersService = await getFoldersService();
      const query = {
        isActive: true,
        pagination: false,
        ...(brandId && { brand: brandId }),
      };

      const allFolders = await foldersService.findAll(query);
      logger.info('Loaded folders', { total: allFolders.length });
      return allFolders;
    },
    queryKey: ['studio-folders', brandId],
  });

  useEffect(() => {
    if (foldersError instanceof Error) {
      logger.error('Failed to load folders', foldersError);
    }
  }, [foldersError]);

  // Filtered presets
  const filteredPresets = useMemo(() => {
    const categoryToModelCategory: Partial<
      Record<IngredientCategory, ModelCategory>
    > = {
      [IngredientCategory.VIDEO]: ModelCategory.VIDEO,
      [IngredientCategory.IMAGE]: ModelCategory.IMAGE,
    };
    const modelCategory = categoryToModelCategory[categoryType];
    if (!modelCategory) {
      return [];
    }
    return presets.filter((preset) => preset.category === modelCategory);
  }, [presets, categoryType]);

  // Category change handler
  const handleCategoryTypeChange = useCallback(
    (category: IngredientCategory) => {
      stopAllMusic();

      if (onCategoryChange) {
        onCategoryChange(category);
      } else {
        const categoryParamMap: Partial<Record<IngredientCategory, string>> = {
          [IngredientCategory.VIDEO]: 'video',
          [IngredientCategory.IMAGE]: 'image',
          [IngredientCategory.MUSIC]: 'music',
          [IngredientCategory.AVATAR]: 'avatar',
        };
        const param = categoryParamMap[category] || 'image';
        router.push(href(`/studio/${param}`), { scroll: false });
      }

      setCategoryType(category);
      setSelectedAsset(null);
      resetPaginationState();
    },
    [
      router,
      setSelectedAsset,
      resetPaginationState,
      stopAllMusic,
      onCategoryChange,
      href,
    ],
  );

  const defaultModelKey = useMemo(
    () =>
      currentModels.find((model) => model.isDefault)?.key ??
      currentModels[0]?.key ??
      '',
    [currentModels],
  );

  // Generate label
  const generationEstimateLabel = useMemo(
    () =>
      computeGenerationEstimateLabel({
        categoryType,
        defaultModelKey,
        duration:
          typeof promptConfig.duration === 'number'
            ? promptConfig.duration
            : undefined,
        format:
          typeof promptConfig.format === 'string'
            ? promptConfig.format
            : undefined,
        height:
          typeof promptConfig.height === 'number'
            ? promptConfig.height
            : undefined,
        models: Array.isArray(promptConfig.models)
          ? (promptConfig.models as string[])
          : undefined,
        references: Array.isArray(promptConfig.references)
          ? (promptConfig.references as string[])
          : undefined,
        promptText,
        width:
          typeof promptConfig.width === 'number'
            ? promptConfig.width
            : undefined,
      }),
    [
      categoryType,
      defaultModelKey,
      promptConfig.duration,
      promptConfig.format,
      promptConfig.height,
      promptConfig.models,
      promptConfig.references,
      promptConfig.width,
      promptText,
    ],
  );

  const generateLabel = useMemo(
    () =>
      buildGenerateLabel({
        activeGenerationsCount: activeGenerations.length,
        categoryType,
        generationEstimateLabel,
        isGenerationCooldown,
      }),
    [
      categoryType,
      activeGenerations.length,
      generationEstimateLabel,
      isGenerationCooldown,
    ],
  );

  // Brand switch reset
  useEffect(() => {
    if (prevAccountIdRef.current && prevAccountIdRef.current !== brandId) {
      setSelectedAsset(null);
      stopAllMusic();
      resetPaginationState();
    }
    prevAccountIdRef.current = brandId;
  }, [brandId, resetPaginationState, setSelectedAsset, stopAllMusic]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearAll();
      stopAllMusic();
    };
  }, [clearAll, stopAllMusic]);

  // URL config parsing (text param)
  useEffect(() => {
    let isActive = true;
    const textParam = parsedSearchParams.get('text');

    if (!textParam || parsedSearchParams.get('referenceImageId')) {
      return () => {
        isActive = false;
      };
    }

    import('@utils/url/prompt-config-url.util').then(
      ({ parsePromptConfigFromParams, ALL_PROMPT_CONFIG_PARAMS }) => {
        if (!isActive) {
          return;
        }

        const configFromUrl = parsePromptConfigFromParams(parsedSearchParams);
        if (Object.keys(configFromUrl).length === 0) {
          return;
        }

        if (configFromUrl.text) {
          setPromptText(configFromUrl.text);
        }

        const { text, ...restConfig } = configFromUrl;

        if (restConfig.format) {
          const formatConfig = formatVideos.find(
            (f) => f.id === restConfig.format,
          );
          if (formatConfig) {
            restConfig.width = restConfig.width ?? formatConfig.width;
            restConfig.height = restConfig.height ?? formatConfig.height;
          }
        }

        if (Object.keys(restConfig).length > 0) {
          setPromptConfig((prev) => ({ ...prev, ...restConfig }));
          promptDataRef.current = { ...promptDataRef.current, ...restConfig };

          if (restConfig.format) {
            setFilters((prev) => ({
              ...prev,
              format: restConfig.format as string,
            }));
          }
        }

        if (isActive) {
          const params = new URLSearchParams(searchParamsString);
          for (const key of ALL_PROMPT_CONFIG_PARAMS) {
            params.delete(key);
          }
          const queryString = params.toString();
          router.replace(
            queryString ? `${pathname}?${queryString}` : pathname,
            { scroll: false },
          );
          notificationsService.success('Prompt loaded from URL');
        }
      },
    );

    return () => {
      isActive = false;
    };
  }, [
    searchParamsString,
    parsedSearchParams,
    pathname,
    router,
    notificationsService,
    setPromptText,
    setPromptConfig,
    promptDataRef,
    setFilters,
  ]);

  // Reference image handling
  useEffect(() => {
    const abortController = new AbortController();
    const referenceImageId = parsedSearchParams.get('referenceImageId');
    const isValidCategory =
      categoryType === IngredientCategory.VIDEO ||
      categoryType === IngredientCategory.IMAGE;

    if (!referenceImageId || !isValidCategory || !brandId) {
      return () => {
        abortController.abort();
      };
    }

    const fetchAndSetReference = async () => {
      if (abortController.signal.aborted) {
        return;
      }

      try {
        const imagesService = await getImagesService();
        const image = await imagesService.findOne(referenceImageId);
        if (abortController.signal.aborted) {
          return;
        }

        if (image) {
          const formatParamLocal = parsedSearchParams.get('format');
          let format: IngredientFormat | undefined;

          if (formatParamLocal) {
            const formatValue =
              formatParamLocal.toLowerCase() as IngredientFormat;
            if (Object.values(IngredientFormat).includes(formatValue)) {
              format = formatValue;
            }
          }

          if (!format) {
            format =
              image.ingredientFormat || resolveIngredientAspectRatio(image);
          }

          const formatConfig = formatVideos.find((f) => f.id === format);
          const width = formatConfig?.width ?? 1080;
          const height = formatConfig?.height ?? 1920;

          setPromptConfig((prev) => ({
            ...prev,
            format,
            height,
            references: [image.id],
            width,
          }));
          setFilters((prev) => ({ ...prev, format }));
          promptDataRef.current = {
            ...promptDataRef.current,
            format,
            height,
            references: [image.id],
            width,
          };

          if (categoryType === IngredientCategory.IMAGE && image.promptText) {
            setPromptText(image.promptText);
          }

          if (categoryType === IngredientCategory.VIDEO) {
            appendStoryboardFrames([image as unknown as IImage]);
          }

          const message =
            categoryType === IngredientCategory.VIDEO
              ? 'Image added to storyboard.'
              : 'Image set as reference.';
          notificationsService.success(message);
        } else {
          notificationsService.error('Image not found');
        }

        const params = new URLSearchParams(searchParamsString);
        params.delete('referenceImageId');
        params.delete('format');
        const queryString = params.toString();
        router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
          scroll: false,
        });
      } catch (error) {
        if (!abortController.signal.aborted) {
          logger.error('Failed to fetch reference image', error);
          notificationsService.error('Failed to load reference image');
        }
      }
    };

    fetchAndSetReference();
    return () => {
      abortController.abort();
    };
  }, [
    searchParamsString,
    categoryType,
    brandId,
    notificationsService,
    pathname,
    router,
    getImagesService,
    parsedSearchParams,
    setPromptConfig,
    setFilters,
    promptDataRef,
    setPromptText,
    appendStoryboardFrames,
  ]);

  // Prompt handlers
  const handlePromptConfigChange = useCallback(
    (config: typeof promptConfig) => {
      setPromptConfig(config);
      promptDataRef.current = { ...promptDataRef.current, ...config };
    },
    [setPromptConfig, promptDataRef],
  );

  const handleSubmit = useCallback(() => {
    handleGenerateSubmit(
      promptDataRef.current as PromptTextareaSchema & { isValid: boolean },
    );
  }, [handleGenerateSubmit, promptDataRef]);

  // Derived values
  const isImageOrVideo = isImageOrVideoCategory(categoryType);
  const isImageCategory = categoryType === IngredientCategory.IMAGE;
  const isVideoCategory = categoryType === IngredientCategory.VIDEO;
  const isAvatarCategory = categoryType === IngredientCategory.AVATAR;
  const isMusicCategory = categoryType === IngredientCategory.MUSIC;
  const isEmptyStudioState =
    initialLoadComplete && !isLoading && allAssets.length === 0;

  useEffect(() => {
    if (!defaultModelKey) {
      return;
    }
    if (promptConfig.autoSelectModel === true) {
      return;
    }
    if (Array.isArray(promptConfig.models) && promptConfig.models.length > 0) {
      return;
    }
    setPromptConfig((prev) => ({
      ...prev,
      autoSelectModel: false,
      models: [defaultModelKey],
    }));
  }, [
    defaultModelKey,
    promptConfig.autoSelectModel,
    promptConfig.models,
    setPromptConfig,
  ]);

  const resolvedGridFormat = useMemo((): IngredientFormat | undefined => {
    if (!isImageOrVideo) {
      return undefined;
    }
    if (
      !promptConfig.format ||
      promptConfig.format === '' ||
      promptConfig.format === 'all'
    ) {
      return undefined;
    }
    return promptConfig.format as IngredientFormat;
  }, [isImageOrVideo, promptConfig.format]);

  const storyboardFormat = useMemo(
    () => resolveStoryboardFormat(promptConfig.format),
    [promptConfig.format],
  );

  const emptyLabel = `No ${categoryType.toLowerCase()} generated yet`;

  return {
    // Asset data
    allAssets,
    actions,
    columns,
    emptyLabel,
    findAllAssets,
    filters,
    folders,
    hasMore,
    initialLoadComplete,
    isEmptyStudioState,
    isLoading,
    isLoadingMore,
    isRefreshing,
    scrollFocusedAssetId,
    selectedIngredientIds,

    // Composer data
    avatarOptions,
    avatarPreviewUrl: selectedAvatarPreviewUrl,
    cameras,
    categoryType,
    currentModels,
    filteredPresets,
    fontFamilies,
    generateLabel,
    isAvatarCategory,
    isAvailabilityLoading: isAvatarCategory
      ? isAvatarDataLoading
      : isModelCatalogLoading,
    isGenerationCooldown,
    isMusicCategory,
    isVideoCategory,
    moods,
    promptConfig,
    promptText,
    scenes,
    sounds,
    styles,
    tags,
    trainings,
    voiceOptions,

    // Storyboard
    cameraMovementPreset,
    clearStoryboard,
    customCameraPrompt,
    handleGenerateStoryboard,
    hasInterpolationModel,
    isImageCategory,
    isImageOrVideo,
    isStoryboardGenerating,
    setCameraMovementPreset,
    setCustomCameraPrompt,
    storyboardFormat,
    storyboardFrames,
    setStoryboardFrames,

    resolvedGridFormat,

    // Lightbox
    lightboxIndex,
    lightboxOpen,
    setLightboxOpen,

    // Handlers
    handleBulkDelete,
    handleBulkStatusChange,
    handleCategoryTypeChange,
    handleClearSelection,
    handleConvertImageToVideo,
    handleCopy,
    handleCreateVariation,
    handleEditIngredient,
    handleFiltersChange,
    handleIngredientClick,
    handleLoadMore,
    handleMarkArchived,
    handleMarkRejected,
    handleMarkValidated,
    handlePromptConfigChange,
    handlePublishIngredient,
    handleRefresh,
    handleReprompt,
    handleSeeDetails,
    handleSubmit,
    handleToggleFavorite,
    handleViewModeChange,
    isBulkUpdating,
    setPromptText,
    setTableSelectedIds,
    supportsMasonry,
    tableSelectedIds,
    viewMode,
    blacklists,
  };
}
