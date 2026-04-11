import * as fs from 'node:fs';
import path from 'node:path';
import { ConfigService } from '@files/config/config.service';
import { FFmpegService } from '@files/services/ffmpeg/services/ffmpeg.service';
import type { StorageProvider } from '@genfeedai/storage';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpService } from '@nestjs/axios';
import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import sharp from 'sharp';

type UploadSource =
  | { type: 'file'; path: string }
  | { type: 'url'; url: string }
  | { type: 'base64'; data: string; contentType: string }
  | { type: 'buffer'; data: Buffer; contentType: string };

@Injectable()
export class UploadService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    @Inject(FFmpegService) private readonly ffmpegService: FFmpegService,
    @Inject(HttpService) private readonly httpService: HttpService,
    private readonly loggerService: LoggerService,
    @Inject('STORAGE_PROVIDER') private readonly storage: StorageProvider,
  ) {}

  private async getVideoDimensions(filePath: string): Promise<{
    width: number;
    height: number;
    duration: number;
    hasAudio: boolean;
  }> {
    const metadata = await this.ffmpegService.getVideoMetadata(filePath);
    const videoStream = metadata.streams?.find(
      (s: unknown) => s.codec_type === 'video',
    );
    const audioStream = metadata.streams?.find(
      (s: unknown) => s.codec_type === 'audio',
    );
    return {
      duration: Number(metadata.format?.duration) || 0,
      hasAudio: !!audioStream,
      height: videoStream?.height || 0,
      width: videoStream?.width || 0,
    };
  }

  /**
   * Extract video dimensions from a buffer by writing to temp file
   * Handles temp file creation and cleanup automatically
   */
  private async getVideoDimensionsFromBuffer(
    buffer: Buffer,
    key: string,
  ): Promise<{
    width: number;
    height: number;
    duration: number;
    hasAudio: boolean;
  }> {
    const tmpDir = path.resolve('public', 'tmp');
    // Ensure tmp directory exists
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    const tmpPath = path.resolve(tmpDir, `${key}.mp4`);
    try {
      fs.writeFileSync(tmpPath, buffer);
      return await this.getVideoDimensions(tmpPath);
    } finally {
      // Ensure cleanup even if errors occur
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
      }
    }
  }

  private async getImageDimensions(
    input: Buffer | string,
  ): Promise<{ width: number; height: number }> {
    // Auto-rotate to get correct dimensions based on EXIF orientation
    const metadata = await sharp(input).rotate().metadata();
    return { height: metadata.height || 0, width: metadata.width || 0 };
  }

  async uploadToS3(
    key: string,
    type: string,
    source: UploadSource,
  ): Promise<{
    width?: number;
    height?: number;
    duration?: number;
    size?: number;
    hasAudio?: boolean;
    publicUrl: string;
  }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const uploadStartTime = Date.now();
    let body: Buffer;
    let contentType: string;
    let res;
    let base64Data;
    let filePath: string;
    let width: number | undefined;
    let height: number | undefined;
    let duration: number | undefined;
    let hasAudio: boolean = false;

    this.loggerService.log(`${url} starting upload`, {
      key,
      sourceType: source.type,
      type,
      ...(source.type === 'url' && { url: source.url }),
      ...(source.type === 'file' && { path: source.path }),
    });

    try {
      const prepareStartTime = Date.now();
      switch (source.type) {
        case 'file':
          filePath = source.path;
          contentType = 'application/octet-stream';

          if (filePath.match(/\.mp4$/i)) {
            contentType = 'video/mp4';
            const meta = await this.getVideoDimensions(source.path);
            width = meta.width;
            height = meta.height;
            duration = meta.duration;
            hasAudio = meta.hasAudio;

            body = fs.readFileSync(filePath);
          } else if (filePath.match(/\.zip$/i)) {
            // ZIP archives: upload as-is without image probing
            contentType = 'application/zip';
            body = fs.readFileSync(filePath);
          } else if (filePath.match(/\.jpe?g$/i)) {
            contentType = 'image/jpeg';
            const buffer = fs.readFileSync(filePath);
            ({ width, height } = await this.getImageDimensions(buffer));
            body = buffer;
          } else if (filePath.match(/\.png$/i)) {
            contentType = 'image/png';
            const buffer = fs.readFileSync(filePath);
            ({ width, height } = await this.getImageDimensions(buffer));
            body = buffer;
          } else if (filePath.match(/\.webp$/i)) {
            contentType = 'image/webp';
            const buffer = fs.readFileSync(filePath);
            ({ width, height } = await this.getImageDimensions(buffer));
            body = buffer;
          } else {
            // Fallback: read file and upload as octet-stream
            body = fs.readFileSync(filePath);
          }
          break;

        case 'url': {
          const remoteUrl = source.url;
          if (!remoteUrl || typeof remoteUrl !== 'string') {
            throw new HttpException(
              'URL is required and must be a string',
              HttpStatus.BAD_REQUEST,
            );
          }
          try {
            new URL(remoteUrl);
          } catch (error: unknown) {
            throw new HttpException(
              `Invalid URL: ${remoteUrl}`,
              HttpStatus.BAD_REQUEST,
              { cause: (error as Error)?.message || 'Invalid URL' },
            );
          }

          this.loggerService.log(`${url} downloading remote file`, {
            key,
            url: remoteUrl,
          });

          try {
            const downloadStartTime = Date.now();
            res = await firstValueFrom(
              this.httpService.get(remoteUrl, {
                maxBodyLength: 200 * 1024 * 1024,
                maxContentLength: 200 * 1024 * 1024,
                responseType: 'arraybuffer',
                timeout: 60000,
              }),
            );
            const downloadDuration = Date.now() - downloadStartTime;

            body = Buffer.from(res.data);
            contentType = this.resolveContentType(
              res.headers['content-type'],
              remoteUrl,
            );

            this.loggerService.log(`${url} remote download completed`, {
              bufferSize: `${(body.length / (1024 * 1024)).toFixed(2)} MB`,
              contentType,
              downloadDuration: `${downloadDuration}ms`,
              key,
              url: remoteUrl,
            });
          } catch (error: unknown) {
            const parsedError = error as {
              code?: string;
              message?: string;
              response?: { status?: number };
            };
            this.loggerService.error(
              'Failed to download file directly from URL',
              parsedError,
            );

            if (parsedError?.code === 'ERR_FR_MAX_BODY_LENGTH_EXCEEDED') {
              throw new HttpException(
                'File size exceeds 200MB limit',
                HttpStatus.PAYLOAD_TOO_LARGE,
              );
            }

            throw new HttpException(
              `Failed to download file from URL: ${parsedError?.message || 'Unknown error'}`,
              HttpStatus.BAD_REQUEST,
            );
          }

          if (contentType.startsWith('video/')) {
            const videoMeta = await this.getVideoDimensionsFromBuffer(
              body,
              key,
            );
            width = videoMeta.width;
            height = videoMeta.height;
            duration = videoMeta.duration;
            hasAudio = videoMeta.hasAudio;
          } else if (contentType.startsWith('image/')) {
            ({ width, height } = await this.getImageDimensions(body));
          } else if (remoteUrl.match(/\.zip$/i)) {
            contentType = 'application/zip';
          }

          break;
        }

        case 'base64':
          base64Data = source.data.replace(/^data:[^;]+;base64,/, '');
          body = Buffer.from(base64Data, 'base64');
          contentType = source.contentType;
          if (contentType.startsWith('video/')) {
            const meta = await this.getVideoDimensionsFromBuffer(body, key);
            width = meta.width;
            height = meta.height;
            duration = meta.duration;
            hasAudio = meta.hasAudio;
            contentType = 'video/mp4';
          } else if (contentType.startsWith('image/')) {
            ({ width, height } = await this.getImageDimensions(body));
          }
          break;

        case 'buffer':
          body = source.data;
          contentType = source.contentType;

          if (contentType.startsWith('video/')) {
            const meta = await this.getVideoDimensionsFromBuffer(body, key);
            width = meta.width;
            height = meta.height;
            duration = meta.duration;
            hasAudio = meta.hasAudio;
            contentType = 'video/mp4';
          } else if (contentType.startsWith('image/')) {
            ({ width, height } = await this.getImageDimensions(body));
          }
          break;

        default:
          throw new Error('Invalid upload source type');
      }

      const prepareDuration = Date.now() - prepareStartTime;
      const bufferSizeMB = (body.length / (1024 * 1024)).toFixed(2);

      this.loggerService.log(`${url} file preparation completed`, {
        bufferSize: `${bufferSizeMB} MB`,
        bufferSizeBytes: body.length,
        contentType,
        key,
        prepareDuration: `${prepareDuration}ms`,
        sourceType: source.type,
        ...(width && height && { dimensions: `${width}x${height}` }),
        ...(duration && { duration: `${duration}s` }),
        ...(hasAudio !== undefined && { hasAudio }),
      });

      // Image processing (compression, rotation, format conversion)
      let imageProcessingDuration = 0;
      if (contentType.startsWith('image/')) {
        const imageProcessingStart = Date.now();
        const originalSizeBytes = body.length;
        const quality = Number(
          this.configService.get('AWS_IMAGE_COMPRESSION') || '90',
        );
        const processor = sharp(body).rotate(); // Auto-rotate based on EXIF orientation

        if (contentType.includes('png')) {
          body = await processor
            .png({ compressionLevel: 9, quality })
            .toBuffer();
          contentType = 'image/png';
        } else if (contentType.includes('webp')) {
          body = await processor.webp({ quality }).toBuffer();
          contentType = 'image/webp';
        } else {
          body = await processor.jpeg({ quality }).toBuffer();
          contentType = 'image/jpeg';
        }
        imageProcessingDuration = Date.now() - imageProcessingStart;

        const processedSizeMB = (body.length / (1024 * 1024)).toFixed(2);
        const originalSizeMB = (originalSizeBytes / (1024 * 1024)).toFixed(2);
        this.loggerService.log(`${url} image processing completed`, {
          compressionRatio: `${((1 - body.length / originalSizeBytes) * 100).toFixed(1)}%`,
          imageProcessingDuration: `${imageProcessingDuration}ms`,
          key,
          originalSize: `${originalSizeMB} MB`,
          processedSize: `${processedSizeMB} MB`,
        });
      }

      // Generate storage path: ingredients/${type}/${key}
      const storagePath = `ingredients/${type}/${key}`;

      // Upload using storage provider (returns public URL)
      const s3UploadStartTime = Date.now();
      this.loggerService.log(`${url} starting storage upload`, {
        bufferSize: `${(body.length / (1024 * 1024)).toFixed(2)} MB`,
        contentType,
        key,
        storagePath,
      });

      const publicUrl = await this.storage.upload(body, storagePath);

      const s3UploadDuration = Date.now() - s3UploadStartTime;
      const totalDuration = Date.now() - uploadStartTime;

      this.loggerService.log(`${url} upload completed successfully`, {
        bufferSize: `${(body.length / (1024 * 1024)).toFixed(2)} MB`,
        contentType,
        key,
        prepareDuration: `${prepareDuration}ms`,
        publicUrl,
        storagePath,
        ...(imageProcessingDuration > 0 && {
          imageProcessingDuration: `${imageProcessingDuration}ms`,
        }),
        s3UploadDuration: `${s3UploadDuration}ms`,
        totalDuration: `${totalDuration}ms`,
        ...(width && height && { dimensions: `${width}x${height}` }),
        ...(duration && { duration: `${duration}s` }),
        ...(hasAudio !== undefined && { hasAudio }),
      });

      return {
        duration: duration || 0,
        hasAudio,
        height: height || 0,
        publicUrl,
        size: body.length,
        width: width || 0,
      };
    } catch (error: unknown) {
      const totalDuration = Date.now() - uploadStartTime;
      const parsedError = error as {
        response?: { status?: number };
        stack?: string;
        message?: string;
      };
      this.loggerService.error(`${url} upload failed`, {
        duration: `${totalDuration}ms`,
        error: (error as Error)?.message,
        key,
        sourceType: source.type,
        type,
        ...(parsedError?.response && {
          statusCode: parsedError.response.status,
        }),
        ...(parsedError?.stack && { stack: parsedError.stack }),
      });

      throw error;
    }
  }

  private resolveContentType(headerValue?: string, url?: string): string {
    if (headerValue && typeof headerValue === 'string') {
      return headerValue;
    }

    if (!url) {
      return 'application/octet-stream';
    }

    const extension = this.getExtensionFromUrl(url);
    switch (extension) {
      case '.mp4':
      case '.mov':
      case '.webm':
      case '.mkv':
        return 'video/mp4';
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.png':
        return 'image/png';
      case '.webp':
        return 'image/webp';
      case '.gif':
        return 'image/gif';
      case '.zip':
        return 'application/zip';
      default:
        return 'application/octet-stream';
    }
  }

  private getExtensionFromUrl(url: string): string {
    try {
      const parsed = new URL(url);
      return path.extname(parsed.pathname).toLowerCase();
    } catch {
      return path.extname(url).toLowerCase();
    }
  }
}
