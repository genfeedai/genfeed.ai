import { join } from 'node:path';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@videos/config/config.service';
import type {
  GenerateVideoRequest,
  VideoGenerationJob,
} from '@videos/interfaces/videos.interfaces';
import { ComfyUIService } from '@videos/services/comfyui.service';
import { JobService } from '@videos/services/job.service';
import { S3Service } from '@videos/services/s3.service';
import { WorkflowService } from '@videos/services/workflow.service';

@Injectable()
export class GenerationService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly jobService: JobService,
    private readonly comfyuiService: ComfyUIService,
    private readonly workflowService: WorkflowService,
    private readonly s3Service: S3Service,
  ) {}

  async generateVideo(
    request: GenerateVideoRequest,
  ): Promise<VideoGenerationJob> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller, {
      model: request.model,
      prompt: request.prompt,
    });

    const jobType = request.sourceImageUrl ? 'image-to-video' : 'text-to-video';

    const job = await this.jobService.createJob({
      params: request as unknown as Record<string, unknown>,
      type: jobType,
    });

    this.loggerService.log(caller, {
      jobId: job.jobId,
      message: `${jobType} generation job created`,
    });

    // Process asynchronously - fire and forget, caller polls via job ID
    this.processVideoJob(job.jobId, request).catch((error) => {
      this.loggerService.error(caller, {
        error,
        jobId: job.jobId,
        message: 'Video generation failed unexpectedly',
      });
    });

    return job;
  }

  private async processVideoJob(
    jobId: string,
    request: GenerateVideoRequest,
  ): Promise<void> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    await this.jobService.updateJob(jobId, { status: 'processing' });

    try {
      // Verify ComfyUI is reachable
      const { status } = await this.comfyuiService.getStatus();
      if (status !== 'online') {
        throw new Error('ComfyUI is offline');
      }

      // Build Wan 2.2 I2V two-pass workflow
      const workflow = this.workflowService.buildWan22I2V({
        cfg: 3.0,
        height: request.height ?? 480,
        imageFilename: request.sourceImageUrl ?? '',
        negativePrompt:
          request.negativePrompt ??
          'blurry, distorted, low quality, watermark, text, morphing, flickering',
        numFrames: request.duration
          ? Math.round(request.duration * (request.fps ?? 16))
          : 81,
        prefix: `genfeed-video-${jobId.slice(0, 8)}`,
        prompt: request.prompt,
        seed: Math.floor(Math.random() * 2147483647),
        steps: 20,
        width: request.width ?? 832,
      });

      // Queue workflow and poll until completion (20 min timeout for video generation)
      const outputFilename = await this.comfyuiService.queueAndWait(
        workflow,
        1200000,
        5000,
      );

      if (outputFilename) {
        // Upload to S3 and build CDN URL
        const s3Key = `videos/generated/${jobId}/${outputFilename}`;
        const localPath = join(
          this.configService.COMFYUI_OUTPUT_PATH,
          outputFilename,
        );

        let videoUrl = outputFilename;

        try {
          await this.s3Service.uploadFile(
            this.configService.AWS_S3_BUCKET,
            s3Key,
            localPath,
            'video/mp4',
          );
          videoUrl = `https://cdn.genfeed.ai/${s3Key}`;
          this.loggerService.log(caller, {
            jobId,
            message: 'Video uploaded to S3',
            s3Key,
            videoUrl,
          });
        } catch (uploadError) {
          const uploadErrorMessage =
            uploadError instanceof Error
              ? uploadError.message
              : String(uploadError);
          this.loggerService.error(caller, {
            error: uploadErrorMessage,
            jobId,
            message: 'S3 upload failed, falling back to local filename',
          });
        }

        await this.jobService.updateJob(jobId, {
          completedAt: new Date().toISOString(),
          status: 'completed',
          videoUrl,
        });
        this.loggerService.log(caller, {
          jobId,
          message: 'Video generation completed',
          outputFilename,
          videoUrl,
        });
      } else {
        throw new Error('ComfyUI returned no output');
      }
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
        message: 'Video generation failed',
      });
    }
  }
}
