import { ConfigService } from '@clips/config/config.service';
import type { ITranscriptSegment } from '@clips/interfaces/clip-project.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

interface TranscriptionResult {
  text: string;
  srt: string;
  language: string;
  duration: number;
  segments: ITranscriptSegment[];
}

interface AudioExtractionResult {
  audioUrl: string;
  jobId: string;
}

@Injectable()
export class TranscriptionService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  async extractAudio(
    videoUrl: string,
    userId: string,
    organizationId: string,
  ): Promise<AudioExtractionResult> {
    const methodName = `${this.constructorName}.extractAudio`;
    this.logger.log(`${methodName} Starting audio extraction`);

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.configService.FILES_URL}/v1/files/process/video`,
          {
            organizationId,
            params: {
              inputPath: videoUrl,
            },
            type: 'video-to-audio',
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
      this.logger.log(`${methodName} Audio extraction job created: ${jobId}`);

      const result = await this.waitForJob(jobId);

      return {
        audioUrl: result.outputUrl || result.url,
        jobId,
      };
    } catch (error: unknown) {
      this.logger.error(`${methodName} Failed`, error);
      throw error;
    }
  }

  async transcribe(
    audioUrl: string,
    language = 'en',
  ): Promise<TranscriptionResult> {
    const methodName = `${this.constructorName}.transcribe`;
    this.logger.log(`${methodName} Starting transcription`);

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.configService.API_URL}/v1/speech/transcribe/url`,
          {
            language,
            url: audioUrl,
          },
          {
            headers: {
              Authorization: `Bearer ${this.configService.API_KEY}`,
              'Content-Type': 'application/json',
            },
            timeout: 300_000,
          },
        ),
      );

      const data = response.data?.data || response.data;

      this.logger.log(
        `${methodName} Transcription complete: ${data.segments?.length || 0} segments, ${data.duration || 0}s`,
      );

      return {
        duration: data.duration,
        language: data.language,
        segments: data.segments,
        srt: data.srt,
        text: data.text,
      };
    } catch (error: unknown) {
      this.logger.error(`${methodName} Failed`, error);
      throw error;
    }
  }

  private async waitForJob(
    jobId: string,
    timeoutMs = 120_000,
    pollIntervalMs = 2_000,
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
