import * as fs from 'node:fs';
import path from 'node:path';
import { FFmpegService } from '@files/services/ffmpeg/services/ffmpeg.service';
import { UploadService } from '@files/services/upload/upload.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

const VIDEO_DOWNLOAD_LIMIT_BYTES = 500 * 1024 * 1024;
const VIDEO_DOWNLOAD_TIMEOUT_MS = 120_000;
const AUDIO_DOWNLOAD_LIMIT_BYTES = 100 * 1024 * 1024;
const AUDIO_DOWNLOAD_TIMEOUT_MS = 60_000;

export type AudioOverlayMixMode = 'replace' | 'mix' | 'background';

export type AudioOverlayRequest = {
  videoUrl: string;
  audioUrl: string;
  mixMode?: AudioOverlayMixMode;
  audioVolume?: number;
  videoVolume?: number;
  fadeIn?: number;
  fadeOut?: number;
  outputKey?: string;
};

export type AudioOverlayResponse = {
  audioUrl: string;
  mixMode: AudioOverlayMixMode;
  outputUrl: string;
  s3Key: string;
  success: true;
  videoUrl: string;
};

type AudioOverlayPaths = {
  audio?: string;
  output?: string;
  video?: string;
};

@Injectable()
export class AudioOverlayService {
  constructor(
    @Inject(FFmpegService) private readonly ffmpegService: FFmpegService,
    @Inject(HttpService) private readonly httpService: HttpService,
    private readonly logger: LoggerService,
    @Inject(UploadService) private readonly uploadService: UploadService,
  ) {}

  async processAudioOverlay(
    body: AudioOverlayRequest,
  ): Promise<AudioOverlayResponse> {
    const paths: AudioOverlayPaths = {};

    try {
      this.validateRequiredFields(body);
      const {
        videoUrl,
        audioUrl,
        mixMode = 'replace',
        audioVolume = 100,
        videoVolume = 100,
        fadeIn = 0,
        fadeOut = 0,
        outputKey,
      } = body;

      this.logger.log(
        `Processing audio overlay: mode=${mixMode}, audioVol=${audioVolume}%, videoVol=${videoVolume}%`,
      );

      const tmpDir = this.ffmpegService.getTempPath('audio-overlay');
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(7);

      const videoData = await this.downloadVideo(videoUrl);
      paths.video = path.resolve(
        tmpDir,
        `video_${timestamp}_${randomSuffix}.mp4`,
      );
      fs.writeFileSync(paths.video, videoData);
      this.logger.log(`Video downloaded to: ${paths.video}`);

      const audioDownload = await this.downloadAudio(audioUrl);
      paths.audio = path.resolve(
        tmpDir,
        `audio_${timestamp}_${randomSuffix}${audioDownload.extension}`,
      );
      fs.writeFileSync(paths.audio, audioDownload.data);
      this.logger.log(`Audio downloaded to: ${paths.audio}`);

      paths.output = path.resolve(
        tmpDir,
        `output_${timestamp}_${randomSuffix}.mp4`,
      );

      this.logger.log('Processing audio overlay with FFmpeg...');
      await this.ffmpegService.overlayAudio(
        paths.video,
        paths.audio,
        paths.output,
        { audioVolume, fadeIn, fadeOut, mixMode, videoVolume },
      );
      this.logger.log(`Audio overlay complete: ${paths.output}`);

      const finalKey =
        outputKey || `audio-overlay/${timestamp}_${randomSuffix}.mp4`;
      this.logger.log(`Uploading result to S3: ${finalKey}`);
      const uploadResult = await this.uploadService.uploadToS3(
        finalKey,
        'videos',
        { path: paths.output, type: 'file' },
      );
      this.logger.log(`Upload complete: ${uploadResult.publicUrl}`);

      return {
        audioUrl: body.audioUrl,
        mixMode,
        outputUrl: uploadResult.publicUrl,
        s3Key: finalKey,
        success: true,
        videoUrl: body.videoUrl,
      };
    } catch (error: unknown) {
      this.logger.error('Failed to process audio overlay:', error);
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        (error as { message?: string } | null)?.message ||
          'Failed to process audio overlay',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    } finally {
      this.cleanupTempFiles(paths);
    }
  }

  private validateRequiredFields(body: AudioOverlayRequest): void {
    if (!body.videoUrl || !body.audioUrl) {
      throw new HttpException(
        'videoUrl and audioUrl are required',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private async downloadVideo(videoUrl: string): Promise<Buffer> {
    this.logger.log(`Downloading video from: ${videoUrl}`);
    const response = await firstValueFrom(
      this.httpService.get(videoUrl, {
        maxContentLength: VIDEO_DOWNLOAD_LIMIT_BYTES,
        responseType: 'arraybuffer',
        timeout: VIDEO_DOWNLOAD_TIMEOUT_MS,
      }),
    );
    return Buffer.from(response.data);
  }

  private async downloadAudio(audioUrl: string): Promise<{
    data: Buffer;
    extension: string;
  }> {
    this.logger.log(`Downloading audio from: ${audioUrl}`);
    const response = await firstValueFrom(
      this.httpService.get(audioUrl, {
        maxContentLength: AUDIO_DOWNLOAD_LIMIT_BYTES,
        responseType: 'arraybuffer',
        timeout: AUDIO_DOWNLOAD_TIMEOUT_MS,
      }),
    );
    return {
      data: Buffer.from(response.data),
      extension: this.resolveAudioExtension(response.headers['content-type']),
    };
  }

  private resolveAudioExtension(rawContentType: unknown): string {
    const contentType =
      (typeof rawContentType === 'string' ? rawContentType : undefined) ||
      'audio/mpeg';

    if (contentType.includes('wav')) return '.wav';
    if (contentType.includes('ogg')) return '.ogg';
    if (contentType.includes('m4a')) return '.m4a';
    if (contentType.includes('aac')) return '.aac';
    return '.mp3';
  }

  private cleanupTempFiles(paths: AudioOverlayPaths): void {
    const filesToClean = [paths.video, paths.audio, paths.output].filter(
      (file): file is string => !!file && fs.existsSync(file),
    );

    for (const file of filesToClean) {
      try {
        fs.unlinkSync(file);
        this.logger.log(`Cleaned up temp file: ${file}`);
      } catch (cleanupError) {
        this.logger.warn(
          `Failed to cleanup temp file: ${file}`,
          cleanupError instanceof Error
            ? cleanupError.message
            : String(cleanupError),
        );
      }
    }
  }
}
