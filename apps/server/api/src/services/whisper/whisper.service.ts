import fs from 'node:fs';
import path from 'node:path';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { AuthorizedMediaUrlService } from '@api/services/media-urls/authorized-media-url.service';
import { MediaUrlService } from '@api/services/media-urls/media-url.service';
import { FileInputType } from '@genfeedai/contracts';
import { MAX_FILE_SIZE } from '@genfeedai/contracts/constants';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  type IngredientMediaSource,
  resolveIngredientMediaUrl,
} from '@libs/media/media-url.util';
import { downloadBounded } from '@libs/security/bounded-download';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

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

const MEDIA_DOWNLOAD_TIMEOUT_MS = 60_000;

@Injectable()
export class WhisperService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly fileQueueService: FileQueueService,
    private readonly replicateService: ReplicateService,
    private readonly mediaUrlService: MediaUrlService,
    private readonly mediaIssuer: AuthorizedMediaUrlService,
  ) {}

  private async downloadMedia(
    input: string,
    allowIngredientsOrigin = false,
  ): Promise<Buffer> {
    const destination = new URL(input);
    const configuredOrigin = [
      this.configService.cdnUrl,
      ...(allowIngredientsOrigin
        ? [this.configService.ingredientsEndpoint]
        : []),
    ].some((configured) => {
      try {
        return new URL(configured).origin === destination.origin;
      } catch {
        return false;
      }
    });
    const { data } = await downloadBounded(input, {
      createError: (reason) =>
        new Error(
          reason === 'too-large'
            ? 'Media download exceeds the size limit'
            : 'Media download is unavailable',
        ),
      deadlineMs: MEDIA_DOWNLOAD_TIMEOUT_MS,
      destination: configuredOrigin
        ? { allowedOrigins: [destination.origin], allowPrivateNetwork: true }
        : { allowPrivateNetwork: false },
      maxBytes: MAX_FILE_SIZE,
      timeoutError: new Error('Media download timeout'),
    });
    return data;
  }

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

      const audioBuffer = await this.downloadMedia(result.url);
      fs.writeFileSync(audioPath, audioBuffer);

      this.loggerService.log(`${url} success`);
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  private async downloadVideo(id: string, videoUrl?: string): Promise<Buffer> {
    const url =
      videoUrl ?? `${this.configService.ingredientsEndpoint}/videos/${id}`;
    this.loggerService.log(`Downloading caption video for ingredient: ${id}`);

    try {
      const bytes = await this.downloadMedia(url, videoUrl === undefined);
      this.loggerService.log(
        `Successfully downloaded video for ingredient: ${id}`,
      );
      return bytes;
    } catch (error: unknown) {
      this.loggerService.error(
        `Failed to download caption video for ${id}`,
        error,
      );

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

  private formatTranscriptionToSrt(result: {
    duration: number;
    segments?: Array<{ start: number; end: number; text: string }>;
    text: string;
  }): string {
    if (result.segments && result.segments.length > 0) {
      return this.formatSegmentsToSrt(result.segments);
    }

    return `1\n00:00:00,000 --> 00:00:${String(
      Math.max(Math.ceil(result.duration), 1),
    ).padStart(2, '0')},000\n${result.text}`;
  }

  public async generateCaptions(
    id: string,
    source?: IngredientMediaSource,
    organizationId?: string,
  ): Promise<string> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(
      `${url} Starting caption generation for ingredient: ${id}`,
    );

    const resolvedUrl = source
      ? resolveIngredientMediaUrl(source, this.configService.cdnUrl)
      : undefined;
    let videoUrl: string | undefined;
    if (this.configService.isAuthorizedMediaDeliveryEnabled) {
      if (!organizationId) {
        throw new Error('Caption media requires an organization-bound source');
      }
      videoUrl = (
        await this.mediaIssuer.issueServerPublish(organizationId, [id])
      ).get(id);
      if (!videoUrl) throw new Error('Caption media is unavailable');
    } else {
      videoUrl = resolvedUrl
        ? this.mediaUrlService.buildUrlFromAbsolute(resolvedUrl)
        : undefined;
    }

    let videoBuffer: Buffer;
    try {
      videoBuffer = await this.downloadVideo(id, videoUrl);
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

      const srt = this.formatTranscriptionToSrt(result);

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
    segments: Array<{
      start: number;
      end: number;
      text: string;
      words?: Array<{ start: number; end: number; word: string }>;
    }>;
  }> {
    const methodName = `${this.constructorName}.transcribeUrl`;
    this.loggerService.log(`${methodName} Transcribing from URL`);

    try {
      const audioBuffer = await this.downloadMedia(audioUrl);
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
      const srt = this.formatTranscriptionToSrt(result);

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
