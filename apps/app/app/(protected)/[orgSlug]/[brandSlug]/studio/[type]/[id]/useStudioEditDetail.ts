import { useAssetSelection } from '@contexts/ui/asset-selection.context';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { editFormSchema } from '@genfeedai/client/schemas';
import { ITEMS_PER_PAGE, MODEL_KEYS } from '@genfeedai/constants';
import {
  ImageFormat,
  IngredientCategory,
  IngredientFormat,
  VideoResolution,
} from '@genfeedai/enums';
import type {
  IEditFormData,
  IIngredient,
  IQueryParams,
} from '@genfeedai/interfaces';
import type { IImageEditParams } from '@genfeedai/interfaces/components/image-edit.interface';
import type { IStudioEditDetailContentProps } from '@genfeedai/interfaces/content/studio-edit-detail.interface';
import type {
  EditPayload,
  EditReframePayload,
  ImageUpscalePayload,
  MediaResult,
  VideoUpscalePayload,
} from '@genfeedai/interfaces/studio/studio-edit.interface';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useElements } from '@hooks/data/elements/use-elements/use-elements';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useSocketManager } from '@hooks/utils/use-socket-manager/use-socket-manager';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { createMediaHandler } from '@services/core/socket-manager.service';
import { ImagesService } from '@services/ingredients/images.service';
import { VideosService } from '@services/ingredients/videos.service';
import { useRouter } from 'next/navigation';
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Resolver } from 'react-hook-form';
import { useForm } from 'react-hook-form';

