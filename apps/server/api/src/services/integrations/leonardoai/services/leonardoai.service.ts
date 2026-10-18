import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import apiFactory from 'api';

@Injectable()
export class LeonardoAIService {
  private readonly constructorName: string = String(this.constructor.name);

  protected sdk = apiFactory('@leonardoai/v1.0#4ulvmzgnmb4k0che');

  private readonly dimensions = {
    '1024:1024': {
      height: 1024,
      width: 1024,
    },
    '1080:1920': {
      height: 1344,
      width: 768,
    },
    '1920:1080': {
      height: 768,
      width: 1344,
    },
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
  ) {
    this.sdk.auth(this.configService.get('LEONARDO_KEY'));
  }

  private getSdkForRequest(apiKeyOverride?: string) {
    if (!apiKeyOverride) {
      return this.sdk;
    }

    const sdk = apiFactory('@leonardoai/v1.0#4ulvmzgnmb4k0che');
    sdk.auth(apiKeyOverride);
    return sdk;
  }

  private async getGenerationById(
    generationId: string,
    sdk: ReturnType<typeof apiFactory>,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    const res = await sdk.getGenerationById({ id: generationId });
    return res.generations_by_pk.generated_images[0].id;
  }

  public async generateImage(
    prompt: string,
    options?: {
      width: number;
      height: number;
      style: string;
      reference?: string;
    },
    apiKeyOverride?: string,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const dimensionKey =
      options?.width && options?.height
        ? `${options.width}:${options.height}`
        : null;

    const width =
      dimensionKey && dimensionKey in this.dimensions
        ? this.dimensions[dimensionKey as keyof typeof this.dimensions]?.width
        : null;
    const height =
      dimensionKey && dimensionKey in this.dimensions
        ? this.dimensions[dimensionKey as keyof typeof this.dimensions]?.height
        : null;

    try {
      this.loggerService.log(`${url} started`);

      const sdk = this.getSdkForRequest(apiKeyOverride);

      const generationData = {
        height,
        modelId: 'b24e16ff-06e3-43eb-8d33-4416c2d75876',

        num_images: 1,
        presetStyle: options?.style?.toUpperCase() || 'ANIME',
        prompt,
        sd_version: 'v3',
        width,
      };

      const res = await sdk.createGeneration(generationData);

      if (res.status !== 200) {
        this.loggerService.error(`${url} failed`, res.error);
        throw res.error;
      }

      return res.data.sdGenerationJob.generationId;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
    }
  }

  public async generateImageToVideo(
    prompt: string,
    generationId?: string,
    apiKeyOverride?: string,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      this.loggerService.log(`${url} started for ${generationId}`);

      const sdk = this.getSdkForRequest(apiKeyOverride);

      if (!generationId) {
        throw new Error('Generation ID is required');
      }

      const imageId = generationId?.startsWith('img')
        ? generationId
        : await this.getGenerationById(generationId, sdk);

      const res = await sdk.createImageToVideoGeneration({
        imageId,
        imageType: 'GENERATED',
        prompt,
      });

      return res.data.sdGenerationJob.generationId;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
    }
  }

  public async generateTextToVideo(prompt: string, apiKeyOverride?: string) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      this.loggerService.log(`${url} started`);

      const sdk = this.getSdkForRequest(apiKeyOverride);

      const res = await sdk.createVideoGeneration({ prompt });

      return res.data.sdGenerationJob.generationId;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
    }
  }

  public async reworkImage(
    prompt: string,
    imageId: string,
    apiKeyOverride?: string,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      this.loggerService.log(`${url} started for ${imageId}`);

      const sdk = this.getSdkForRequest(apiKeyOverride);

      const res = await sdk.createReworkGeneration({
        imageId,
        prompt,
      });

      return res.data.sdGenerationJob.generationId;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
    }
  }
}
