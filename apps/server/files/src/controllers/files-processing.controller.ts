import * as fs from 'node:fs';
import path from 'node:path';
import { FFmpegService } from '@files/services/ffmpeg/services/ffmpeg.service';
import { FilesService } from '@files/services/files/files.service';
import { ImagesSplitService } from '@files/services/images/images-split.service';
import { VideoThumbnailService } from '@files/services/thumbnails/video-thumbnail.service';
import { UploadService } from '@files/services/upload/upload.service';
import { LoggerService } from '@libs/logger/logger.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
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
        getErrorMessage(error, {
          emptyMessage: 'fallback',
          fallback: () => 'Failed to generate thumbnail',
        }),
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
        getErrorMessage(error, {
          emptyMessage: 'fallback',
          fallback: () => 'Failed to resize image',
        }),
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
        getErrorMessage(error, {
          emptyMessage: 'fallback',
          fallback: () => 'Failed to split image',
        }),
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Deterministic video QA: ffprobe + blackdetect/freezedetect/ebur128.
   * Optional contact sheet is a review artifact, not a vision score.
   */
  @Post('processing/video-qa')
  async inspectVideoQa(
    @Body()
    body: {
      videoUrl: string;
      isContactSheetEnabled?: boolean;
      blackDurationSeconds?: number;
      freezeDurationSeconds?: number;
    },
  ) {
    let videoTempPath: string | undefined;
    let contactSheetPath: string | undefined;

    try {
      const { videoUrl, isContactSheetEnabled = false } = body;
      const blackDurationSeconds =
        typeof body.blackDurationSeconds === 'number' &&
        body.blackDurationSeconds > 0
          ? body.blackDurationSeconds
          : 0.5;
      const freezeDurationSeconds =
        typeof body.freezeDurationSeconds === 'number' &&
        body.freezeDurationSeconds > 0
          ? body.freezeDurationSeconds
          : 2;

      if (!videoUrl) {
        throw new HttpException('videoUrl is required', HttpStatus.BAD_REQUEST);
      }

      const tmpDir = this.ffmpegService.getTempPath('video-qa');
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(7);

      this.logger.log(`Downloading video for QA from: ${videoUrl}`);
      const videoResponse = await firstValueFrom(
        this.httpService.get(videoUrl, {
          maxContentLength: 500 * 1024 * 1024,
          responseType: 'arraybuffer',
          timeout: 120000,
        }),
      );
      videoTempPath = path.resolve(
        tmpDir,
        `video_${timestamp}_${randomSuffix}.mp4`,
      );
      fs.writeFileSync(videoTempPath, Buffer.from(videoResponse.data));

      if (isContactSheetEnabled) {
        contactSheetPath = path.resolve(
          tmpDir,
          `sheet_${timestamp}_${randomSuffix}.png`,
        );
      }

      const inspection = await this.ffmpegService.inspectVideoQa(
        videoTempPath,
        {
          blackDurationSeconds,
          contactSheetPath,
          freezeDurationSeconds,
        },
      );

      let contactSheetUrl: string | null = null;
      if (
        contactSheetPath &&
        fs.existsSync(contactSheetPath) &&
        fs.statSync(contactSheetPath).size > 0
      ) {
        const sheetKey = `video-qa/${timestamp}_${randomSuffix}_contact.png`;
        const uploaded = await this.uploadService.uploadToS3(
          sheetKey,
          'images',
          {
            path: contactSheetPath,
            type: 'file',
          },
        );
        contactSheetUrl = uploaded.publicUrl;
      }

      return {
        contactSheetUrl,
        decodeOk: inspection.decodeOk,
        detectLog: inspection.detectLog,
        loudnessLog: inspection.loudnessLog,
        probeJson: inspection.probeJson,
      };
    } catch (error: unknown) {
      this.logger.error('Failed to inspect video QA:', error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        getErrorMessage(error, {
          emptyMessage: 'fallback',
          fallback: () => 'Failed to inspect video QA',
        }),
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    } finally {
      const filesToClean = [videoTempPath, contactSheetPath].filter(
        (file): file is string => !!file && fs.existsSync(file),
      );
      for (const file of filesToClean) {
        try {
          fs.unlinkSync(file);
        } catch (cleanupError) {
          this.logger.warn(
            `Failed to cleanup temp file: ${file}`,
            getErrorMessage(cleanupError, {
              fallback: String,
              messageSource: 'error-instance',
            }),
          );
        }
      }
    }
  }
}