export function useStudioEditDetail({
  ingredientId,
}: IStudioEditDetailContentProps) {
  const { subscribe } = useSocketManager();
  const socketSubscriptionsRef = useRef<Array<() => void>>([]);
  const { brandId } = useBrand();
  const { push } = useRouter();
  const { href } = useOrgUrl();

  const notificationsService = NotificationsService.getInstance();

  const [selectedIngredient, setSelectedIngredient] =
    useState<IIngredient | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingAssets, setProcessingAssets] = useState<
    Map<string, IIngredient>
  >(new Map());

  const [results, setResults] = useState<IIngredient[]>([]);

  const [categoryType, setMediaType] = useState<IngredientCategory>(
    IngredientCategory.VIDEO,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadingRef = useRef(false);
  const lastIngredientIdRef = useRef<string | undefined>(undefined);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    return () => {
      for (const unsubscribe of socketSubscriptionsRef.current) unsubscribe();
      socketSubscriptionsRef.current = [];
    };
  }, []);

  const getVideosService = useAuthedService((token: string) =>
    VideosService.getInstance(token),
  );

  const getImagesService = useAuthedService((token: string) =>
    ImagesService.getInstance(token),
  );

  const { videoEditModels, imageEditModels } = useElements();
  const { setSelectedAsset } = useAssetSelection();

  const currentModels = useMemo(() => {
    const modelsMap: Partial<
      Record<IngredientCategory, typeof videoEditModels>
    > = {
      [IngredientCategory.VIDEO]: videoEditModels,
      [IngredientCategory.IMAGE]: imageEditModels,
    };
    return modelsMap[categoryType] ?? [];
  }, [categoryType, videoEditModels, imageEditModels]);

  const editForm = useForm<IEditFormData>({
    defaultValues: {
      model: '',
      text: '',
    },
    resolver: standardSchemaResolver(editFormSchema) as Resolver<IEditFormData>,
  });

  useEffect(() => {
    if (loadingRef.current || !ingredientId || !brandId) {
      return;
    }
    if (lastIngredientIdRef.current === ingredientId) {
      return;
    }

    loadingRef.current = true;
    lastIngredientIdRef.current = ingredientId;

    startTransition(() => {
      setIsLoading(true);
      setLoadError(null);
    });

    const loadData = async () => {
      try {
        const [videoService, imageService] = await Promise.all([
          getVideosService(),
          getImagesService(),
        ]);

        let ingredient: IIngredient | null = null;
        let ingredientCategory: IngredientCategory | null = null;

        try {
          ingredient = await videoService.findOne(ingredientId);
          if (ingredient) {
            ingredientCategory = IngredientCategory.VIDEO;
          }
        } catch {
          try {
            ingredient = await imageService.findOne(ingredientId);
            if (ingredient) {
              ingredientCategory = IngredientCategory.IMAGE;
            }
          } catch {
            // Not found in either service
          }
        }

        if (!ingredient || !ingredientCategory) {
          const errorMsg =
            'Ingredient not found. Please try again or go back to the generate page.';
          setLoadError(errorMsg);
          notificationsService.error('Ingredient not found');
          setIsLoading(false);
          loadingRef.current = false;
          return;
        }

        setSelectedIngredient(ingredient);
        setMediaType(ingredientCategory);
        setSelectedAsset(ingredient);

        const models =
          ingredientCategory === IngredientCategory.VIDEO
            ? videoEditModels
            : imageEditModels;
        editForm.reset({
          model: models[0]?.key ?? '',
          text: '',
        });

        const query: IQueryParams = {
          brand: brandId,
          limit: ITEMS_PER_PAGE * 5,
          parent: ingredient.id,
          sort: 'createdAt: -1',
        };

        const service =
          ingredientCategory === IngredientCategory.VIDEO
            ? videoService
            : imageService;

        const [childrenResult, siblingsResult] = await Promise.allSettled([
          service.findAll(query),
          ingredient.parent && typeof ingredient.parent === 'string'
            ? service.findAll({
                brand: brandId,
                limit: ITEMS_PER_PAGE * 5,
                parent: ingredient.parent,
                sort: 'createdAt: -1',
              })
            : Promise.resolve([]),
        ]);

        if (childrenResult.status === 'rejected') {
          logger.error('Failed to load child ingredient versions', {
            error: childrenResult.reason,
            ingredientId: ingredient.id,
          });
        }

        if (siblingsResult.status === 'rejected') {
          logger.error('Failed to load sibling ingredient versions', {
            error: siblingsResult.reason,
            ingredientId: ingredient.id,
            parentId: ingredient.parent,
          });
        }

        const children =
          childrenResult.status === 'fulfilled' ? childrenResult.value : [];
        const siblings =
          siblingsResult.status === 'fulfilled' ? siblingsResult.value : [];

        const allVersions = [...children, ...siblings].filter(
          (item: IIngredient) => item?.id && item.id !== ingredient.id,
        );

        setResults(allVersions);
        setIsLoading(false);
        loadingRef.current = false;
      } catch (error) {
        logger.error('Failed to load ingredient', error);
        const errorMsg =
          'Failed to load ingredient. Please check your connection and try again.';
        setLoadError(errorMsg);
        notificationsService.error('Failed to load ingredient');
        setIsLoading(false);
        loadingRef.current = false;
      }
    };

    loadData();
  }, [
    ingredientId,
    brandId,
    getVideosService,
    getImagesService,
    setSelectedAsset,
    videoEditModels,
    imageEditModels,
    editForm,
    notificationsService,
  ]);

  const handleEditSubmit = useCallback(
    async (formData: IEditFormData) => {
      if (!selectedIngredient) {
        return;
      }

      setIsProcessing(true);

      try {
        const isVideo =
          selectedIngredient.category === IngredientCategory.VIDEO;

        const isReframeModel =
          formData.model === MODEL_KEYS.REPLICATE_LUMA_REFRAME_IMAGE ||
          formData.model === MODEL_KEYS.REPLICATE_LUMA_REFRAME_VIDEO;

        const isTopazUpscaleModel =
          formData.model === MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE ||
          formData.model === MODEL_KEYS.REPLICATE_TOPAZ_IMAGE_UPSCALE;

        const service = isVideo
          ? await getVideosService()
          : await getImagesService();

        let result: IIngredient | null = null;

        if (isReframeModel) {
          const reframePayload: EditReframePayload = {
            brand: brandId,
            category: isVideo
              ? IngredientCategory.VIDEO
              : IngredientCategory.IMAGE,
            format: formData.format ?? IngredientFormat.LANDSCAPE,
            height: formData.height,
            model: formData.model,
            text: formData.text,
            width: formData.width,
          };

          result = isVideo
            ? await (service as VideosService).postReframe(
                selectedIngredient.id,
                reframePayload,
              )
            : await (service as ImagesService).postReframe(
                selectedIngredient.id,
                reframePayload,
              );
        } else if (isTopazUpscaleModel) {
          if (isVideo) {
            const videoUpscalePayload: VideoUpscalePayload = {
              brand: brandId,
              category: IngredientCategory.VIDEO,
              model: formData.model,
              parent: selectedIngredient.id,
              prompt: formData.text,
              targetFps: formData.fps ?? 30,
              targetResolution: formData.resolution ?? VideoResolution._1080P,
            };

            result = await (service as VideosService).postUpscale(
              selectedIngredient.id,
              videoUpscalePayload,
            );
          } else {
            const imageUpscalePayload: ImageUpscalePayload = {
              brand: brandId,
              category: IngredientCategory.IMAGE,
              enhanceModel: formData.enhanceModel ?? 'Low Resolution V2',
              faceEnhancement: formData.faceEnhancement ?? false,
              model: formData.model,
              outputFormat: formData.outputFormat ?? ImageFormat.JPG,
              parent: selectedIngredient.id,
              prompt: formData.text,
              subjectDetection: (formData.subjectDetection === 'None'
                ? 'Foreground'
                : (formData.subjectDetection ?? 'Foreground')) as
                | 'Foreground'
                | 'Background'
                | 'All',
              upscaleFactor: (formData.upscaleFactor === '2x' ||
              formData.upscaleFactor === '4x'
                ? formData.upscaleFactor
                : '4x') as '2x' | '4x',
            };

            if (formData.faceEnhancement) {
              imageUpscalePayload.faceEnhancementStrength =
                formData.faceEnhancementStrength ?? 0.8;
              imageUpscalePayload.faceEnhancementCreativity =
                formData.faceEnhancementCreativity ?? 0.5;
            }

            result = await (service as ImagesService).postUpscale(
              selectedIngredient.id,
              imageUpscalePayload as IImageEditParams,
            );
          }
        } else {
          const editPayload: EditPayload = {
            brand: brandId,
            category: isVideo
              ? IngredientCategory.VIDEO
              : IngredientCategory.IMAGE,
            model: formData.model || currentModels[0]?.key,
            outputFormat: !isVideo
              ? (formData.outputFormat ?? 'jpg')
              : undefined,
            parent: selectedIngredient.id,
            prompt: formData.text,
          };

          result = isVideo
            ? await (service as VideosService).post(editPayload)
            : await (service as ImagesService).post(editPayload);
        }

        if (result?.id) {
          setProcessingAssets((prev) => {
            const updated = new Map(prev);
            updated.set(result.id, result);
            return updated;
          });

          const eventPath = isVideo
            ? `/videos/${result.id}`
            : `/images/${result.id}`;

          let unsubscribe: (() => void) | null = null;
          const cleanupSubscription = () => {
            if (unsubscribe) {
              unsubscribe();
              socketSubscriptionsRef.current =
                socketSubscriptionsRef.current.filter(
                  (fn) => fn !== unsubscribe,
                );
              unsubscribe = null;
            }
          };

          const handler = createMediaHandler<MediaResult>(
            async (mediaResult) => {
              setProcessingAssets((prev) => {
                const updated = new Map(prev);
                updated.delete(result.id);
                return updated;
              });

              const resolvedId =
                typeof mediaResult === 'string'
                  ? mediaResult
                  : (mediaResult?.id ?? result.id);

              const fullIngredient = await service.findOne(resolvedId);
              setResults((prev) => [fullIngredient, ...prev]);

              notificationsService.success('Edit completed successfully!');
              setIsProcessing(false);
              cleanupSubscription();
            },
            (errorMessage) => {
              setProcessingAssets((prev) => {
                const updated = new Map(prev);
                updated.delete(result.id);
                return updated;
              });

              notificationsService.error(errorMessage || 'Edit process failed');
              setIsProcessing(false);
              cleanupSubscription();
            },
          );

          unsubscribe = subscribe(eventPath, handler);
          socketSubscriptionsRef.current.push(unsubscribe);
        }
      } catch (error) {
        logger.error('Edit submission failed', error);
        notificationsService.error('Failed to submit edit');
        setIsProcessing(false);
      }
    },
    [
      selectedIngredient,
      getVideosService,
      getImagesService,
      subscribe,
      notificationsService,
      currentModels,
      brandId,
    ],
  );

  const handleRetry = useCallback(() => {
    lastIngredientIdRef.current = undefined;
    loadingRef.current = false;
    setLoadError(null);
    setIsLoading(true);
  }, []);

  const handleResultClick = useCallback(
    (id: string) => {
      push(href(`/edit/${id}`));
    },
    [push, href],
  );

  const studioHref = href('/studio');

  return {
    categoryType,
    currentModels,
    editForm,
    handleEditSubmit,
    handleResultClick,
    handleRetry,
    isLoading,
    isProcessing,
    loadError,
    processingAssets,
    results,
    selectedIngredient,
    studioHref,
    videoRef,
  };
}
