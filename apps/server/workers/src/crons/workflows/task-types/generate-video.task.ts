import { ByokService } from '@api/services/byok/byok.service';
import { FalService } from '@api/services/integrations/fal/fal.service';
import { FleetService } from '@api/services/integrations/fleet/fleet.service';
import { HiggsFieldService } from '@api/services/integrations/higgsfield/higgsfield.service';
import { KlingAIService } from '@api/services/integrations/klingai/klingai.service';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import {
  ByokProvider,
  VideoResolution,
  VideoTaskModel,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export interface GenerateVideoConfig {
  model: VideoTaskModel;
  prompt: string;
  duration?: number; // seconds (Veo3: 4, 6, 8)
  resolution?: '480p' | '720p' | '1080p' | '4k';
  fps?: number;
  aspectRatio?: '16:9' | '9:16' | '1:1' | '4:3';
  style?: string;
  imageUrl?: string; // For image-to-video (Veo3: 'image')
  negativePrompt?: string; // Veo3: 'negative_prompt'
  seed?: number;
  generateAudio?: boolean; // Veo3: 'generate_audio' (default: true)
  falModelId?: string;
  higgsFieldModelId?: string; // Higgsfield model path (e.g. 'kling-video/v3/pro/image-to-video')
}

export interface GenerateVideoResult {
  success: boolean;
  videoId?: string;
  error?: string;
  metadata?: {
    model: string;
    prompt: string;
    duration?: number;
    generationTime?: number;
  };
}

/**
 * Task handler for generating AI videos
 * Supports multiple AI video generation models
 */
@Injectable()
export class GenerateVideoTask {
  constructor(
    private readonly klingaiService: KlingAIService,
    private readonly replicateService: ReplicateService,
    private readonly falService: FalService,
    private readonly higgsFieldService: HiggsFieldService,
    private readonly fleetService: FleetService,
    private readonly byokService: ByokService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Execute video generation task
   */
  async execute(
    config: GenerateVideoConfig,
    userId: string,
    organizationId: string,
  ): Promise<GenerateVideoResult> {
    const startTime = Date.now();

    try {
      this.logger.log(
        `Executing generate:video task with model: ${config.model}`,
        'GenerateVideoTask',
      );

      let generatedUrl: string;
      let externalId: string;

      // Route to appropriate AI service based on model
      switch (config.model) {
        case VideoTaskModel.KLINGAI:
          externalId = await this.generateWithKlingAI(config, organizationId);
          generatedUrl = externalId;
          break;

        case VideoTaskModel.HEDRA:
        case VideoTaskModel.VEO3:
          externalId = await this.generateWithVeo3(config, organizationId);
          generatedUrl = externalId;
          break;

        case VideoTaskModel.RUNWAY:
        case VideoTaskModel.REPLICATE:
          externalId = await this.generateWithReplicate(config, organizationId);
          generatedUrl = externalId;
          break;

        case VideoTaskModel.FAL:
          generatedUrl = await this.generateWithFal(config, organizationId);
          externalId = generatedUrl;
          break;

        case VideoTaskModel.HIGGSFIELD:
          externalId = await this.generateWithHiggsField(
            config,
            organizationId,
          );
          generatedUrl = externalId;
          break;

        case VideoTaskModel.COMFYUI:
          externalId = await this.generateWithComfyUI(config);
          generatedUrl = externalId;
          break;

        default:
          throw new Error(`Unsupported model: ${config.model}`);
      }

      const generationTime = Date.now() - startTime;

      this.logger.log(
        `Video generated successfully in ${generationTime}ms`,
        'GenerateVideoTask',
      );

      return {
        metadata: {
          duration: config.duration,
          generationTime,
          model: config.model,
          prompt: config.prompt,
        },
        success: true,
        videoId: generatedUrl,
      };
    } catch (error: unknown) {
      this.logger.error('Failed to generate video', error, 'GenerateVideoTask');

      return {
        error: (error as Error).message || 'Video generation failed',
        metadata: {
          model: config.model,
          prompt: config.prompt,
        },
        success: false,
      };
    }
  }

  /**
   * Generate video using Kling AI
   */
  private async generateWithKlingAI(
    config: GenerateVideoConfig,
    organizationId: string,
  ): Promise<string> {
    const byokKey = await this.byokService.resolveApiKey(
      organizationId,
      ByokProvider.KLINGAI,
    );

    const result = await this.klingaiService.generateTextToVideo(
      config.prompt,
      {
        height:
          config.resolution === '4k'
            ? 2160
            : config.resolution === '1080p'
              ? 1080
              : 720,
        model: config.model || 'klingai-video-v1',
        width:
          config.resolution === '4k'
            ? 3840
            : config.resolution === '1080p'
              ? 1920
              : 1280,
      },
      byokKey
        ? { apiKey: byokKey.apiKey, apiSecret: byokKey.apiSecret! }
        : undefined,
    );

    return result;
  }

  /**
   * Generate video using Veo3 (via Replicate)
   */
  private async generateWithVeo3(
    config: GenerateVideoConfig,
    organizationId: string,
  ): Promise<string> {
    const byokKey = await this.byokService.resolveApiKey(
      organizationId,
      ByokProvider.REPLICATE,
    );

    const input: unknown = {
      aspect_ratio: config.aspectRatio || '16:9',
      duration: config.duration || 8, // Veo3 default: 8 seconds
      generate_audio: config.generateAudio !== false, // Default true
      prompt: config.prompt,
      resolution: config.resolution || '720p',
    };

    // Optional fields
    if (config.imageUrl) {
      input.image = config.imageUrl;
    }

    if (config.negativePrompt) {
      input.negative_prompt = config.negativePrompt;
    }

    if (config.seed) {
      input.seed = config.seed;
    }

    const result = await this.replicateService.runModel(
      'google/veo-3:latest', // Veo3 model
      input,
      byokKey?.apiKey,
    );

    return result;
  }

  /**
   * Generate video using Replicate (Runway or other models)
   */
  private async generateWithReplicate(
    config: GenerateVideoConfig,
    organizationId: string,
  ): Promise<string> {
    const byokKey = await this.byokService.resolveApiKey(
      organizationId,
      ByokProvider.REPLICATE,
    );

    const modelVersion =
      config.model === 'runway'
        ? 'runwayml/gen-2:latest'
        : 'stability-ai/stable-video-diffusion:latest';

    const input: unknown = {
      duration_seconds: config.duration || 5,
      fps: config.fps || 30,
      negative_prompt: config.negativePrompt || '',
      prompt: config.prompt,
      seed: config.seed,
    };

    if (config.imageUrl) {
      input.image = config.imageUrl;
    }

    const result = await this.replicateService.runModel(
      modelVersion,
      input,
      byokKey?.apiKey,
    );

    return result;
  }

  /**
   * Generate video using fal.ai (Kling, Runway Gen3, etc.)
   */
  private async generateWithFal(
    config: GenerateVideoConfig,
    organizationId: string,
  ): Promise<string> {
    const byokKey = await this.byokService.resolveApiKey(
      organizationId,
      ByokProvider.FAL,
    );

    const modelId =
      config.falModelId || 'fal-ai/kling-video/v1/standard/text-to-video';

    const input: Record<string, unknown> = {
      prompt: config.prompt,
    };

    if (config.duration) {
      input.duration = config.duration;
    }
    if (config.aspectRatio) {
      input.aspect_ratio = config.aspectRatio;
    }
    if (config.imageUrl) {
      input.image_url = config.imageUrl;
    }
    if (config.negativePrompt) {
      input.negative_prompt = config.negativePrompt;
    }
    if (config.seed !== undefined) {
      input.seed = config.seed;
    }

    const result = await this.falService.generateVideo(
      modelId,
      input,
      byokKey?.apiKey,
    );
    return result.url;
  }

  /**
   * Generate video using Higgsfield platform (multi-model I2V)
   */
  private async generateWithHiggsField(
    config: GenerateVideoConfig,
    organizationId: string,
  ): Promise<string> {
    if (!config.imageUrl) {
      throw new Error('Higgsfield I2V requires an imageUrl');
    }

    const result = await this.higgsFieldService.generateImageToVideo({
      aspectRatio: config.aspectRatio,
      duration: config.duration,
      imageUrl: config.imageUrl,
      modelId: config.higgsFieldModelId,
      organizationId,
      prompt: config.prompt,
    });

    const completed = await this.higgsFieldService.waitForCompletion(
      result.requestId,
      { organizationId },
    );

    return completed.videoUrl;
  }

  /**
   * Generate video using self-hosted ComfyUI (Wan 2.2 I2V via Fleet)
   */
  private async generateWithComfyUI(
    config: GenerateVideoConfig,
  ): Promise<string> {
    if (!config.imageUrl) {
      throw new Error('ComfyUI I2V requires an imageUrl');
    }

    const result = await this.fleetService.generateVideo({
      fps: config.fps ?? 16,
      imageUrl: config.imageUrl,
      negativePrompt: config.negativePrompt,
      prompt: config.prompt,
      seed: config.seed,
    });

    if (!result) {
      throw new Error('Fleet videos instance not available');
    }

    // Poll until complete
    const pollInterval = 10000;
    const timeout = 600000;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const status = await this.fleetService.pollJob('videos', result.jobId);

      if (
        status &&
        (status as Record<string, unknown>).status === 'completed'
      ) {
        const output = (status as Record<string, unknown>).output as
          | Record<string, unknown>
          | undefined;
        if (output?.video_url) {
          return output.video_url as string;
        }
      }

      if (status && (status as Record<string, unknown>).status === 'failed') {
        throw new Error(
          `ComfyUI job ${result.jobId} failed: ${(status as Record<string, unknown>).error ?? 'unknown'}`,
        );
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error(`ComfyUI job ${result.jobId} timed out after ${timeout}ms`);
  }

  /**
   * Validate configuration before execution
   */
  validateConfig(config: GenerateVideoConfig): {
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

    const validModels = Object.values(VideoTaskModel);
    if (!validModels.includes(config.model)) {
      return {
        error: `Invalid model. Must be one of: ${validModels.join(', ')}`,
        valid: false,
      };
    }

    // Veo3-specific validation
    if (config.model === 'veo3') {
      const validVeo3Durations = [4, 6, 8];
      if (config.duration && !validVeo3Durations.includes(config.duration)) {
        return {
          error: 'Veo3 duration must be 4, 6, or 8 seconds',
          valid: false,
        };
      }

      const validVeo3Resolutions = [
        VideoResolution._720P,
        VideoResolution._1080P,
      ];
      if (
        config.resolution &&
        !validVeo3Resolutions.includes(config.resolution as unknown)
      ) {
        return {
          error: 'Veo3 resolution must be 720p or 1080p',
          valid: false,
        };
      }

      const validVeo3AspectRatios = ['16:9', '9:16'];
      if (
        config.aspectRatio &&
        !validVeo3AspectRatios.includes(config.aspectRatio)
      ) {
        return {
          error: 'Veo3 aspect ratio must be 16:9 or 9:16',
          valid: false,
        };
      }
    } else {
      // Generic validation for other models
      if (config.duration && (config.duration < 1 || config.duration > 60)) {
        return {
          error: 'Duration must be between 1 and 60 seconds',
          valid: false,
        };
      }
    }

    const validResolutions = Object.values(VideoResolution);
    if (
      config.resolution &&
      !validResolutions.includes(config.resolution as unknown)
    ) {
      return {
        error: `Invalid resolution. Must be one of: ${validResolutions.join(', ')}`,
        valid: false,
      };
    }

    const validAspectRatios = ['16:9', '9:16', '1:1', '4:3'];
    if (config.aspectRatio && !validAspectRatios.includes(config.aspectRatio)) {
      return {
        error: `Invalid aspect ratio. Must be one of: ${validAspectRatios.join(', ')}`,
        valid: false,
      };
    }

    return { valid: true };
  }

  /**
   * Estimate generation time based on config
   */
  estimateGenerationTime(config: GenerateVideoConfig): number {
    // Base time in seconds
    let estimatedTime = 60;

    // Add time based on duration
    if (config.duration) {
      estimatedTime += config.duration * 10; // ~10 seconds per second of video
    }

    // Add time for higher resolutions
    if (config.resolution === '4k') {
      estimatedTime *= 2;
    } else if (config.resolution === '1080p') {
      estimatedTime *= 1.5;
    }

    return estimatedTime;
  }
}
