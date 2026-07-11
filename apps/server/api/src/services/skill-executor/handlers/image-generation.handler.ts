import { ManagedInferenceProvider } from '@api/endpoints/v1/managed-inference/dto/managed-inference-request.dto';
import { ManagedInferenceClientService } from '@api/endpoints/v1/managed-inference/managed-inference-client.service';
import { ByokProviderFactoryService } from '@api/services/byok/byok-provider-factory.service';
import type {
  ContentDraft,
  SkillExecutionContext,
  SkillHandler,
} from '@api/services/skill-executor/interfaces/skill-executor.interfaces';
import { ByokProvider, ImageTaskModel } from '@genfeedai/enums';
import type { ByokResolutionResult } from '@genfeedai/interfaces';
import { Injectable } from '@nestjs/common';
import { FalService } from '@server/services/integrations/fal/services/fal.service';
import { LeonardoAIService } from '@server/services/integrations/leonardoai/services/leonardoai.service';
import { ReplicateService } from '@server/services/integrations/replicate/services/replicate.service';

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
    private readonly managedInferenceClientService: ManagedInferenceClientService,
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

      if (provider.source === 'managed') {
        imageUrl = await this.generateManagedImage(provider, {
          input: { height, prompt, style: 'photorealistic', width },
          model: 'leonardo-image',
          provider: ManagedInferenceProvider.LEONARDO,
        });
      } else {
        const result = await this.leonardoAIService.generateImage(
          prompt,
          { height, style: 'photorealistic', width },
          provider.apiKey,
        );
        imageUrl = result.url;
      }
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

        const modelId =
          model === ImageTaskModel.IMAGEN4
            ? 'google/imagen-4'
            : 'stability-ai/sdxl:latest';
        const input = {
          prompt,
          resolution: `${width}:${height}`,
        };

        imageUrl =
          provider.source === 'managed'
            ? await this.generateManagedImage(provider, {
                input,
                model: modelId,
                provider: ManagedInferenceProvider.REPLICATE,
              })
            : await this.replicateService.runModel(
                modelId,
                input,
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

        const input = { image_size: { height, width }, prompt };

        if (falProvider.source === 'managed') {
          imageUrl = await this.generateManagedImage(falProvider, {
            input,
            model: falModelId,
            provider: ManagedInferenceProvider.FAL,
          });
        } else {
          const result = await this.falService.generateImage(
            falModelId,
            input,
            falProvider.apiKey,
          );
          imageUrl = result.url;
        }
        fallbackUsed = true;
        resolvedProvider = ImageTaskModel.FAL;
      }
    } else {
      try {
        const provider = await this.byokProviderFactoryService.resolveProvider(
          context.organizationId,
          ByokProvider.FAL,
        );

        const input = { image_size: { height, width }, prompt };

        if (provider.source === 'managed') {
          imageUrl = await this.generateManagedImage(provider, {
            input,
            model: 'fal-ai/flux/dev',
            provider: ManagedInferenceProvider.FAL,
          });
        } else {
          const result = await this.falService.generateImage(
            'fal-ai/flux/dev',
            input,
            provider.apiKey,
          );
          imageUrl = result.url;
        }
      } catch (error: unknown) {
        if (!isProviderCapacityError(error)) throw error;

        const repProvider =
          await this.byokProviderFactoryService.resolveProvider(
            context.organizationId,
            ByokProvider.REPLICATE,
          );

        const input = { prompt, resolution: `${width}:${height}` };

        imageUrl =
          repProvider.source === 'managed'
            ? await this.generateManagedImage(repProvider, {
                input,
                model: 'black-forest-labs/flux-schnell',
                provider: ManagedInferenceProvider.REPLICATE,
              })
            : await this.replicateService.runModel(
                'black-forest-labs/flux-schnell',
                input,
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

  private async generateManagedImage(
    resolution: ByokResolutionResult,
    params: {
      input: Record<string, unknown>;
      model: string;
      provider: ManagedInferenceProvider;
    },
  ): Promise<string> {
    if (!resolution.apiKey) {
      throw new Error('Managed inference API key is not configured');
    }

    return await this.managedInferenceClientService.generateImage({
      apiKey: resolution.apiKey,
      endpointUrl: resolution.managedInferenceUrl,
      input: params.input,
      model: params.model,
      provider: params.provider,
    });
  }
}
