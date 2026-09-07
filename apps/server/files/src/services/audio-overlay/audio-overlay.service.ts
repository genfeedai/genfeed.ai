import * as fs from 'node:fs';
import path from 'node:path';
import { ConfigService } from '@files/config/config.service';
import { downloadPublicMedia } from '@files/services/audio-overlay/media-download';
import { FFmpegService } from '@files/services/ffmpeg/services/ffmpeg.service';
import { UploadService } from '@files/services/upload/upload.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';

const VIDEO_DOWNLOAD_LIMIT_BYTES = 500 * 1024 * 1024;
const AUDIO_DOWNLOAD_LIMIT_BYTES = 100 * 1024 * 1024;

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
  publicUrl: string;
  duration: number;
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
    private readonly logger: LoggerService,
    @Inject(UploadService) private readonly uploadService: UploadService,
    @Optional() private readonly configService?: ConfigService,
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
        publicUrl: uploadResult.publicUrl,
        duration: Number(
          (await this.ffmpegService.probe(paths.output)).format.duration,
        ),
        s3Key: `ingredients/videos/${finalKey}`,
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
    if (
      body.mixMode &&
      !['replace', 'mix', 'background'].includes(body.mixMode)
    ) {
      throw new HttpException('Invalid mixMode', HttpStatus.BAD_REQUEST);
    }
    if (!body.videoUrl || !body.audioUrl) {
      throw new HttpException(
        'videoUrl and audioUrl are required',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private async downloadVideo(videoUrl: string): Promise<Buffer> {
    return downloadPublicMedia(
      videoUrl,
      VIDEO_DOWNLOAD_LIMIT_BYTES,
      this.configService,
    );
  }

  private async downloadAudio(
    audioUrl: string,
  ): Promise<{ data: Buffer; extension: string }> {
    return {
      data: await downloadPublicMedia(
        audioUrl,
        AUDIO_DOWNLOAD_LIMIT_BYTES,
        this.configService,
      ),
      extension: '.mp3',
    };
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
