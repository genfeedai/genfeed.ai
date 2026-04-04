import { ConfigService } from '@clips/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

interface ClipExtractionResult {
  videoUrl: string;
  videoS3Key: string;
  jobId: string;
}

interface CaptionResult {
  captionedVideoUrl: string;
  captionedVideoS3Key: string;
  jobId: string;
}

@Injectable()
export class ClipExtractorService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  async extractClip(
    videoUrl: string,
    startTime: number,
    endTime: number,
    userId: string,
    organizationId: string,
  ): Promise<ClipExtractionResult> {
    const methodName = `${this.constructorName}.extractClip`;
    const duration = endTime - startTime;
    this.logger.log(
      `${methodName} Extracting clip: ${startTime}s-${endTime}s (${duration}s)`,
    );

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.configService.FILES_URL}/v1/files/process/video`,
          {
            organizationId,
            params: {
              duration,
              endTime,
              inputPath: videoUrl,
              startTime,
            },
            type: 'clip-media',
            userId,
          },
          {
            headers: {
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      const jobId = response.data?.jobId || response.data?.data?.jobId;
      this.logger.log(`${methodName} Clip extraction job created: ${jobId}`);

      const result = await this.waitForJob(jobId);

      return {
        jobId,
        videoS3Key: result.s3Key || result.outputS3Key || '',
        videoUrl: result.outputUrl || result.url,
      };
    } catch (error: unknown) {
      this.logger.error(`${methodName} Failed`, error);
      throw error;
    }
  }

  async addCaptions(
    clipUrl: string,
    srtContent: string,
    userId: string,
    organizationId: string,
  ): Promise<CaptionResult> {
    const methodName = `${this.constructorName}.addCaptions`;
    this.logger.log(`${methodName} Adding captions to clip`);

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.configService.FILES_URL}/v1/files/process/video`,
          {
            organizationId,
            params: {
              inputPath: clipUrl,
              srtContent,
            },
            type: 'add-captions-overlay',
            userId,
          },
          {
            headers: {
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      const jobId = response.data?.jobId || response.data?.data?.jobId;
      this.logger.log(`${methodName} Caption job created: ${jobId}`);

      const result = await this.waitForJob(jobId);

      return {
        captionedVideoS3Key: result.s3Key || result.outputS3Key || '',
        captionedVideoUrl: result.outputUrl || result.url,
        jobId,
      };
    } catch (error: unknown) {
      this.logger.error(`${methodName} Failed`, error);
      throw error;
    }
  }

  private async waitForJob(
    jobId: string,
    timeoutMs = 180_000,
    pollIntervalMs = 3_000,
  ): Promise<Record<string, string>> {
    const methodName = `${this.constructorName}.waitForJob`;
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      try {
        const response = await firstValueFrom(
          this.httpService.get(
            `${this.configService.FILES_URL}/v1/files/job/${jobId}`,
          ),
        );

        const status = response.data?.status || response.data?.data?.status;

        if (status === 'completed' || status === 'COMPLETED') {
          return (
            response.data?.result ||
            response.data?.data?.result ||
            response.data
          );
        }

        if (status === 'failed' || status === 'FAILED') {
          throw new Error(
            `Job ${jobId} failed: ${response.data?.error || 'Unknown error'}`,
          );
        }
      } catch (error: unknown) {
        if (
          error instanceof Error &&
          (error.message.includes('failed') || error.message.includes('Failed'))
        ) {
          throw error;
        }
        this.logger.warn(
          `${methodName} Poll error for job ${jobId}, retrying...`,
        );
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error(`Job ${jobId} timed out after ${timeoutMs}ms`);
  }
}
