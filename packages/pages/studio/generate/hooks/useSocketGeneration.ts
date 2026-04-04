'use client';

import type { IImage, IVideo } from '@genfeedai/interfaces';
import type {
  GenerationResponse,
  SocketResult,
} from '@genfeedai/interfaces/content/generation-payload.interface';
import type { AssetQueryService } from '@genfeedai/interfaces/studio/studio-generate.interface';
import { useAssetSelection } from '@contexts/ui/asset-selection-context';
import type { PromptTextareaSchema } from '@genfeedai/client/schemas';
import {
  IngredientCategory,
  IngredientFormat,
  IngredientStatus,
  ModelCategory,
  QualityTier,
} from '@genfeedai/enums';
import { resolveQualityToModel } from '@genfeedai/helpers';
import { buildGenerationEtaSnapshot } from '@helpers/generation-eta.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useSocketManager } from '@hooks/utils/use-socket-manager/use-socket-manager';
import type {
  UseSocketGenerationParams,
  UseSocketGenerationReturn,
} from '@pages/studio/generate/types';
import {
  buildAvatarPayload,
  buildBaseGenerationPayload,
  buildImagePayload,
  buildMusicPayload,
  buildVideoPayload,
} from '@pages/studio/generate/utils/generation-payloads';
import { IngredientsService } from '@services/content/ingredients.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { createMediaHandler } from '@services/core/socket-manager.service';
import { HeyGenService } from '@services/ingredients/heygen.service';
import { ImagesService } from '@services/ingredients/images.service';
import { MusicsService } from '@services/ingredients/musics.service';
import { VideosService } from '@services/ingredients/videos.service';
import { resolvePendingIds } from '@utils/network/generation.util';
import { useCallback, useMemo, useRef, useState } from 'react';

const MUSIC_DURATION = 10;

function getRouterReason(
  generationData: GenerationResponse,
): string | undefined {
  const topLevelReasonCandidate = (
    generationData as unknown as Record<string, unknown>
  ).routerReason;
  const topLevelReason =
    typeof topLevelReasonCandidate === 'string'
      ? topLevelReasonCandidate
      : undefined;

  if (topLevelReason) {
    return topLevelReason;
  }

  const metadata =
    typeof generationData.metadata === 'object' &&
    generationData.metadata !== null
      ? generationData.metadata
      : undefined;

  if (!metadata || !('reason' in metadata)) {
    return undefined;
  }

  const metadataReason = metadata.reason;
  return typeof metadataReason === 'string' ? metadataReason : undefined;
}

function getSelectedModelLabel(
  generationData: GenerationResponse,
  fallbackModelKey: string,
): string | undefined {
  if (
    generationData.metadataModelLabel &&
    typeof generationData.metadataModelLabel === 'string'
  ) {
    return generationData.metadataModelLabel;
  }

  if (
    generationData.metadataModel &&
    typeof generationData.metadataModel === 'string'
  ) {
    return generationData.metadataModel;
  }

  if (generationData.model && typeof generationData.model === 'string') {
    return generationData.model;
  }

  return fallbackModelKey || undefined;
}

function getNumericPromptValue(
  promptData: PromptTextareaSchema & { isValid: boolean },
  key: string,
): number | undefined {
  const candidate = (promptData as Record<string, unknown>)[key];
  return typeof candidate === 'number' ? candidate : undefined;
}

function buildQueueEtaSnapshot(params: {
  categoryType: IngredientCategory;
  modelKey: string;
  promptData: PromptTextareaSchema & { isValid: boolean };
  startedAt: Date;
}) {
  const { categoryType, modelKey, promptData, startedAt } = params;

  switch (categoryType) {
    case IngredientCategory.IMAGE:
      return buildGenerationEtaSnapshot({
        currentPhase: 'Queued',
        height: getNumericPromptValue(promptData, 'height'),
        model: modelKey,
        outputCount: Array.isArray(promptData.models)
          ? promptData.models.length
          : 1,
        promptText: promptData.text,
        resolution:
          typeof promptData.format === 'string' ? promptData.format : undefined,
        startedAt,
        type: 'image',
        width: getNumericPromptValue(promptData, 'width'),
      });
    case IngredientCategory.VIDEO:
      return buildGenerationEtaSnapshot({
        currentPhase: 'Queued',
        durationSeconds: getNumericPromptValue(promptData, 'duration'),
        extraProcessingCount:
          Array.isArray(promptData.references) &&
          promptData.references.length > 0
            ? 1
            : 0,
        height: getNumericPromptValue(promptData, 'height'),
        model: modelKey,
        promptText: promptData.text,
        resolution:
          typeof promptData.format === 'string' ? promptData.format : undefined,
        startedAt,
        type: 'video',
        width: getNumericPromptValue(promptData, 'width'),
      });
    case IngredientCategory.MUSIC:
      return buildGenerationEtaSnapshot({
        currentPhase: 'Queued',
        durationSeconds: MUSIC_DURATION,
        model: modelKey,
        promptText: promptData.text,
        startedAt,
        type: 'music',
      });
    case IngredientCategory.AVATAR:
      return buildGenerationEtaSnapshot({
        audioDurationSeconds: getNumericPromptValue(promptData, 'duration'),
        currentPhase: 'Queued',
        model: modelKey,
        promptText: promptData.text,
        provider: 'heygen',
        startedAt,
        type: 'avatar',
      });
    default:
      return null;
  }
}

