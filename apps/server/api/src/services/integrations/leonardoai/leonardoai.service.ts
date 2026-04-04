import { ConfigService } from '@api/config/config.service';
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
    // Eager initialization - authenticate SDK in constructor to avoid race conditions
    // NestJS creates singleton services, so this runs once at startup
    this.sdk.auth(this.configService.get('LEONARDO_KEY'));
  }

  private async getGenerationById(generationId: string) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    const res = await this.sdk.getGenerationById({ id: generationId });
    return res.generations_by_pk.generated_images[0].id;
  }

  // TO DO
  // IMPLEMENT THE LEORNARDO IMAGE REFERENCE MODEL
  // private async createUpload(referenceUrl: string) {
  //   const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

  //   try {
  //     this.loggerService.log(`${url} started`);

  //     const res = await this.sdk.uploadInitImage({
  //       extension: 'jpg',
  //     });

  //     if (res.status !== 200) {
  //       this.loggerService.error(`${url} failed`, res.error);
  //       throw res.error;
  //     }

  //     const initData = res.data.uploadInitImage;

  //     const fields = JSON.parse(initData.fields);
  //     const presignedUrl = initData.url;
  //     const imageId = initData.id;

  //     // Load file
  //     const fileResponse = await axios.get(referenceUrl, {
  //       responseType: 'stream',
  //     });

  //     const formData = new FormData();
  //     Object.keys(fields).forEach((key) => formData.append(key, fields[key]));
  //     formData.append('file', fileResponse.data);

  //     const response = await axios.post(presignedUrl, formData);

  //     if (response.status !== 204) {
  //       throw new Error('Failed to upload image');
  //     }

  //     return imageId;
  //   } catch (error: unknown) {
  //     this.loggerService.error(`${url} failed`, error);
  //   }
  // }

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
    const height = dimensionKey && dimensionKey in this.dimensions;

    try {
      this.loggerService.log(`${url} started`);

      if (apiKeyOverride) {
        this.sdk.auth(apiKeyOverride);
      }

      // let imageReferenceId = null;
      // if (options?.referenceUrl) {
      //   imageReferenceId = await this.createUpload(options.reference);
      // }

      const generationData = {
        height,
        // alchemy: true,
        modelId: 'b24e16ff-06e3-43eb-8d33-4416c2d75876',

        num_images: 1,
        presetStyle: options?.style?.toUpperCase() || 'ANIME',
        prompt,
        // photoReal: true,
        // modelId: 'leonardo-image-v1',
        // guidance_scale: 0.35,
        sd_version: 'v3',
        // TO DO - NOT WORKING
        // init_image_id: imageReferenceId,
        // init_strength: 0.5,
        width,
        // enhance_prompt: true,
      };

      const res = await this.sdk.createGeneration(generationData);

      if (res.status !== 200) {
        this.loggerService.error(`${url} failed`, res.error);
        throw res.error;
      }

      return res.data.sdGenerationJob.generationId;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
    } finally {
      if (apiKeyOverride) {
        this.sdk.auth(this.configService.get('LEONARDO_KEY'));
      }
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

      if (apiKeyOverride) {
        this.sdk.auth(apiKeyOverride);
      }

      if (!generationId) {
        throw new Error('Generation ID is required');
      }

      const imageId = generationId?.startsWith('img')
        ? generationId
        : await this.getGenerationById(generationId);

      const res = await this.sdk.createImageToVideoGeneration({
        imageId,
        imageType: 'GENERATED',
        prompt,
      });

      return res.data.sdGenerationJob.generationId;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
    } finally {
      if (apiKeyOverride) {
        this.sdk.auth(this.configService.get('LEONARDO_KEY'));
      }
    }
  }

  public async generateTextToVideo(prompt: string, apiKeyOverride?: string) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      this.loggerService.log(`${url} started`);

      if (apiKeyOverride) {
        this.sdk.auth(apiKeyOverride);
      }

      const res = await this.sdk.createVideoGeneration({ prompt });

      return res.data.sdGenerationJob.generationId;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
    } finally {
      if (apiKeyOverride) {
        this.sdk.auth(this.configService.get('LEONARDO_KEY'));
      }
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

      if (apiKeyOverride) {
        this.sdk.auth(apiKeyOverride);
      }

      const res = await this.sdk.createReworkGeneration({
        imageId,
        prompt,
      });

      return res.data.sdGenerationJob.generationId;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
    } finally {
      if (apiKeyOverride) {
        this.sdk.auth(this.configService.get('LEONARDO_KEY'));
      }
    }
  }
}
