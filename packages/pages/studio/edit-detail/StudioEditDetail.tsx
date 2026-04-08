'use client';

import { useAssetSelection } from '@contexts/ui/asset-selection-context';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { editFormSchema } from '@genfeedai/client/schemas';
import { ITEMS_PER_PAGE, MODEL_KEYS } from '@genfeedai/constants';
import {
  ButtonSize,
  ButtonVariant,
  ImageFormat,
  IngredientCategory,
  IngredientFormat,
  IngredientStatus,
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
import Button from '@ui/buttons/base/Button';
import Card from '@ui/card/Card';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import Loading from '@ui/loading/default/Loading';
import { Button as PrimitiveButton } from '@ui/primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import PromptBar from '@ui/prompt-bars/base/PromptBar';
import { resolveIngredientReferenceUrl } from '@utils/media/reference.util';
import { buildStudioAgentHref } from '@utils/url/desktop-loop-url.util';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  type ReactNode,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Resolver } from 'react-hook-form';
import { useForm } from 'react-hook-form';
import { HiArrowLeft, HiCheck, HiClock } from 'react-icons/hi2';

const CATEGORY_LABELS: Partial<Record<IngredientCategory, string>> = {
  [IngredientCategory.VIDEO]: 'Video',
  [IngredientCategory.IMAGE]: 'Image',
  [IngredientCategory.MUSIC]: 'Music',
  [IngredientCategory.AVATAR]: 'Avatar',
  [IngredientCategory.VOICE]: 'Voice',
};

interface StatusBadgeConfig {
  bgClass: string;
  textClass: string;
  icon?: React.ReactNode;
  label: string;
}

const STATUS_BADGE_CONFIG: Partial<
  Record<IngredientStatus, StatusBadgeConfig>
> = {
  [IngredientStatus.VALIDATED]: {
    bgClass: 'bg-success/20',
    icon: <HiCheck className="w-3.5 h-3.5" />,
    label: 'Validated',
    textClass: 'text-success',
  },
  [IngredientStatus.PROCESSING]: {
    bgClass: 'bg-warning/20',
    icon: <HiClock className="w-3.5 h-3.5" />,
    label: 'Processing',
    textClass: 'text-warning',
  },
};