export function useSocketGeneration({
  brandId,
  categoryType,
  currentModels,
  findAllAssets,
  setGeneratedAssetId,
}: UseSocketGenerationParams): UseSocketGenerationReturn {
  const { subscribe } = useSocketManager();
  const { addToGenerationQueue, updateGenerationStatus } = useAssetSelection();
  const socketSubscriptionsRef = useRef<Array<() => void>>([]);
  const prevAccountIdRef = useRef<string>(brandId);

  const [isGenerationCooldown, setIsGenerationCooldown] = useState(false);

  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );

  const getVideosService = useAuthedService((token: string) =>
    VideosService.getInstance(token),
  );

  const getMusicsService = useAuthedService((token: string) =>
    MusicsService.getInstance(token),
  );

  const getImagesService = useAuthedService((token: string) =>
    ImagesService.getInstance(token),
  );

  const getIngredientsService = useAuthedService((token: string) =>
    IngredientsService.getInstance(token),
  );

  const getHeyGenService = useAuthedService((token: string) =>
    HeyGenService.getInstance(token),
  );

  const handleGenerateSubmit = useCallback(
    async (promptData: PromptTextareaSchema & { isValid: boolean }) => {
      setIsGenerationCooldown(true);

      const submittedBrandId = brandId;

      if (!submittedBrandId) {
        notificationsService.error('Please set up a brand before generating');
        return setIsGenerationCooldown(false);
      }

      const effectiveText = promptData.text?.trim() || '';

      if (!effectiveText) {
        notificationsService.error('Prompt is required');
        return setIsGenerationCooldown(false);
      }

      const handleGenerationSuccess = async (
        generationData: GenerationResponse | null | undefined,
        modelKey: string,
      ) => {
        if (!generationData?.id) {
          return;
        }

        if (promptData.autoSelectModel === true) {
          const selectedModel = getSelectedModelLabel(generationData, modelKey);
          const routerReason = getRouterReason(generationData);

          if (selectedModel && routerReason) {
            notificationsService.success(
              `Auto selected ${selectedModel}: ${routerReason}`,
            );
          } else if (selectedModel) {
            notificationsService.success(`Auto selected ${selectedModel}`);
          }
        }

        setGeneratedAssetId(generationData.id);

        const pendingIds = resolvePendingIds(generationData);

        let completedCount = 0;
        const totalExpected = pendingIds.length;

        setIsGenerationCooldown(false);

        if (prevAccountIdRef.current === submittedBrandId) {
          await findAllAssets(1, false, true);
        }

        pendingIds.forEach((pendingId) => {
          const startedAt = new Date();
          const etaSnapshot = buildQueueEtaSnapshot({
            categoryType,
            modelKey,
            promptData,
            startedAt,
          });

          addToGenerationQueue({
            currentPhase: etaSnapshot?.currentPhase ?? 'Queued',
            error: undefined,
            estimatedDurationMs: etaSnapshot?.estimatedDurationMs,
            etaConfidence: etaSnapshot?.etaConfidence,
            id: pendingId,
            lastEtaUpdateAt: etaSnapshot?.lastEtaUpdateAt,
            model:
              getSelectedModelLabel(generationData, modelKey) ??
              modelKey ??
              'Auto',
            prompt: effectiveText,
            remainingDurationMs: etaSnapshot?.remainingDurationMs,
            startTime: startedAt,
            status: [IngredientStatus.PROCESSING],
            type:
              categoryType === IngredientCategory.AVATAR
                ? 'avatar'
                : categoryType === IngredientCategory.IMAGE
                  ? 'image'
                  : categoryType === IngredientCategory.VIDEO
                    ? 'video'
                    : 'music',
          });

          const url = `/${categoryType}s/${pendingId}`;
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

          const handler = createMediaHandler<SocketResult>(
            async (result) => {
              const resolvedId =
                typeof result === 'string'
                  ? result
                  : typeof result.id === 'string'
                    ? result.id
                    : pendingId;

              try {
                let fetchService: AssetQueryService;
                switch (categoryType) {
                  case IngredientCategory.VIDEO:
                    fetchService = await getVideosService();
                    break;
                  case IngredientCategory.IMAGE:
                    fetchService = await getImagesService();
                    break;
                  case IngredientCategory.MUSIC:
                    fetchService = await getMusicsService();
                    break;
                  default:
                    fetchService = await getIngredientsService();
                    break;
                }

                const fullIngredient = await fetchService.findOne(resolvedId);

                if (fullIngredient) {
                  updateGenerationStatus(pendingId, {
                    currentPhase: 'Completed',
                    lastEtaUpdateAt: new Date().toISOString(),
                    remainingDurationMs: 0,
                    resultId: resolvedId,
                    status: [IngredientStatus.GENERATED],
                  });
                  completedCount += 1;

                  if (completedCount === totalExpected) {
                    if (prevAccountIdRef.current === submittedBrandId) {
                      await findAllAssets(1, false, true);
                    }
                  }
                }
              } catch (error) {
                logger.error(
                  'Failed to fetch ingredient after websocket event',
                  error,
                );
                completedCount += 1;
                if (completedCount === totalExpected) {
                  if (prevAccountIdRef.current === submittedBrandId) {
                    await findAllAssets(1, false, true);
                  }
                }
              } finally {
                cleanupSubscription();
              }
            },
            (errorMessage: string) => {
              completedCount += 1;
              updateGenerationStatus(pendingId, {
                currentPhase: 'Failed',
                error:
                  errorMessage ||
                  `${categoryType} generation failed with ${modelKey}`,
                lastEtaUpdateAt: new Date().toISOString(),
                remainingDurationMs: 0,
                status: [IngredientStatus.FAILED],
              });

              notificationsService.error(
                errorMessage ||
                  `${categoryType} generation failed with ${modelKey}`,
              );

              if (completedCount === totalExpected) {
                if (prevAccountIdRef.current === submittedBrandId) {
                  findAllAssets(1, false, true);
                }
              }
              cleanupSubscription();
            },
          );

          unsubscribe = subscribe(url, handler);
          socketSubscriptionsRef.current.push(unsubscribe);
        });
      };

      try {
        const isAutoSelect = promptData.autoSelectModel === true;
        let selectedModelKeys: string[] = [];

        if (isAutoSelect) {
          // Backend handles model selection — use a single iteration with no model key
          selectedModelKeys = [''];
        } else if (promptData.models?.length) {
          selectedModelKeys = promptData.models.filter(
            (modelKey): modelKey is string => Boolean(modelKey),
          );
        } else if (promptData.quality) {
          const quality = promptData.quality as QualityTier;
          const modelCategory =
            categoryType === IngredientCategory.IMAGE
              ? ModelCategory.IMAGE
              : categoryType === IngredientCategory.VIDEO
                ? ModelCategory.VIDEO
                : categoryType === IngredientCategory.MUSIC
                  ? ModelCategory.MUSIC
                  : ModelCategory.VIDEO;

          const resolvedModel = resolveQualityToModel(
            quality,
            modelCategory,
            (promptData.format as IngredientFormat) ||
              IngredientFormat.PORTRAIT,
            currentModels.map((m) => m.key),
          );

          if (resolvedModel) {
            selectedModelKeys = [resolvedModel];
          }
        } else if (currentModels[0]?.key) {
          selectedModelKeys = [currentModels[0].key];
        }

        if (selectedModelKeys.length === 0) {
          notificationsService.error('No models available for generation');
          return setIsGenerationCooldown(false);
        }

        for (const modelKey of selectedModelKeys) {
          const basePayload = buildBaseGenerationPayload(
            promptData,
            modelKey,
            submittedBrandId,
          );

          switch (categoryType) {
            case IngredientCategory.VIDEO: {
              const service = await getVideosService();
              const payload = buildVideoPayload(basePayload, promptData);
              const servicePayload = {
                ...payload,
                blacklist: promptData.blacklist || [],
                folder: promptData.folder || undefined,
              };

              const data = (await service.post(
                servicePayload as unknown as Partial<IVideo>,
              )) as GenerationResponse;

              await handleGenerationSuccess(data, modelKey);
              break;
            }

            case IngredientCategory.IMAGE: {
              const service = await getImagesService();
              const payload = buildImagePayload(basePayload, promptData);
              const servicePayload = {
                ...payload,
                blacklist: promptData.blacklist || [],
                folder: promptData.folder || undefined,
              };

              const data = (await service.post(
                servicePayload as unknown as Partial<IImage>,
              )) as GenerationResponse;

              await handleGenerationSuccess(data, modelKey);
              break;
            }

            case IngredientCategory.MUSIC: {
              const service = await getMusicsService();
              const payload = buildMusicPayload(
                promptData,
                modelKey,
                MUSIC_DURATION,
              );

              const data = (await service.post(
                payload as Parameters<MusicsService['post']>[0],
              )) as GenerationResponse;

              await handleGenerationSuccess(data, modelKey);
              break;
            }

            case IngredientCategory.AVATAR: {
              const service = await getHeyGenService();
              const payload = buildAvatarPayload(promptData);

              const data = (await service.generate(
                payload,
              )) as GenerationResponse;

              await handleGenerationSuccess(data, modelKey);
              break;
            }

            default:
              logger.error(`Unsupported category type: ${categoryType}`);
          }
        }
      } catch (error) {
        logger.error('Generation failed', error);
        notificationsService.error('Failed to generate');
        setIsGenerationCooldown(false);
      }
    },
    [
      categoryType,
      getVideosService,
      getImagesService,
      getMusicsService,
      currentModels,
      subscribe,
      notificationsService,
      findAllAssets,
      setGeneratedAssetId,
      getIngredientsService,
      brandId,
      addToGenerationQueue,
      getHeyGenService,
      updateGenerationStatus,
    ],
  );

  return {
    handleGenerateSubmit,
    isGenerationCooldown,
  };
}
