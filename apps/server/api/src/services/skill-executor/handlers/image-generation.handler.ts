import { ByokProviderFactoryService } from '@api/services/byok/byok-provider-factory.service';
import { FalService } from '@api/services/integrations/fal/fal.service';
import { LeonardoAIService } from '@api/services/integrations/leonardoai/leonardoai.service';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import type {
  ContentDraft,
  SkillExecutionContext,
  SkillHandler,
} from '@api/services/skill-executor/interfaces/skill-executor.interfaces';
import { ByokProvider, ImageTaskModel } from '@genfeedai/enums';
import { Injectable } from '@nestjs/common';

/**
 * Detects provider capacity/availability errors that warrant failover.
 * Auth errors (401) and input errors (400) are NOT retryable.
 */
function isProviderCapacityError(error: unknown): boolean {
  const message = (error as Error)?.message || '';
  const status = (error as { status?: number })?.status;
  const code = (error as { code?: string })?.code;

  if (status === 503 || status === 429 || status === 502) return true;
  if (code === 'E003') return true;
  if (
    /unavailable|high demand|capacity|rate limit|too many requests/i.test(
      message,
    )
  )
    return true;

  return false;
}

@Injectable()
export class ImageGenerationHandler implements SkillHandler {
  constructor(
    private readonly leonardoAIService: LeonardoAIService,
    private readonly replicateService: ReplicateService,
    private readonly falService: FalService,
    private readonly byokProviderFactoryService: ByokProviderFactoryService,
  ) {}

  async execute(
    context: SkillExecutionContext,
    params: Record<string, unknown>,
  ): Promise<ContentDraft> {
    const prompt = typeof params.prompt === 'string' ? params.prompt : '';
    if (!prompt) {
      throw new Error('image-generation requires a prompt');
    }

    const model =
      typeof params.model === 'string'
        ? (params.model as ImageTaskModel)
        : ImageTaskModel.FAL;

    const width = typeof params.width === 'number' ? params.width : 1024;
    const height = typeof params.height === 'number' ? params.height : 1024;

    let imageUrl = '';
    let fallbackUsed = false;
    let resolvedProvider = model;

    if (model === ImageTaskModel.LEONARDO) {
      const provider = await this.byokProviderFactoryService.resolveProvider(
        context.organizationId,
        ByokProvider.LEONARDOAI,
      );

      const result = await this.leonardoAIService.generateImage(
        prompt,
        { height, style: 'photorealistic', width },
        provider.apiKey,
      );
      imageUrl = result.url;
    } else if (
      model === ImageTaskModel.SDXL ||
      model === ImageTaskModel.REPLICATE ||
      model === ImageTaskModel.IMAGEN4
    ) {
      try {
        const provider = await this.byokProviderFactoryService.resolveProvider(
          context.organizationId,
          ByokProvider.REPLICATE,
        );

        imageUrl = await this.replicateService.runModel(
          model === ImageTaskModel.IMAGEN4
            ? 'google/imagen-4'
            : 'stability-ai/sdxl:latest',
          {
            prompt,
            resolution: `${width}:${height}`,
          },
          provider.apiKey,
        );
      } catch (error: unknown) {
        if (!isProviderCapacityError(error)) throw error;

        const falProvider =
          await this.byokProviderFactoryService.resolveProvider(
            context.organizationId,
            ByokProvider.FAL,
          );

        const falModelId =
          model === ImageTaskModel.IMAGEN4
            ? 'fal-ai/flux-pro'
            : 'fal-ai/flux/dev';

        const result = await this.falService.generateImage(
          falModelId,
          { image_size: { height, width }, prompt },
          falProvider.apiKey,
        );
        imageUrl = result.url;
        fallbackUsed = true;
        resolvedProvider = ImageTaskModel.FAL;
      }
    } else {
      try {
        const provider = await this.byokProviderFactoryService.resolveProvider(
          context.organizationId,
          ByokProvider.FAL,
        );

        const result = await this.falService.generateImage(
          'fal-ai/flux/dev',
          { image_size: { height, width }, prompt },
          provider.apiKey,
        );
        imageUrl = result.url;
      } catch (error: unknown) {
        if (!isProviderCapacityError(error)) throw error;

        const repProvider =
          await this.byokProviderFactoryService.resolveProvider(
            context.organizationId,
            ByokProvider.REPLICATE,
          );

        imageUrl = await this.replicateService.runModel(
          'black-forest-labs/flux-schnell',
          { prompt, resolution: `${width}:${height}` },
          repProvider.apiKey,
        );
        fallbackUsed = true;
        resolvedProvider = ImageTaskModel.REPLICATE;
      }
    }

    return {
      confidence: 0.79,
      content: `Generated image for prompt: ${prompt}`,
      mediaUrls: [imageUrl],
      metadata: {
        fallbackUsed,
        height,
        model,
        prompt,
        resolvedProvider,
        width,
      },
      platforms: context.platforms,
      skillSlug: 'image-generation',
      type: 'image',
    };
  }
}
