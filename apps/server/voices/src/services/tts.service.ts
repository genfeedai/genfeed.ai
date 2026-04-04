import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@voices/config/config.service';
import type {
  TTSGenerateRequest,
  TTSJob,
} from '@voices/interfaces/voices.interfaces';
import { JobService } from '@voices/services/job.service';
import { TTSInferenceService } from '@voices/services/tts-inference.service';
import axios from 'axios';

@Injectable()
export class TTSService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly jobService: JobService,
    private readonly ttsInferenceService: TTSInferenceService,
  ) {}

  async generate(request: TTSGenerateRequest): Promise<TTSJob> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller, {
      language: request.language,
      textLength: request.text.length,
    });

    const job = await this.jobService.createJob({
      params: request as unknown as Record<string, unknown>,
      type: 'tts',
    });

    this.loggerService.log(caller, {
      jobId: job.jobId,
      message: 'TTS generation job created',
    });

    // Process asynchronously
    this.processTTSJob(job.jobId, request).catch((error) => {
      this.loggerService.error(caller, {
        error,
        jobId: job.jobId,
        message: 'TTS generation failed',
      });
    });

    return job;
  }

  private async processTTSJob(
    jobId: string,
    request: TTSGenerateRequest,
  ): Promise<void> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    await this.jobService.updateJob(jobId, { status: 'processing' });

    try {
      // Check inference container is online
      const { status, modelLoaded } =
        await this.ttsInferenceService.getStatus();
      if (status !== 'online') {
        throw new Error('TTS inference container is offline');
      }
      if (!modelLoaded) {
        this.loggerService.warn(caller, {
          message: 'Model not loaded yet, first request will be slow',
        });
      }

      // Generate speech via inference container
      const audioBuffer = await this.ttsInferenceService.generateSpeech({
        text: request.text,
      });

      // Upload audio to S3 via files microservice
      const uploadResponse = await axios.post(
        `${this.configService.FILES_SERVICE_URL}/v1/files/upload`,
        {
          key: `tts-output-${jobId}`,
          source: {
            contentType: 'audio/wav',
            data: audioBuffer.toString('base64'),
            type: 'buffer',
          },
          type: 'voices',
        },
        { timeout: 30000 },
      );

      const audioUrl = uploadResponse.data.publicUrl;
      if (!audioUrl) {
        throw new Error('Failed to get public URL after S3 upload');
      }

      await this.jobService.updateJob(jobId, {
        audioUrl,
        completedAt: new Date().toISOString(),
        status: 'completed',
      });

      this.loggerService.log(caller, {
        audioSizeBytes: audioBuffer.length,
        jobId,
        message: 'TTS generation completed',
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
        message: 'TTS generation failed',
      });
    }
  }
}
