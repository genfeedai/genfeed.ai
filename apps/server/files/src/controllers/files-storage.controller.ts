import path from 'node:path';
import { S3Service } from '@files/services/s3/s3.service';
import { UploadService } from '@files/services/upload/upload.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Post,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';

type S3KeyGenerator = (type: string, key: string) => string;
const SKILLS_PRO_DOWNLOAD_KEY_PREFIX = 'skills/v1/';

export function resolvePresignedDownloadKey(
  type: string,
  key: string,
  generateS3Key: S3KeyGenerator,
): string {
  if (type === 'skills') {
    if (!key.startsWith(SKILLS_PRO_DOWNLOAD_KEY_PREFIX)) {
      throw new BadRequestException('Invalid Skills Pro download key');
    }
    return key;
  }
  return generateS3Key(type, key);
}

@Controller('files')
export class FilesStorageController {
  constructor(
    private readonly logger: LoggerService,
    @Inject(S3Service) private readonly s3Service: S3Service,
    @Inject(UploadService) private readonly uploadService: UploadService,
  ) {}

  /**
   * Upload file to S3 with metadata extraction and image processing
   */
  @Post('upload')
  async uploadFile(
    @Body()
    body: {
      key: string;
      type: string;
      source:
        | { type: 'file'; path: string }
        | { type: 'url'; url: string }
        | { type: 'base64'; data: string; contentType: string }
        | { type: 'buffer'; data: string; contentType: string }; // base64 encoded buffer
    },
  ) {
    try {
      const { key, type, source } = body;

      this.logger.log('Upload request received', {
        key,
        sourceType: source?.type,
        type,
        url: source?.type === 'url' ? source.url : undefined,
      });

      if (!key || !type || !source) {
        throw new HttpException(
          'key, type, and source are required',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Validate URL if source type is 'url'
      if (source.type === 'url') {
        if (!source.url || typeof source.url !== 'string') {
          this.logger.error('Invalid URL source', {
            source,
            url: source.url,
            urlType: typeof source.url,
          });
          throw new HttpException(
            'url is required and must be a string when source type is "url"',
            HttpStatus.BAD_REQUEST,
          );
        }
        // Basic URL validation
        try {
          new URL(source.url);
        } catch (urlError) {
          this.logger.error('Invalid URL format', {
            error: urlError,
            url: source.url,
          });
          throw new HttpException(
            `Invalid URL: ${source.url}`,
            HttpStatus.BAD_REQUEST,
          );
        }
      }

      // Convert base64 buffer to Buffer if needed
      let processedSource:
        | { type: 'file'; path: string }
        | { type: 'url'; url: string }
        | { type: 'base64'; data: string; contentType: string }
        | { type: 'buffer'; data: Buffer; contentType: string };

      if (source.type === 'buffer') {
        processedSource = {
          contentType: source.contentType,
          data: Buffer.from(source.data, 'base64'),
          type: 'buffer',
        };
      } else {
        processedSource = source;
      }

      const result = await this.uploadService.uploadToS3(
        key,
        type,
        processedSource,
      );

      return result;
    } catch (error: unknown) {
      this.logger.error('Failed to upload file:', error);

      // Preserve HttpException status codes
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        (error as Error)?.message || 'Failed to upload file',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Download file from S3
   */
  @Get('download/:type/*key')
  async downloadFile(
    @Param('type') type: string,
    @Param('key') key: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const keyString = typeof key === 'string' ? key : String(key);
      const s3Key = this.s3Service.generateS3Key(type, keyString);
      const stream = await this.s3Service.getFileStream(s3Key);

      const extension = path.extname(keyString).toLowerCase();
      let contentType = 'application/octet-stream';
      if (['.mp4', '.mov', '.avi', '.webm', '.mkv'].includes(extension)) {
        contentType = 'video/mp4';
      } else if (
        ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(extension)
      ) {
        contentType = `image/${extension.substring(1)}`;
      } else if (['.mp3', '.wav', '.ogg'].includes(extension)) {
        contentType = 'audio/mpeg';
      }

      res.set({
        'Content-Disposition': `attachment; filename="${keyString}"`,
        'Content-Type': contentType,
      });

      return new StreamableFile(stream);
    } catch (error: unknown) {
      this.logger.error('Failed to download file', {
        error: (error as Error)?.message || 'Unknown error',
        key: typeof key === 'string' ? key : String(key),
        statusCode:
          (error as { statusCode?: number })?.statusCode ||
          (error as { status?: number })?.status,
        type,
      });
      throw new HttpException(
        (error as Error)?.message || 'Failed to download file',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Copy file within S3
   */
  @Post('copy')
  async copyFile(
    @Body()
    body: {
      sourceKey: string;
      destinationKey: string;
      sourceType?: string;
      destinationType?: string;
    },
  ) {
    const { sourceKey, destinationKey, sourceType, destinationType } = body;

    if (!sourceKey || !destinationKey) {
      throw new HttpException(
        'sourceKey and destinationKey are required',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Generate S3 keys: if types are provided, use generateS3Key; otherwise assume keys are already full S3 keys
    const finalSourceKey = sourceType
      ? this.s3Service.generateS3Key(sourceType, sourceKey)
      : sourceKey;

    const finalDestinationKey = destinationType
      ? this.s3Service.generateS3Key(destinationType, destinationKey)
      : destinationKey;

    try {
      await this.s3Service.copyFile(finalSourceKey, finalDestinationKey);

      return {
        destinationKey: finalDestinationKey,
        publicUrl: this.s3Service.getPublicUrl(finalDestinationKey),
        sourceKey: finalSourceKey,
        success: true,
      };
    } catch (error: unknown) {
      const parsedError = error as {
        message?: string;
        code?: string;
        status?: number;
        statusCode?: number;
        stack?: string;
      };
      const errorMessage = parsedError?.message || 'Unknown error';

      const errorDetails = {
        code: parsedError?.code,
        destinationKey: finalDestinationKey,
        message: errorMessage,
        sourceKey: finalSourceKey,
        statusCode: parsedError?.status || parsedError?.statusCode,
      };

      this.logger.error(
        `Failed to copy file: ${errorMessage}`,
        parsedError?.stack || JSON.stringify(errorDetails),
      );

      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Get presigned upload URL
   */
  @Post('presigned-upload')
  async getPresignedUploadUrl(
    @Body()
    body: { filename: string; contentType: string; type: string },
  ) {
    try {
      const key = this.s3Service.generateS3Key(body.type, body.filename);

      const { uploadUrl, publicUrl } =
        await this.s3Service.getPresignedUploadUrl(
          key,
          body.contentType,
          3600, // 1 hour expiry
        );

      return {
        expiresIn: 3600,
        key,
        publicUrl,
        uploadUrl,
      };
    } catch (error: unknown) {
      this.logger.error('Failed to generate presigned upload URL:', error);
      throw new HttpException(
        (error as Error)?.message || 'Failed to generate presigned upload URL',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get presigned download URL
   */
  @Get('presigned-download/:type/*key')
  async getPresignedDownloadUrl(
    @Param('type') type: string,
    @Param('key') key: string,
  ) {
    try {
      const s3Key = resolvePresignedDownloadKey(
        type,
        key,
        this.s3Service.generateS3Key.bind(this.s3Service),
      );
      const downloadUrl = await this.s3Service.getPresignedDownloadUrl(
        s3Key,
        3600,
      );

      return {
        downloadUrl,
        expiresIn: 3600,
        key: s3Key,
      };
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error('Failed to generate presigned download URL:', error);
      throw new HttpException(
        (error as Error)?.message ||
          'Failed to generate presigned download URL',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
