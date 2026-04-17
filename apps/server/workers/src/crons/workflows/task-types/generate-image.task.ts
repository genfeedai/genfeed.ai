// import { LeonardoAIService } from '@api/integrations/leonardoai/leonardoai.service';
import { ByokService } from '@api/services/byok/byok.service';
import { FalService } from '@api/services/integrations/fal/fal.service';
import { LeonardoAIService } from '@api/services/integrations/leonardoai/leonardoai.service';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { ByokProvider, ImageTaskModel } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export interface GenerateImageConfig {
  model: ImageTaskModel;
  prompt: string;
  width?: number;
  height?: number;
  quality?: 'low' | 'medium' | 'high' | 'ultra';
  style?: string;
  negativePrompt?: string;
  seed?: number;
  steps?: number;
  guidanceScale?: number;
  falModelId?: string;
}

export interface GenerateImageResult {
  success: boolean;
  imageId?: string;
  error?: string;
  metadata?: {
    model: string;
    prompt: string;
    generationTime?: number;
  };
}

/**
 * Task handler for generating AI images
 * Supports multiple AI image generation models
 */
@Injectable()
export class GenerateImageTask {
  constructor(
    private readonly leonardoService: LeonardoAIService,
    private readonly replicateService: ReplicateService,
    private readonly falService: FalService,
    private readonly byokService: ByokService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Execute image generation task
   */
  async execute(
    config: GenerateImageConfig,
    userId: string,
    organizationId: string,
  ): Promise<GenerateImageResult> {
    const startTime = Date.now();

    try {
      this.logger.log(
        `Executing generate:image task with model: ${config.model}`,
        'GenerateImageTask',
      );

      let generatedUrl: string;
      let externalId: string;

      // Route to appropriate AI service based on model, with provider failover
      switch (config.model) {
        case ImageTaskModel.LEONARDO:
          externalId = await this.generateWithLeonardo(config, organizationId);
          generatedUrl = externalId;
          break;

        case ImageTaskModel.SDXL:
        case ImageTaskModel.REPLICATE:
        case ImageTaskModel.IMAGEN4:
          try {
            externalId = await this.generateWithReplicate(
              config,
              organizationId,
            );
            generatedUrl = externalId;
          } catch (error: unknown) {
            if (!this.isProviderCapacityError(error)) throw error;
            this.logger.warn(
              `Replicate capacity error, failing over to fal.ai`,
              'GenerateImageTask',
            );
            const falModelId =
              config.model === ImageTaskModel.IMAGEN4
                ? 'fal-ai/flux-pro'
                : 'fal-ai/flux/dev';
            generatedUrl = await this.generateWithFal(
              { ...config, falModelId },
              organizationId,
            );
            externalId = generatedUrl;
          }
          break;

        case ImageTaskModel.FAL:
          try {
            generatedUrl = await this.generateWithFal(config, organizationId);
            externalId = generatedUrl;
          } catch (error: unknown) {
            if (!this.isProviderCapacityError(error)) throw error;
            this.logger.warn(
              `fal.ai capacity error, failing over to Replicate`,
              'GenerateImageTask',
            );
            externalId = await this.generateWithReplicate(
              { ...config, model: ImageTaskModel.REPLICATE },
              organizationId,
            );
            generatedUrl = externalId;
          }
          break;

        default:
          throw new Error(`Unsupported model: ${config.model}`);
      }

      const generationTime = Date.now() - startTime;

      this.logger.log(
        `Image generated successfully in ${generationTime}ms`,
        'GenerateImageTask',
      );

      return {
        imageId: generatedUrl,
        metadata: {
          generationTime,
          model: config.model,
          prompt: config.prompt,
        },
        success: true,
      };
    } catch (error: unknown) {
      this.logger.error('Failed to generate image', error, 'GenerateImageTask');

      return {
        error: (error as Error).message || 'Image generation failed',
        metadata: {
          model: config.model,
          prompt: config.prompt,
        },
        success: false,
      };
    }
  }

  /**
   * Generate image using Leonardo AI
   */
  private async generateWithLeonardo(
    config: GenerateImageConfig,
    organizationId: string,
  ): Promise<string> {
    const byokKey = await this.byokService.resolveApiKey(
      organizationId,
      ByokProvider.LEONARDOAI,
    );

    // Leonardo AI implementation
    // Note: Adjust method signature based on actual LeonardoAIService interface
    const result = await this.leonardoService.generateImage(
      config.prompt,
      {
        height: config.height || 1024,
        style: config.style || 'photorealistic',
        width: config.width || 1024,
      },
      byokKey?.apiKey,
    );

    return result.url;
  }

  /**
   * Generate image using Replicate (SDXL or other models)
   */
  private async generateWithReplicate(
    config: GenerateImageConfig,
    organizationId: string,
  ): Promise<string> {
    const byokKey = await this.byokService.resolveApiKey(
      organizationId,
      ByokProvider.REPLICATE,
    );

    const modelVersion =
      config.model === 'sdxl'
        ? 'stability-ai/sdxl:latest'
        : 'stability-ai/stable-diffusion:latest';

    const result = await this.replicateService.runModel(
      modelVersion,
      {
        guidance_scale: config.guidanceScale ?? 7.5,
        negative_prompt: config.negativePrompt || '',
        num_inference_steps: config.steps ?? 50,
        prompt: config.prompt,
        resolution: `${config.width ?? 1024}:${config.height ?? 1024}`,
        seed: config.seed ?? undefined,
      },
      byokKey?.apiKey,
    );

    return result;
  }

  /**
   * Generate image using fal.ai (FLUX Dev/Schnell/Pro)
   */
  private async generateWithFal(
    config: GenerateImageConfig,
    organizationId: string,
  ): Promise<string> {
    const byokKey = await this.byokService.resolveApiKey(
      organizationId,
      ByokProvider.FAL,
    );

    // Default to FLUX Dev if no specific fal model provided
    const modelId = config.falModelId || 'fal-ai/flux/dev';

    const input: Record<string, unknown> = {
      image_size: {
        height: config.height || 1024,
        width: config.width || 1024,
      },
      prompt: config.prompt,
    };

    if (config.seed !== undefined) {
      input.seed = config.seed;
    }
    if (config.steps !== undefined) {
      input.num_inference_steps = config.steps;
    }
    if (config.guidanceScale !== undefined) {
      input.guidance_scale = config.guidanceScale;
    }
    if (config.negativePrompt) {
      input.negative_prompt = config.negativePrompt;
    }

    const result = await this.falService.generateImage(
      modelId,
      input,
      byokKey?.apiKey,
    );
    return result.url;
  }

  /**
   * Detects provider capacity/availability errors that warrant failover.
   * Auth errors (401) and input errors (400) are NOT retryable.
   */
  private isProviderCapacityError(error: unknown): boolean {
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

  /**
   * Validate configuration before execution
   */
  validateConfig(config: GenerateImageConfig): {
    valid: boolean;
    error?: string;
  } {
    if (!config.prompt || config.prompt.trim().length === 0) {
      return { error: 'Prompt is required', valid: false };
    }

    if (config.prompt.length > 2000) {
      return {
        error: 'Prompt is too long (max 2000 characters)',
        valid: false,
      };
    }

    const validModels = Object.values(ImageTaskModel);
    if (!validModels.includes(config.model)) {
      return {
        error: `Invalid model. Must be one of: ${validModels.join(', ')}`,
        valid: false,
      };
    }

    if (config.width && (config.width < 256 || config.width > 2048)) {
      return { error: 'Width must be between 256 and 2048', valid: false };
    }

    if (config.height && (config.height < 256 || config.height > 2048)) {
      return { error: 'Height must be between 256 and 2048', valid: false };
    }

    return { valid: true };
  }
}
