import type { CreateImageDto } from '@api/collections/images/dto/create-image.dto';
import type { ImageGenerationResolvedBrand } from '@api/collections/images/services/image-generation.types';
import type { RouterService } from '@api/services/router/router.service';
import { ModelCategory } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';

export interface ResolveImageGenerationModelDependencies {
  routerService: RouterService;
  loggerService: LoggerService;
  constructorName: string;
}

export async function resolveImageGenerationModel(
  dependencies: ResolveImageGenerationModelDependencies,
  createImageDto: CreateImageDto,
  promptOriginalText: string,
  brand: ImageGenerationResolvedBrand,
  organizationSettings: { defaultImageModel?: unknown } | null,
  organizationId?: string,
  modelCategory: ModelCategory = ModelCategory.IMAGE,
): Promise<string> {
  if (modelCategory === ModelCategory.IMAGE_EDIT) {
    if (createImageDto.model) return createImageDto.model;
    const resolution = await dependencies.routerService.resolveModelKey({
      category: ModelCategory.IMAGE_EDIT,
      organizationId,
    });
    return resolution.key;
  }
  if (createImageDto.autoSelectModel) {
    // Auto model routing - let RouterService pick the best model
    const recommendation = await dependencies.routerService.selectModel({
      category: ModelCategory.IMAGE,
      dimensions: {
        height: createImageDto.height,
        width: createImageDto.width,
      },
      organizationId,
      outputs: createImageDto.outputs,
      prioritize: createImageDto.prioritize || 'balanced',
      prompt: promptOriginalText,
    });

    dependencies.loggerService.log('Auto model routing selected', {
      promptPreview: promptOriginalText.substring(0, 100),
      reason: recommendation.reason,
      selectedModel: recommendation.selectedModel,
      service: dependencies.constructorName,
    });

    return recommendation.selectedModel as string;
  }

  // Manual selection runs through the one registry policy (#2422 Phase C):
  // each candidate is honoured only if the registry carries it as an active,
  // non-legacy row, so a request naming a retired key — or a brand still
  // pointing at one — falls through to the registry default instead of being
  // waved past a hard-coded MODEL_KEYS allowlist.
  const resolution = await dependencies.routerService.resolveModelKey({
    candidates: [
      createImageDto.model as string | undefined,
      brand.defaultImageModel as string | undefined,
      organizationSettings?.defaultImageModel as string | undefined,
    ],
    category: ModelCategory.IMAGE,
    organizationId,
  });

  if (resolution.source === 'fallback-constant') {
    dependencies.loggerService.error(
      'Image model resolved from constant fallback',
      {
        model: resolution.key,
        service: dependencies.constructorName,
      },
    );
  }

  return resolution.key;
}
