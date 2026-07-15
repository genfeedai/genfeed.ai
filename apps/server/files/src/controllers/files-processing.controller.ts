import * as fs from 'node:fs';
import path from 'node:path';
import { FFmpegService } from '@files/services/ffmpeg/services/ffmpeg.service';
import { FilesService } from '@files/services/files/files.service';
import { ImagesSplitService } from '@files/services/images/images-split.service';
import { VideoThumbnailService } from '@files/services/thumbnails/video-thumbnail.service';
import { UploadService } from '@files/services/upload/upload.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Inject,
  Post,
} from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

@Controller('files')
export class FilesProcessingController {
  constructor(
    @Inject(FFmpegService) private readonly ffmpegService: FFmpegService,
    @Inject(FilesService) private readonly filesService: FilesService,
    @Inject(HttpService) private readonly httpService: HttpService,
    @Inject(ImagesSplitService)
    private readonly imagesSplitService: ImagesSplitService,
    private readonly logger: LoggerService,
    @Inject(UploadService) private readonly uploadService: UploadService,
    @Inject(VideoThumbnailService)
    private readonly videoThumbnailService: VideoThumbnailService,
  ) {}

  /**
   * Overlay audio onto video with various mix modes
   * Supports: replace (replace video audio), mix (blend both), background (audio as background music)
   */
  @Post('processing/audio-overlay')
  async audioOverlay(
    @Body()
    body: {
      videoUrl: string;
      audioUrl: string;
      mixMode?: 'replace' | 'mix' | 'background';
      audioVolume?: number;
      videoVolume?: number;
      fadeIn?: number;
      fadeOut?: number;
      outputKey?: string;
    },
  ) {
    let videoTempPath: string | undefined;
    let audioTempPath: string | undefined;
    let outputTempPath: string | undefined;

    try {
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

      if (!videoUrl || !audioUrl) {
        throw new HttpException(
          'videoUrl and audioUrl are required',
          HttpStatus.BAD_REQUEST,
        );
      }

      this.logger.log(
        `Processing audio overlay: mode=${mixMode}, audioVol=${audioVolume}%, videoVol=${videoVolume}%`,
      );

      // Create temp directory
      const tmpDir = this.ffmpegService.getTempPath('audio-overlay');
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(7);

      // Download video
      this.logger.log(`Downloading video from: ${videoUrl}`);
      const videoResponse = await firstValueFrom(
        this.httpService.get(videoUrl, {
          maxContentLength: 500 * 1024 * 1024, // 500MB limit
          responseType: 'arraybuffer',
          timeout: 120000, // 2 minute timeout
        }),
      );
      videoTempPath = path.resolve(
        tmpDir,
        `video_${timestamp}_${randomSuffix}.mp4`,
      );
      fs.writeFileSync(videoTempPath, Buffer.from(videoResponse.data));
      this.logger.log(`Video downloaded to: ${videoTempPath}`);

      // Download audio
      this.logger.log(`Downloading audio from: ${audioUrl}`);
      const audioResponse = await firstValueFrom(
        this.httpService.get(audioUrl, {
          maxContentLength: 100 * 1024 * 1024, // 100MB limit
          responseType: 'arraybuffer',
          timeout: 60000, // 1 minute timeout
        }),
      );

      // Determine audio extension from Content-Type or URL
      const rawAudioContentType = audioResponse.headers['content-type'];
      const audioContentType =
        (typeof rawAudioContentType === 'string'
          ? rawAudioContentType
          : undefined) || 'audio/mpeg';
      let audioExt = '.mp3';
      if (audioContentType.includes('wav')) {
        audioExt = '.wav';
      } else if (audioContentType.includes('ogg')) {
        audioExt = '.ogg';
      } else if (audioContentType.includes('m4a')) {
        audioExt = '.m4a';
      } else if (audioContentType.includes('aac')) {
        audioExt = '.aac';
      }

      audioTempPath = path.resolve(
        tmpDir,
        `audio_${timestamp}_${randomSuffix}${audioExt}`,
      );
      fs.writeFileSync(audioTempPath, Buffer.from(audioResponse.data));
      this.logger.log(`Audio downloaded to: ${audioTempPath}`);

      // Output path
      outputTempPath = path.resolve(
        tmpDir,
        `output_${timestamp}_${randomSuffix}.mp4`,
      );

      // Process audio overlay
      this.logger.log(`Processing audio overlay with FFmpeg...`);
      await this.ffmpegService.overlayAudio(
        videoTempPath,
        audioTempPath,
        outputTempPath,
        {
          audioVolume,
          fadeIn,
          fadeOut,
          mixMode,
          videoVolume,
        },
      );
      this.logger.log(`Audio overlay complete: ${outputTempPath}`);

      // Upload to S3
      const finalKey =
        outputKey || `audio-overlay/${timestamp}_${randomSuffix}.mp4`;
      this.logger.log(`Uploading result to S3: ${finalKey}`);

      const uploadResult = await this.uploadService.uploadToS3(
        finalKey,
        'videos',
        {
          path: outputTempPath,
          type: 'file',
        },
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
        (error as Error)?.message || 'Failed to process audio overlay',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    } finally {
      // Cleanup temp files
      const filesToClean = [
        videoTempPath,
        audioTempPath,
        outputTempPath,
      ].filter((f): f is string => !!f && fs.existsSync(f));

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

  @Post('processing/generate-thumbnail')
  async generateThumbnail(
    @Body()
    body: {
      videoUrl: string;
      ingredientId: string;
      timeInSeconds?: number;
      width?: number;
    },
  ) {
    try {
      const { videoUrl, ingredientId, timeInSeconds, width } = body;

      if (!videoUrl || !ingredientId) {
        throw new HttpException(
          'videoUrl and ingredientId are required',
          HttpStatus.BAD_REQUEST,
        );
      }

      this.logger.log(
        `Generating thumbnail for video: ${videoUrl}, ingredient: ${ingredientId}`,
      );

      const thumbnailUrl = await this.videoThumbnailService.generateThumbnail(
        videoUrl,
        ingredientId,
        timeInSeconds,
        width,
      );

      return {
        ingredientId,
        thumbnailUrl,
      };
    } catch (error: unknown) {
      this.logger.error('Failed to generate thumbnail:', error);
      throw new HttpException(
        (error as Error)?.message || 'Failed to generate thumbnail',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Resize an image from a URL or base64 payload.
   */
  @Post('processing/resize-image')
  async resizeImage(
    @Body()
    body: {
      imageData?: string;
      imageUrl?: string;
      width: number;
      height: number;
    },
  ) {
    try {
      const { imageData, imageUrl, width, height } = body;

      if (!Number.isFinite(width) || width <= 0) {
        throw new HttpException(
          'width must be a positive number',
          HttpStatus.BAD_REQUEST,
        );
      }

      if (!Number.isFinite(height) || height <= 0) {
        throw new HttpException(
          'height must be a positive number',
          HttpStatus.BAD_REQUEST,
        );
      }

      if (!imageData && !imageUrl) {
        throw new HttpException(
          'imageData or imageUrl is required',
          HttpStatus.BAD_REQUEST,
        );
      }

      let imageBuffer: Buffer;

      if (imageData) {
        imageBuffer = Buffer.from(imageData, 'base64');
      } else {
        const response = await firstValueFrom(
          this.httpService.get(imageUrl as string, {
            maxContentLength: 50 * 1024 * 1024,
            responseType: 'arraybuffer',
            timeout: 30000,
          }),
        );
        imageBuffer = Buffer.from(response.data);
      }

      const resizedImage = await this.filesService.resizeImage(imageBuffer, {
        height,
        width,
      });

      return {
        data: resizedImage.toString('base64'),
        height,
        size: resizedImage.length,
        width,
      };
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error('Failed to resize image:', error);
      throw new HttpException(
        (error as Error)?.message || 'Failed to resize image',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Split a contact sheet image into individual frames
   */
  @Post('processing/split-image')
  async splitImage(
    @Body()
    body: {
      imageUrl: string;
      gridRows: number;
      gridCols: number;
      borderInset?: number;
    },
  ) {
    try {
      const { imageUrl, gridRows, gridCols, borderInset } = body;

      if (!imageUrl || !gridRows || !gridCols) {
        throw new HttpException(
          'imageUrl, gridRows, and gridCols are required',
          HttpStatus.BAD_REQUEST,
        );
      }

      if (gridRows < 2 || gridRows > 4 || gridCols < 2 || gridCols > 4) {
        throw new HttpException(
          'gridRows and gridCols must be between 2 and 4',
          HttpStatus.BAD_REQUEST,
        );
      }

      this.logger.log(
        `Splitting contact sheet: ${gridRows}x${gridCols}, inset: ${borderInset ?? 10}px`,
      );

      // Download the image
      const response = await firstValueFrom(
        this.httpService.get(imageUrl, {
          maxContentLength: 50 * 1024 * 1024, // 50MB limit
          responseType: 'arraybuffer',
          timeout: 30000, // 30 second timeout
        }),
      );

      const imageBuffer = Buffer.from(response.data);

      // Split the image
      const splitResults = await this.imagesSplitService.splitImage(
        imageBuffer,
        gridRows,
        gridCols,
        borderInset ?? 10,
      );

      const frames = splitResults.map((result) =>
        result.buffer.toString('base64'),
      );

      return {
        count: frames.length,
        frames,
        gridCols,
        gridRows,
      };
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error('Failed to split image:', error);
      throw new HttpException(
        (error as Error)?.message || 'Failed to split image',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