export default function StudioEditDetail({
  ingredientId,
}: IStudioEditDetailContentProps) {
  const { subscribe } = useSocketManager();
  const socketSubscriptionsRef = useRef<Array<() => void>>([]);
  const { brandId } = useBrand();
  const router = useRouter();
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

  const videoRef = useRef<HTMLVideoElement>(null);

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

        const [children, siblings] = await Promise.all([
          service.findAll(query).catch(() => []),
          ingredient.parent && typeof ingredient.parent === 'string'
            ? service
                .findAll({
                  brand: brandId,
                  limit: ITEMS_PER_PAGE * 5,
                  parent: ingredient.parent,
                  sort: 'createdAt: -1',
                })
                .catch(() => [])
            : Promise.resolve([]),
        ]);

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

  function renderStatusBadge(status: IngredientStatus): ReactNode {
    const config = STATUS_BADGE_CONFIG[status];
    if (config) {
      return (
        <span
          className={`inline-flex items-center gap-2 px-2 py-1 ${config.bgClass} ${config.textClass} rounded-full text-xs font-medium`}
        >
          {config.icon}
          {config.label}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-2 px-2 py-1 bg-muted/50 text-foreground/60 rounded-full text-xs font-medium">
        Non-validated
      </span>
    );
  }

  function renderAssetPreview(): ReactNode {
    if (!selectedIngredient?.ingredientUrl) {
      return (
        <div className="aspect-video bg-muted shadow-lg flex items-center justify-center p-16">
          <span className="text-foreground/50 text-lg">
            No preview available
          </span>
        </div>
      );
    }

    if (categoryType === IngredientCategory.VIDEO) {
      return (
        <div className="relative w-full h-full flex items-center justify-center">
          <VideoPlayer
            videoRef={videoRef}
            src={selectedIngredient.ingredientUrl}
            thumbnail={selectedIngredient.thumbnailUrl}
            config={{
              autoPlay: false,
              controls: true,
              loop: false,
              muted: false,
              playsInline: true,
              preload: 'metadata',
            }}
          />
        </div>
      );
    }

    if (categoryType === IngredientCategory.IMAGE) {
      return (
        <div className="relative">
          <Image
            src={selectedIngredient.ingredientUrl}
            alt={selectedIngredient.metadataLabel || 'Image'}
            className="max-w-full max-h-sidebar w-auto h-auto object-contain shadow-lg"
            width={selectedIngredient.width || 1920}
            height={selectedIngredient.height || 1080}
            priority
          />
        </div>
      );
    }

    return (
      <div className="aspect-video bg-muted shadow-lg flex items-center justify-center p-16">
        <span className="text-foreground/50 text-lg">No preview available</span>
      </div>
    );
  }

  if (loadError && !isLoading) {
    return (
      <div className="flex flex-col h-screen items-center justify-center">
        <div className="text-center max-w-md mx-auto p-8 bg-background shadow-lg">
          <h2 className="text-2xl font-bold text-error mb-4">
            Error Loading Ingredient
          </h2>
          <p className="text-foreground/70 mb-6">{loadError}</p>
          <div className="flex gap-3 justify-center">
            <Button
              label="Try Again"
              onClick={() => {
                lastIngredientIdRef.current = undefined;
                loadingRef.current = false;
                setLoadError(null);
                setIsLoading(true);
              }}
              variant={ButtonVariant.DEFAULT}
            />
            <PrimitiveButton asChild variant={ButtonVariant.SECONDARY}>
              <Link href={href('/studio')}>Go to Generate</Link>
            </PrimitiveButton>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      <div className="border-b border-white/[0.08] bg-card">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <PrimitiveButton
              asChild
              variant={ButtonVariant.GHOST}
              size={ButtonSize.SM}
            >
              <Link href={href('/studio')}>
                <HiArrowLeft className="w-4 h-4" />
                Back to Generate
              </Link>
            </PrimitiveButton>

            <h1 className="text-xl font-semibold">
              Edit {CATEGORY_LABELS[categoryType] ?? 'Media'}
            </h1>
          </div>
          {selectedIngredient ? (
            <PrimitiveButton
              asChild
              variant={ButtonVariant.SECONDARY}
              size={ButtonSize.SM}
            >
              <Link
                href={buildStudioAgentHref(
                  selectedIngredient.metadataLabel || 'Untitled asset',
                  selectedIngredient.promptText,
                )}
              >
                Ask Agent
              </Link>
            </PrimitiveButton>
          ) : null}
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loading isFullSize={false} />
          </div>
        ) : selectedIngredient ? (
          <div className="flex flex-col lg:flex-row h-full">
            <div className="w-full lg:w-1/3 flex flex-col lg:border-r border-b lg:border-b-0 border-white/[0.08]">
              <div className="flex-1 overflow-y-auto p-6">
                <Card className="mb-4 bg-card">
                  <div className="space-y-3 text-sm">
                    <div>
                      <span className="text-foreground/60">Name</span>
                      <p className="font-medium mt-1">
                        {selectedIngredient.metadataLabel || 'Untitled'}
                      </p>
                    </div>
                    <div>
                      <span className="text-foreground/60">Created</span>
                      <p className="font-medium mt-1">
                        {new Date(
                          selectedIngredient.createdAt,
                        ).toLocaleDateString('en-US', {
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </p>
                    </div>
                    <div>
                      <span className="text-foreground/60">Status</span>
                      <div className="mt-1">
                        {renderStatusBadge(selectedIngredient.status)}
                      </div>
                    </div>
                    <div>
                      <span className="text-foreground/60">
                        Original Prompt:
                      </span>
                      <p className="font-medium mt-1">
                        {selectedIngredient.promptText || 'No prompt available'}
                      </p>
                    </div>
                  </div>
                </Card>

                {(results.length > 0 || processingAssets.size > 0) && (
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold mb-4">
                      Version History
                    </h3>
                    <div className="space-y-3">
                      {Array.from(processingAssets.values()).map((asset) => {
                        const referenceImageUrl = resolveIngredientReferenceUrl(
                          asset.references,
                        );

                        return (
                          <Card key={asset.id} className="p-3 bg-card">
                            <div className="aspect-video bg-background overflow-hidden relative mb-2">
                              {referenceImageUrl ? (
                                <Image
                                  src={referenceImageUrl}
                                  alt="Processing preview"
                                  className="w-full h-full object-cover"
                                  width={asset.width || 1920}
                                  height={asset.height || 1080}
                                />
                              ) : (
                                <div className="w-full h-full bg-muted animate-pulse" />
                              )}
                              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                <div className="w-8 h-8 rounded-full bg-white/20 animate-pulse" />
                              </div>
                            </div>
                            <p className="font-medium text-sm">Processing...</p>
                            <p className="text-xs text-foreground/60">
                              {new Date().toLocaleDateString('en-US', {
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                                month: 'short',
                              })}
                            </p>
                          </Card>
                        );
                      })}

                      {results.map((result) => (
                        <Button
                          key={result.id}
                          type="button"
                          variant={ButtonVariant.UNSTYLED}
                          onClick={() =>
                            router.push(href(`/edit/${result.id}`))
                          }
                          className="cursor-pointer w-full text-left bg-transparent border-0 p-0"
                        >
                          <Card className="p-3 bg-card hover:shadow-lg transition-all">
                            <div className="aspect-video bg-background overflow-hidden mb-2">
                              {result.thumbnailUrl ? (
                                <Image
                                  src={result.thumbnailUrl}
                                  alt="Version"
                                  className="w-full h-full object-cover"
                                  width={result.width || 1920}
                                  height={result.height || 1080}
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-foreground/30">
                                  No preview
                                </div>
                              )}
                            </div>
                            <p className="font-medium text-sm mb-1">
                              {result.metadataLabel || 'Version'}
                            </p>
                            <p className="text-xs text-foreground/60">
                              {new Date(result.createdAt).toLocaleDateString(
                                'en-US',
                                {
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  month: 'short',
                                },
                              )}
                            </p>
                            {result.promptText && (
                              <p className="text-xs text-foreground/80 line-clamp-2 mt-2">
                                {result.promptText}
                              </p>
                            )}
                          </Card>
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-white/[0.08] p-4 space-y-3">
                {categoryType === IngredientCategory.IMAGE && (
                  <div className="flex items-center gap-2 text-sm">
                    <label
                      htmlFor="outputFormat"
                      className="text-foreground/60 whitespace-nowrap"
                    >
                      Output Format
                    </label>
                    <Select
                      value={editForm.watch('outputFormat') ?? 'jpg'}
                      onValueChange={(value) =>
                        editForm.setValue(
                          'outputFormat',
                          value as ImageFormat.JPG | ImageFormat.PNG,
                          { shouldDirty: true, shouldTouch: true },
                        )
                      }
                    >
                      <SelectTrigger className="h-8 max-w-truncate-sm flex-1 bg-background px-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="jpg">JPG</SelectItem>
                        <SelectItem value="png">PNG</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <PromptBar
                  mode="edit"
                  onSubmit={() => handleEditSubmit(editForm.getValues())}
                  form={editForm}
                  models={currentModels}
                  isProcessing={isProcessing}
                  selectedIngredient={selectedIngredient}
                  currentAssetFormat={
                    selectedIngredient?.ingredientFormat ||
                    IngredientFormat.SQUARE
                  }
                  categoryType={categoryType}
                />
              </div>
            </div>

            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto p-6">
                <div className="flex flex-col items-center justify-center h-full">
                  <h3 className="text-lg font-semibold mb-4">Current Asset</h3>
                  <div className="relative max-w-full max-h-sidebar flex items-center justify-center">
                    {renderAssetPreview()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
