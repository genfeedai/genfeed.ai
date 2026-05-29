import { IngredientCategory } from '@genfeedai/enums';
import {
  buildGenerationEtaSnapshot,
  formatEtaRange,
  shouldDisplayEta,
} from '@helpers/generation-eta.helper';

export interface GenerationEstimateParams {
  categoryType: IngredientCategory;
  defaultModelKey: string;
  promptText: string;
  // Individual fields — kept separate so callers can list them in useMemo deps
  duration?: number;
  format?: string;
  height?: number;
  models?: string[];
  references?: string[];
  width?: number;
}

export function computeGenerationEstimateLabel(
  params: GenerationEstimateParams,
): string | null {
  const {
    categoryType,
    defaultModelKey,
    promptText,
    duration,
    format,
    height,
    models,
    references,
    width,
  } = params;

  const selectedModel =
    Array.isArray(models) && models.length > 0 ? models[0] : defaultModelKey;
  const startedAt = new Date();

  const estimate =
    categoryType === IngredientCategory.IMAGE
      ? buildGenerationEtaSnapshot({
          currentPhase: 'Queued',
          height: typeof height === 'number' ? height : undefined,
          model: selectedModel,
          promptText,
          resolution: typeof format === 'string' ? format : undefined,
          startedAt,
          type: 'image',
          width: typeof width === 'number' ? width : undefined,
        })
      : categoryType === IngredientCategory.VIDEO
        ? buildGenerationEtaSnapshot({
            currentPhase: 'Queued',
            durationSeconds:
              typeof duration === 'number' ? duration : undefined,
            extraProcessingCount:
              Array.isArray(references) && references.length > 0 ? 1 : 0,
            height: typeof height === 'number' ? height : undefined,
            model: selectedModel,
            promptText,
            resolution: typeof format === 'string' ? format : undefined,
            startedAt,
            type: 'video',
            width: typeof width === 'number' ? width : undefined,
          })
        : categoryType === IngredientCategory.MUSIC
          ? buildGenerationEtaSnapshot({
              currentPhase: 'Queued',
              durationSeconds: 10,
              model: selectedModel,
              promptText,
              startedAt,
              type: 'music',
            })
          : categoryType === IngredientCategory.AVATAR
            ? buildGenerationEtaSnapshot({
                audioDurationSeconds:
                  typeof duration === 'number' ? duration : undefined,
                currentPhase: 'Queued',
                model: selectedModel,
                promptText,
                provider: 'heygen',
                startedAt,
                type: 'avatar',
              })
            : null;

  if (!shouldDisplayEta(estimate) || !estimate?.estimatedDurationMs) {
    return null;
  }

  return `~${formatEtaRange(estimate.estimatedDurationMs)}`;
}

export interface GenerateLabelParams {
  categoryType: IngredientCategory;
  activeGenerationsCount: number;
  isGenerationCooldown: boolean;
  generationEstimateLabel: string | null;
}

export function buildGenerateLabel(params: GenerateLabelParams): string {
  const {
    categoryType,
    activeGenerationsCount,
    isGenerationCooldown,
    generationEstimateLabel,
  } = params;

  const categoryLabels: Record<string, string> = {
    [IngredientCategory.VIDEO]: 'Generate Video',
    [IngredientCategory.IMAGE]: 'Generate Image',
    [IngredientCategory.MUSIC]: 'Generate Music',
    [IngredientCategory.AVATAR]: 'Generate Avatar Video',
  };

  const categoryTypeLabel = categoryLabels[categoryType] ?? 'Generate';

  return activeGenerationsCount > 0 && !isGenerationCooldown
    ? `${categoryTypeLabel} (${activeGenerationsCount} processing)`
    : generationEstimateLabel
      ? `${categoryTypeLabel} (${generationEstimateLabel})`
      : categoryTypeLabel;
}
