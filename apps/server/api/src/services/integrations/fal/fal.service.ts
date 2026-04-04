import { ConfigService } from '@api/config/config.service';
import { fal } from '@fal-ai/client';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

export interface FalImageResult {
  url: string;
  width?: number;
  height?: number;
  content_type?: string;
}

export interface FalVideoResult {
  url: string;
  content_type?: string;
}

interface FalMediaAsset {
  url: string;
  content_type?: string;
  width?: number;
  height?: number;
}

interface FalResponseData extends Record<string, unknown> {
  image?: FalMediaAsset;
  images?: FalMediaAsset[];
  video?: FalMediaAsset;
  videos?: FalMediaAsset[];
  url?: string;
  content_type?: string;
  width?: number;
  height?: number;
}

/**
 * fal.ai integration service
 * Supports image generation (FLUX), video generation (Kling), and more.
 * Uses fal.subscribe() for synchronous polling (no webhooks needed).
 */
@Injectable()
export class FalService {
  private readonly logContext = 'FalService';
  private configured = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly httpService: HttpService,
  ) {
    const apiKey = this.configService.get('FAL_API_KEY') as string | undefined;
    if (apiKey) {
      fal.config({ credentials: apiKey as string });
      this.configured = true;
    }
  }

  /**
   * Check if fal.ai is configured
   */
  isConfigured(): boolean {
    return this.configured;
  }

  /**
   * Generate an image using a fal.ai model
   *
   * @param modelId - fal.ai model ID (e.g. 'fal-ai/flux/dev')
   * @param input - Model input params (prompt, width, height, etc.)
   * @returns Image result with URL
   */
  async generateImage(
    modelId: string,
    input: Record<string, unknown>,
    apiKeyOverride?: string,
  ): Promise<FalImageResult> {
    this.loggerService.log(`${this.logContext} generateImage started`, {
      modelId,
      prompt: (input.prompt as string)?.substring(0, 100),
    });

    try {
      let data: FalResponseData;

      if (apiKeyOverride) {
        data = await this.runWithOverride(modelId, input, apiKeyOverride);
      } else {
        this.ensureConfigured();
        const result = await fal.subscribe(modelId, {
          input,
          logs: false,
        });
        data = result.data as FalResponseData;
      }

      // fal.ai returns images in data.images array or data.image
      const image = data.images?.[0] ?? data.image ?? (data.url ? data : null);

      if (!image?.url) {
        throw new Error(
          `fal.ai returned no image for model ${modelId}: ${JSON.stringify(data).substring(0, 200)}`,
        );
      }

      this.loggerService.log(`${this.logContext} generateImage completed`, {
        modelId,
        url: image.url.substring(0, 80),
      });

      return {
        content_type: image.content_type,
        height: image.height,
        url: image.url,
        width: image.width,
      };
    } catch (error: unknown) {
      this.loggerService.error(
        `${this.logContext} generateImage failed`,
        error,
      );
      throw error;
    }
  }

  /**
   * Generate a video using a fal.ai model (e.g. Kling)
   *
   * @param modelId - fal.ai model ID (e.g. 'fal-ai/kling-video')
   * @param input - Model input params
   * @returns Video result with URL
   */
  async generateVideo(
    modelId: string,
    input: Record<string, unknown>,
    apiKeyOverride?: string,
  ): Promise<FalVideoResult> {
    this.loggerService.log(`${this.logContext} generateVideo started`, {
      modelId,
      prompt: (input.prompt as string)?.substring(0, 100),
    });

    try {
      let data: FalResponseData;

      if (apiKeyOverride) {
        data = await this.runWithOverride(modelId, input, apiKeyOverride);
      } else {
        this.ensureConfigured();
        const result = await fal.subscribe(modelId, {
          input,
          logs: false,
        });
        data = result.data as FalResponseData;
      }

      const video = data.video ?? data.videos?.[0] ?? (data.url ? data : null);

      if (!video?.url) {
        throw new Error(
          `fal.ai returned no video for model ${modelId}: ${JSON.stringify(data).substring(0, 200)}`,
        );
      }

      this.loggerService.log(`${this.logContext} generateVideo completed`, {
        modelId,
        url: video.url.substring(0, 80),
      });

      return {
        content_type: video.content_type,
        url: video.url,
      };
    } catch (error: unknown) {
      this.loggerService.error(
        `${this.logContext} generateVideo failed`,
        error,
      );
      throw error;
    }
  }

  /**
   * Generic fal.ai model run — for any model type
   */
  async run(
    modelId: string,
    input: Record<string, unknown>,
    apiKeyOverride?: string,
  ): Promise<Record<string, unknown>> {
    if (apiKeyOverride) {
      return this.runWithOverride(modelId, input, apiKeyOverride);
    }

    this.ensureConfigured();

    const result = await fal.subscribe(modelId, {
      input,
      logs: false,
    });

    return result.data as Record<string, unknown>;
  }

  private async runWithOverride(
    modelId: string,
    input: Record<string, unknown>,
    apiKey: string,
  ): Promise<Record<string, unknown>> {
    const submitRes = await firstValueFrom(
      this.httpService.post(
        `https://queue.fal.run/${modelId}`,
        { ...input },
        {
          headers: {
            Authorization: `Key ${apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      ),
    );

    const requestId = submitRes.data?.request_id;
    if (!requestId) {
      return submitRes.data;
    }

    // Poll for result
    const maxAttempts = 120;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const statusRes = await firstValueFrom(
        this.httpService.get(
          `https://queue.fal.run/${modelId}/requests/${requestId}/status`,
          {
            headers: { Authorization: `Key ${apiKey}` },
          },
        ),
      );

      if (statusRes.data?.status === 'COMPLETED') {
        const resultRes = await firstValueFrom(
          this.httpService.get(
            `https://queue.fal.run/${modelId}/requests/${requestId}`,
            {
              headers: { Authorization: `Key ${apiKey}` },
            },
          ),
        );
        return resultRes.data;
      }

      if (statusRes.data?.status === 'FAILED') {
        throw new Error(
          `fal.ai request failed: ${statusRes.data?.error || 'Unknown error'}`,
        );
      }
    }

    throw new Error('fal.ai request timed out');
  }

  private ensureConfigured(): void {
    if (!this.configured) {
      throw new Error(
        'fal.ai is not configured. Set FAL_API_KEY environment variable.',
      );
    }
  }
}
