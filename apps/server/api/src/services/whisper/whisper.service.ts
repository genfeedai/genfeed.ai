import fs from 'node:fs';
import path from 'node:path';
import { ConfigService } from '@api/config/config.service';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { FileInputType } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

type UploadedAudioFile = {
  buffer: Buffer;
  originalname?: string;
};

type AudioConversionResult = {
  success: boolean;
  url?: string;
  error?: string;
  [key: string]: unknown;
};

type HttpResponseWithData = {
  data: Buffer | ArrayBuffer | string;
};

type HttpErrorWithResponse = {
  response?: unknown;
};

function toBuffer(data: string | ArrayBuffer | Buffer): Buffer {
  if (Buffer.isBuffer(data)) {
    return data;
  }

  if (typeof data === 'string') {
    return Buffer.from(data);
  }

  return Buffer.from(new Uint8Array(data));
}

@Injectable()
export class WhisperService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly fileQueueService: FileQueueService,
    private readonly httpService: HttpService,
    private readonly replicateService: ReplicateService,
  ) {}

  private async convertVideoToAudio(
    videoPath: string,
    audioPath: string,
  ): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      // Delegate video-to-audio conversion to Files app
      const job = await this.fileQueueService.processVideo({
        ingredientId: `whisper-${Date.now()}`,
        organizationId: 'system',
        params: {
          audioBitrate: '128k',
          audioCodec: 'libmp3lame',
          format: 'mp3',
          inputPath: videoPath,
        },
        type: 'video-to-audio',
        userId: 'system',
      });

      // Wait for job completion
      const result = (await this.fileQueueService.waitForJob(
        job.jobId,
        60000,
      )) as AudioConversionResult;

      if (!result.success) {
        throw new Error(`Video-to-audio conversion failed: ${result.error}`);
      }

      if (!result.url) {
        throw new Error('Video-to-audio conversion returned no URL');
      }

      // Download the converted audio file
      const audioResponse = (await firstValueFrom(
        this.httpService.get(result.url, { responseType: 'arraybuffer' }),
      )) as HttpResponseWithData;

      // Write to local audio path
      fs.writeFileSync(audioPath, toBuffer(audioResponse.data));

      this.loggerService.log(`${url} success`);
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  private async downloadVideo(id: string): Promise<Buffer> {
    const url = `${this.configService.ingredientsEndpoint}/videos/${id}`;
    this.loggerService.log(`Attempting to download video from: ${url}`);

    try {
      const res = (await firstValueFrom(
        this.httpService.get(url, { responseType: 'arraybuffer' }),
      )) as HttpResponseWithData;
      this.loggerService.log(
        `Successfully downloaded video for ingredient: ${id}`,
      );
      return toBuffer(res.data);
    } catch (error: unknown) {
      this.loggerService.error(`Failed to download video from ${url}`, error);
      const httpError = error as HttpErrorWithResponse;
      if (httpError.response) {
        this.loggerService.error(`${url} failed`, httpError.response);
      }

      throw new Error(
        `Failed to download video for caption generation: ${(error as Error).message}`,
      );
    }
  }

  private formatSegmentsToSrt(
    segments: Array<{ start: number; end: number; text: string }>,
  ): string {
    return segments
      .map((segment, index) => {
        const startTime = this.formatSrtTimestamp(segment.start);
        const endTime = this.formatSrtTimestamp(segment.end);
        return `${index + 1}\n${startTime} --> ${endTime}\n${segment.text.trim()}`;
      })
      .join('\n\n');
  }

  private formatSrtTimestamp(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const millis = Math.round((seconds % 1) * 1000);

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
  }

  public async generateCaptions(id: string): Promise<string> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(
      `${url} Starting caption generation for ingredient: ${id}`,
    );

    let videoBuffer: Buffer;
    try {
      videoBuffer = await this.downloadVideo(id);
    } catch (error: unknown) {
      this.loggerService.error(`${url} Failed to download video`, error);

      throw new Error(
        `Unable to download video for caption generation: ${(error as Error).message}`,
      );
    }

    const videoPath = path.resolve('public', 'tmp', 'input', `${id}.mp4`);
    const audioPath = path.resolve('public', 'tmp', 'audio', `${id}.mp3`);

    fs.mkdirSync(path.dirname(videoPath), { recursive: true });
    fs.mkdirSync(path.dirname(audioPath), { recursive: true });

    fs.writeFileSync(videoPath, videoBuffer);

    try {
      this.loggerService.log(
        `${url} Converting video to audio for transcription`,
      );
      await this.convertVideoToAudio(videoPath, audioPath);

      this.loggerService.log(
        `${url} Creating transcription with Replicate Whisper`,
      );

      const audioBuffer = fs.readFileSync(audioPath);
      const result = await this.replicateService.transcribeAudio({
        audio: {
          data: audioBuffer,
          filename: `${id}.mp3`,
          type: FileInputType.BUFFER,
        },
      });

      let srt: string;
      if (result.segments && result.segments.length > 0) {
        srt = this.formatSegmentsToSrt(result.segments);
      } else {
        // Fallback: wrap entire text as a single SRT entry
        srt = `1\n00:00:00,000 --> 00:00:${String(Math.max(Math.ceil(result.duration), 1)).padStart(2, '0')},000\n${result.text}`;
      }

      this.loggerService.log(
        `${url} success - Caption generated for ingredient: ${id}`,
      );

      return srt;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      if (error instanceof Error) {
        throw new Error(
          `Caption generation failed: ${(error as Error).message}`,
        );
      }
      throw error;
    } finally {
      if (fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      if (fs.existsSync(audioPath)) {
        fs.unlinkSync(audioPath);
      }
    }
  }

  public async transcribeAudio(file: UploadedAudioFile): Promise<string> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const result = await this.replicateService.transcribeAudio({
        audio: {
          data: file.buffer,
          filename: file.originalname || 'audio.mp3',
          type: FileInputType.BUFFER,
        },
      });

      this.loggerService.log(`${url} success`);

      return result.text;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  public async transcribeUrl(
    audioUrl: string,
    language = 'en',
  ): Promise<{
    text: string;
    srt: string;
    language: string;
    duration: number;
    segments: Array<{ start: number; end: number; text: string }>;
  }> {
    const methodName = `${this.constructorName}.transcribeUrl`;
    this.loggerService.log(`${methodName} Transcribing from URL`);

    try {
      const audioResponse = (await firstValueFrom(
        this.httpService.get(audioUrl, { responseType: 'arraybuffer' }),
      )) as HttpResponseWithData;

      const audioBuffer = toBuffer(audioResponse.data);
      const filename = audioUrl.split('/').pop() || 'audio.mp3';

      const result = await this.replicateService.transcribeAudio({
        audio: {
          data: audioBuffer,
          filename,
          type: FileInputType.BUFFER,
        },
        language,
      });

      const segments = result.segments || [];
      const srt =
        segments.length > 0
          ? this.formatSegmentsToSrt(segments)
          : `1\n00:00:00,000 --> 00:00:${String(Math.max(Math.ceil(result.duration), 1)).padStart(2, '0')},000\n${result.text}`;

      this.loggerService.log(
        `${methodName} success - ${segments.length} segments, ${result.duration}s`,
      );

      return {
        duration: result.duration,
        language: result.language || language,
        segments,
        srt,
        text: result.text,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${methodName} failed`, error);
      throw error;
    }
  }
}
