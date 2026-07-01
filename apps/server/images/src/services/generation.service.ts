import { extname, join } from 'node:path';
import {
  buildFlux2DevPrompt,
  buildFlux2DevPulidPrompt,
  buildFlux2DevPulidUpscalePrompt,
  buildFlux2KleinPrompt,
  buildFluxDevPrompt,
  buildPulidFluxPrompt,
  buildZImageTurboPrompt,
} from '@genfeedai/workflows/comfyui';
import { ConfigService } from '@images/config/config.service';
import type {
  GenerateImageRequest,
  GeneratePulidRequest,
  GenerationJob,
} from '@images/interfaces/images.interfaces';
import { ComfyUIService } from '@images/services/comfyui.service';
import { JobService } from '@images/services/job.service';
import { LoggerService } from '@libs/logger/logger.service';
import { S3Service } from '@libs/s3/s3.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

const DEFAULT_IMAGE_MODEL = 'genfeed-ai/flux-dev';
const DEFAULT_PULID_MODEL = 'genfeed-ai/flux-dev-pulid';

const IMAGE_CONTENT_TYPES: Record<string, string> = {
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

@Injectable()
export class GenerationService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly jobService: JobService,
    private readonly comfyuiService: ComfyUIService,
    private readonly s3Service: S3Service,
  ) {}

  async generateImage(request: GenerateImageRequest): Promise<GenerationJob> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller, { prompt: request.prompt });

    const job = await this.jobService.createJob({
      params: request,
      type: 'image',
    });

    this.processImageJob(job.jobId, request).catch((error) => {
      this.loggerService.error(caller, {
        error,
        jobId: job.jobId,
        message: 'Image generation failed unexpectedly',
      });
    });

    return job;
  }

  async generatePulid(request: GeneratePulidRequest): Promise<GenerationJob> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller, { prompt: request.prompt });

    const job = await this.jobService.createJob({
      params: request,
      type: 'pulid',
    });

    this.processPulidJob(job.jobId, request).catch((error) => {
      this.loggerService.error(caller, {
        error,
        jobId: job.jobId,
        message: 'PuLID generation failed unexpectedly',
      });
    });

    return job;
  }

  private async processImageJob(
    jobId: string,
    request: GenerateImageRequest,
  ): Promise<void> {
    await this.processComfyJob(
      jobId,
      () => this.buildImagePrompt(request),
      'images',
      'Image generation',
    );
  }

  private async processPulidJob(
    jobId: string,
    request: GeneratePulidRequest,
  ): Promise<void> {
    await this.processComfyJob(
      jobId,
      () => this.buildPulidPrompt(request),
      'pulid',
      'PuLID generation',
    );
  }

  private async processComfyJob(
    jobId: string,
    buildWorkflow: () => Record<string, unknown>,
    s3Folder: string,
    label: string,
  ): Promise<void> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    await this.jobService.updateJob(jobId, { status: 'processing' });

    try {
      const workflow = buildWorkflow();
      const { status } = await this.comfyuiService.getStatus();
      if (status !== 'online') {
        throw new Error('ComfyUI is offline');
      }

      const output = await this.comfyuiService.queueAndWait(workflow);
      if (!output) {
        throw new Error('ComfyUI returned no output image');
      }

      const s3Key = `ingredients/${s3Folder}/generated/${jobId}/${output.filename}`;
      const localPath = join(
        this.configService.COMFYUI_OUTPUT_PATH,
        output.subfolder ?? '',
        output.filename,
      );
      let resultUrl = output.filename;

      try {
        await this.s3Service.uploadFile(
          this.configService.AWS_S3_BUCKET,
          s3Key,
          localPath,
          this.getContentType(output.filename),
        );
        resultUrl = `https://cdn.genfeed.ai/${s3Key}`;
      } catch (uploadError) {
        this.loggerService.error(caller, {
          error:
            uploadError instanceof Error
              ? uploadError.message
              : String(uploadError),
          jobId,
          message: `${label} S3 upload failed, falling back to ComfyUI filename`,
        });
      }

      await this.jobService.updateJob(jobId, {
        completedAt: new Date().toISOString(),
        resultUrl,
        status: 'completed',
      });
      this.loggerService.log(caller, {
        jobId,
        message: `${label} completed`,
        resultUrl,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      await this.jobService.updateJob(jobId, {
        completedAt: new Date().toISOString(),
        error: errorMessage,
        status: 'failed',
      });
      this.loggerService.error(caller, {
        error: errorMessage,
        jobId,
        message: `${label} failed`,
      });
    }
  }

  private buildImagePrompt(
    request: GenerateImageRequest,
  ): Record<string, unknown> {
    const model = request.model ?? DEFAULT_IMAGE_MODEL;

    switch (model) {
      case 'genfeed-ai/flux-dev':
      case 'flux-dev':
      case 'sd_xl':
        return buildFluxDevPrompt({
          cfg: request.cfg,
          height: request.height,
          negativePrompt: request.negativePrompt,
          prompt: request.prompt,
          seed: request.seed,
          steps: request.steps,
          width: request.width,
        });
      case 'genfeed-ai/flux2-dev':
      case 'flux2-dev':
        return buildFlux2DevPrompt({
          guidance: request.guidance,
          height: request.height,
          prompt: request.prompt,
          seed: request.seed,
          steps: request.steps,
          width: request.width,
        });
      case 'genfeed-ai/flux2-klein':
      case 'flux2-klein':
        return buildFlux2KleinPrompt({
          height: request.height,
          prompt: request.prompt,
          seed: request.seed,
          steps: request.steps,
          width: request.width,
        });
      case 'genfeed-ai/z-image-turbo':
      case 'z-image-turbo':
        return buildZImageTurboPrompt({
          height: request.height,
          prompt: request.prompt,
          seed: request.seed,
          steps: request.steps,
          width: request.width,
        });
      default:
        throw new Error(`Unsupported image model: ${model}`);
    }
  }

  private buildPulidPrompt(
    request: GeneratePulidRequest,
  ): Record<string, unknown> {
    const model = request.model ?? DEFAULT_PULID_MODEL;

    switch (model) {
      case 'genfeed-ai/flux-dev-pulid':
      case 'flux-dev-pulid':
      case 'pulid_v1':
        return buildPulidFluxPrompt({
          cfg: request.cfg,
          faceImage: request.referenceImageUrl,
          height: request.height,
          prompt: request.prompt,
          pulidStrength: request.pulidStrength,
          seed: request.seed,
          steps: request.steps,
          width: request.width,
        });
      case 'genfeed-ai/flux2-dev-pulid':
      case 'flux2-dev-pulid':
        return buildFlux2DevPulidPrompt({
          faceImage: request.referenceImageUrl,
          guidance: request.guidance,
          height: request.height,
          prompt: request.prompt,
          pulidStrength: request.pulidStrength,
          seed: request.seed,
          steps: request.steps,
          width: request.width,
        });
      case 'genfeed-ai/flux2-dev-pulid-upscale':
      case 'flux2-dev-pulid-upscale':
        return buildFlux2DevPulidUpscalePrompt({
          faceImage: request.referenceImageUrl,
          guidance: request.guidance,
          height: request.height,
          prompt: request.prompt,
          pulidStrength: request.pulidStrength,
          seed: request.seed,
          steps: request.steps,
          upscaleModel: request.upscaleModel,
          width: request.width,
        });
      default:
        throw new Error(`Unsupported PuLID model: ${model}`);
    }
  }

  private getContentType(filename: string): string {
    return IMAGE_CONTENT_TYPES[extname(filename).toLowerCase()] ?? 'image/png';
  }
}
