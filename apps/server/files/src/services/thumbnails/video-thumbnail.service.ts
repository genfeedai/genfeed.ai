import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import { ConfigService } from '@files/config/config.service';
import { FFmpegService } from '@files/services/ffmpeg/services/ffmpeg.service';
import { S3Service } from '@files/services/s3/s3.service';
import { LoggerService } from '@libs/logger/logger.service';
import { assertSafeSegment, resolveContainedPath } from '@libs/security';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import sharp from 'sharp';

const createBadRequest = (message: string) => new BadRequestException(message);

@Injectable()
export class VideoThumbnailService {
  private readonly constructorName = this.constructor.name;

  constructor(
    private readonly loggerService: LoggerService,
    private readonly ffmpegService: FFmpegService,
    private readonly s3Service: S3Service,
    @Optional() private readonly configService?: ConfigService,
  ) {}

  /**
   * Generate thumbnail from video and upload to S3
   * @param videoUrl - URL or S3 key of the video
   * @param ingredientId - ID of the ingredient/video
   * @param timeInSeconds - Time in seconds to extract frame (default: 1)
   * @param width - Thumbnail width (default: 720, will maintain aspect ratio)
   * @returns Public URL of the uploaded thumbnail
   */
  async generateThumbnail(
    videoUrl: string,
    ingredientId: string,
    timeInSeconds: number = 1,
    width: number = 720,
  ): Promise<string> {
    const safeIngredientId = assertSafeSegment(
      ingredientId,
      'ingredientId',
      createBadRequest,
    );
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const thumbnailStartTime = Date.now();

    this.loggerService.log(`${url} started`, {
      ingredientId,
      timeInSeconds,
      videoUrl,
      width,
    });

    try {
      const tempPath = this.ffmpegService.getTempPath(
        'thumbnail',
        safeIngredientId,
      );

      const videoPath = resolveContainedPath(
        tempPath,
        'input.mp4',
        createBadRequest,
      );
      const thumbnailPath = resolveContainedPath(
        tempPath,
        'thumbnail.jpg',
        createBadRequest,
      );

      // Ensure temp directory exists
      if (!fs.existsSync(tempPath)) {
        fs.mkdirSync(tempPath, { recursive: true });
      }

      // Download video from URL or S3
      const downloadStartTime = Date.now();
      if (videoUrl.startsWith('http://') || videoUrl.startsWith('https://')) {
        await this.s3Service.downloadFromUrl(videoUrl, videoPath);
      } else {
        // Assume it's an S3 key
        await this.s3Service.downloadFile(videoUrl, videoPath);
      }
      const downloadDuration = Date.now() - downloadStartTime;

      const videoSizeMB = fs.existsSync(videoPath)
        ? (fs.statSync(videoPath).size / (1024 * 1024)).toFixed(2)
        : 'unknown';

      this.loggerService.log(`${url} video downloaded`, {
        downloadDuration: `${downloadDuration}ms`,
        ingredientId,
        videoSize: `${videoSizeMB} MB`,
        videoUrl,
      });

      // Extract frame at specified time
      const extractStartTime = Date.now();
      await this.ffmpegService.extractFrame(
        videoPath,
        thumbnailPath,
        timeInSeconds,
      );
      const extractDuration = Date.now() - extractStartTime;

      this.loggerService.log(`${url} frame extracted`, {
        extractDuration: `${extractDuration}ms`,
        ingredientId,
        timeInSeconds,
      });

      // Resize thumbnail using sharp (maintain aspect ratio)
      const resizeStartTime = Date.now();
      const resizedThumbnailBuffer = await sharp(thumbnailPath)
        .resize(width, null, { withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
      const resizeDuration = Date.now() - resizeStartTime;

      const thumbnailSizeKB = (resizedThumbnailBuffer.length / 1024).toFixed(2);

      const resizedThumbnailPath = resolveContainedPath(
        tempPath,
        'thumbnail_resized.jpg',
        createBadRequest,
      );
      fs.writeFileSync(resizedThumbnailPath, resizedThumbnailBuffer);

      this.loggerService.log(`${url} thumbnail resized`, {
        ingredientId,
        resizeDuration: `${resizeDuration}ms`,
        thumbnailSize: `${thumbnailSizeKB} KB`,
        width,
      });

      const { s3Key, publicUrl, uploadDuration } = await this.uploadThumbnail(
        resizedThumbnailPath,
        safeIngredientId,
      );
      const totalDuration = Date.now() - thumbnailStartTime;

      // Cleanup temp files
      this.ffmpegService.cleanupTempFiles(
        videoPath,
        thumbnailPath,
        resizedThumbnailPath,
      );

      this.loggerService.log(`${url} succeeded`, {
        downloadDuration: `${downloadDuration}ms`,
        extractDuration: `${extractDuration}ms`,
        ingredientId,
        resizeDuration: `${resizeDuration}ms`,
        s3Key,
        thumbnailSize: `${thumbnailSizeKB} KB`,
        thumbnailUrl: publicUrl,
        totalDuration: `${totalDuration}ms`,
        uploadDuration: `${uploadDuration}ms`,
      });

      return publicUrl;
    } catch (error: unknown) {
      const totalDuration = Date.now() - thumbnailStartTime;
      this.loggerService.error(`${url} failed`, error, {
        duration: `${totalDuration}ms`,
        ingredientId,
        videoUrl,
      });
      throw error;
    }
  }

  private async uploadThumbnail(
    thumbnailPath: string,
    ingredientId: string,
  ): Promise<{ s3Key: string; publicUrl: string; uploadDuration: number }> {
    const requestedKey = this.s3Service.generateS3Key(
      'thumbnails',
      this.configService?.isAuthorizedMediaDeliveryEnabled
        ? randomUUID()
        : ingredientId,
    );
    const uploadStartTime = Date.now();
    const uploaded = await this.s3Service.uploadFile(
      requestedKey,
      thumbnailPath,
      'image/jpeg',
    );
    const uploadDuration = Date.now() - uploadStartTime;
    if (this.configService?.isAuthorizedMediaDeliveryEnabled && !uploaded?.Key)
      throw new Error('Thumbnail upload returned no stored key');
    const s3Key = uploaded?.Key ?? requestedKey;
    const publicUrl = this.configService?.isAuthorizedMediaDeliveryEnabled
      ? await this.s3Service.getPresignedDownloadUrlForStoredKey(s3Key, 300)
      : this.s3Service.getPublicUrl(s3Key);
    return { s3Key, publicUrl, uploadDuration };
  }

  /**
   * Generate thumbnail from video S3 key
   * Convenience method that extracts ingredientId from S3 key or uses provided ID
   */
  generateThumbnailFromS3Key(
    s3Key: string,
    ingredientId: string,
    timeInSeconds?: number,
  ): Promise<string> {
    const videoUrl = this.s3Service.getPublicUrl(s3Key);
    return this.generateThumbnail(videoUrl, ingredientId, timeInSeconds);
  }
}
