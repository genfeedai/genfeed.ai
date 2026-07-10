import { basename, extname, join, resolve, sep } from 'node:path';
import {
  buildFlux2DevPrompt,
  buildFlux2DevPulidPrompt,
  buildFlux2DevPulidUpscalePrompt,
  buildFlux2KleinPrompt,
  buildFluxDevPrompt,
  buildPulidFluxPrompt,
  buildZImageTurboPrompt,
} from '@genfeedai/workflows/generation/comfyui';
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

      const filename = this.sanitizeComfyOutputFilename(output.filename);
      const subfolder = this.sanitizeComfyOutputSubfolder(output.subfolder);
      const localPath = this.resolveComfyOutputPath(subfolder, filename);

      const s3Key = `ingredients/${s3Folder}/generated/${jobId}/${filename}`;
      let resultUrl: string;

      try {
        await this.s3Service.uploadFile(
          this.configService.AWS_S3_BUCKET,
          s3Key,
          localPath,
          this.getContentType(filename),
        );
        resultUrl = `https://cdn.genfeed.ai/${s3Key}`;
      } catch (uploadError) {
        const uploadErrorMessage =
          uploadError instanceof Error
            ? uploadError.message
            : String(uploadError);
        this.loggerService.error(caller, {
          error: uploadErrorMessage,
          jobId,
          message: `${label} S3 upload failed`,
        });
        throw new Error(`S3 upload failed: ${uploadErrorMessage}`);
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

  /**
   * Sanitize a ComfyUI-reported output filename.
   *
   * `filename` comes from ComfyUI's /history HTTP response and is untrusted.
   * Strip any directory components so only the bare filename is used,
   * matching the local filesystem path and S3 key we build from it.
   */
  private sanitizeComfyOutputFilename(filename: string): string {
    if (!filename || typeof filename !== 'string') {
      throw new Error('ComfyUI output filename is missing or invalid');
    }

    const sanitized = basename(filename);
    if (!sanitized || sanitized === '.' || sanitized === '..') {
      throw new Error(`ComfyUI output filename is invalid: ${filename}`);
    }

    return sanitized;
  }

  /**
   * Sanitize a ComfyUI-reported output subfolder.
   *
   * `subfolder` comes from ComfyUI's /history HTTP response and is
   * untrusted. Reject absolute paths, parent-directory segments ('..'), and
   * any embedded path separators beyond a plain nested-folder name so the
   * resolved local path cannot escape COMFYUI_OUTPUT_PATH.
   */
  private sanitizeComfyOutputSubfolder(subfolder?: string): string {
    if (!subfolder) {
      return '';
    }
    if (typeof subfolder !== 'string') {
      throw new Error('ComfyUI output subfolder is invalid');
    }

    const segments = subfolder.split(/[/\\]/);
    for (const segment of segments) {
      if (segment === '..' || segment.includes(':')) {
        throw new Error(
          `ComfyUI output subfolder contains an invalid path segment: ${subfolder}`,
        );
      }
    }

    return join(...segments);
  }

  /**
   * Resolve the local filesystem path for a sanitized ComfyUI output and
   * assert it stays within the configured COMFYUI_OUTPUT_PATH. Fails closed
   * (throws) if the resolved path escapes the configured output root.
   */
  private resolveComfyOutputPath(subfolder: string, filename: string): string {
    const outputRoot = resolve(this.configService.COMFYUI_OUTPUT_PATH);
    const resolvedPath = resolve(outputRoot, subfolder, filename);

    const isWithinRoot =
      resolvedPath === outputRoot || resolvedPath.startsWith(outputRoot + sep);
    if (!isWithinRoot) {
      throw new Error(
        `ComfyUI output path escapes COMFYUI_OUTPUT_PATH: ${resolvedPath}`,
      );
    }

    return resolvedPath;
  }
}
