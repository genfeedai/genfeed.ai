import * as fs from 'node:fs';
import path from 'node:path';
import { ConfigService } from '@files/config/config.service';
import { FILES_TMP_ROOT } from '@files/constants/path.constants';
import { FFmpegService } from '@files/services/ffmpeg/services/ffmpeg.service';
import type { StorageProvider } from '@genfeedai/storage';
import { LoggerService } from '@libs/logger/logger.service';
import {
  resolveContainedObjectKey,
  resolveContainedPath,
} from '@libs/security';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import sharp from 'sharp';

type UploadSource =
  | { type: 'file'; path: string }
  | { type: 'url'; url: string }
  | { type: 'base64'; data: string; contentType: string }
  | { type: 'buffer'; data: Buffer; contentType: string };

type FileUploadSource = Extract<UploadSource, { type: 'file' }>;
type UrlUploadSource = Extract<UploadSource, { type: 'url' }>;

type PreparedUpload = {
  body: Buffer;
  contentType: string;
  width?: number;
  height?: number;
  duration?: number;
  hasAudio: boolean;
};

type ProcessedUpload = PreparedUpload & {
  imageProcessingDuration: number;
};

const createBadRequest = (message: string) => new BadRequestException(message);
const CDN_ROOT_UPLOAD_TYPES = new Set(['banners', 'logos', 'references']);

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
    const videoStream = metadata.streams?.find((s) => s.codec_type === 'video');
    const audioStream = metadata.streams?.find((s) => s.codec_type === 'audio');
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
    const tmpPath = resolveContainedPath(
      FILES_TMP_ROOT,
      `${key}.mp4`,
      createBadRequest,
    );
    const tmpDir = path.dirname(tmpPath);
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
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

  private async prepareFileUpload(
    source: FileUploadSource,
  ): Promise<PreparedUpload> {
    const filePath = resolveContainedPath(
      FILES_TMP_ROOT,
      source.path,
      createBadRequest,
    );
    let contentType = 'application/octet-stream';
    let width: number | undefined;
    let height: number | undefined;
    let duration: number | undefined;
    let hasAudio = false;
    let body: Buffer;

    if (filePath.match(/\.mp4$/i)) {
      contentType = 'video/mp4';
      const metadata = await this.getVideoDimensions(filePath);
      ({ width, height, duration, hasAudio } = metadata);
      body = fs.readFileSync(filePath);
    } else if (filePath.match(/\.zip$/i)) {
      contentType = 'application/zip';
      body = fs.readFileSync(filePath);
    } else if (filePath.match(/\.jpe?g$/i)) {
      contentType = 'image/jpeg';
      body = fs.readFileSync(filePath);
      ({ width, height } = await this.getImageDimensions(body));
    } else if (filePath.match(/\.png$/i)) {
      contentType = 'image/png';
      body = fs.readFileSync(filePath);
      ({ width, height } = await this.getImageDimensions(body));
    } else if (filePath.match(/\.webp$/i)) {
      contentType = 'image/webp';
      body = fs.readFileSync(filePath);
      ({ width, height } = await this.getImageDimensions(body));
    } else {
      body = fs.readFileSync(filePath);
    }

    return { body, contentType, duration, hasAudio, height, width };
  }

  private async downloadRemoteUpload(
    remoteUrl: string,
    key: string,
    url: string,
  ): Promise<Pick<PreparedUpload, 'body' | 'contentType'>> {
    this.loggerService.log(`${url} downloading remote file`, {
      key,
      url: remoteUrl,
    });

    try {
      const downloadStartTime = Date.now();
      const response = await firstValueFrom(
        this.httpService.get(remoteUrl, {
          maxBodyLength: 200 * 1024 * 1024,
          maxContentLength: 200 * 1024 * 1024,
          responseType: 'arraybuffer',
          timeout: 60000,
        }),
      );
      const body = Buffer.from(response.data);
      const rawContentType = response.headers['content-type'];
      const contentType = this.resolveContentType(
        typeof rawContentType === 'string' ? rawContentType : undefined,
        remoteUrl,
      );

      this.loggerService.log(`${url} remote download completed`, {
        bufferSize: `${(body.length / (1024 * 1024)).toFixed(2)} MB`,
        contentType,
        downloadDuration: `${Date.now() - downloadStartTime}ms`,
        key,
        url: remoteUrl,
      });

      return { body, contentType };
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
  }

  private async prepareUrlUpload(
    source: UrlUploadSource,
    key: string,
    url: string,
  ): Promise<PreparedUpload> {
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

    const prepared = await this.downloadRemoteUpload(remoteUrl, key, url);
    let { contentType } = prepared;
    let width: number | undefined;
    let height: number | undefined;
    let duration: number | undefined;
    let hasAudio = false;

    if (contentType.startsWith('video/')) {
      const metadata = await this.getVideoDimensionsFromBuffer(
        prepared.body,
        key,
      );
      ({ width, height, duration, hasAudio } = metadata);
    } else if (contentType.startsWith('image/')) {
      ({ width, height } = await this.getImageDimensions(prepared.body));
    } else if (remoteUrl.match(/\.zip$/i)) {
      contentType = 'application/zip';
    }

    return { ...prepared, contentType, duration, hasAudio, height, width };
  }

  private async prepareBinaryUpload(
    body: Buffer,
    contentType: string,
    key: string,
  ): Promise<PreparedUpload> {
    let width: number | undefined;
    let height: number | undefined;
    let duration: number | undefined;
    let hasAudio = false;

    if (contentType.startsWith('video/')) {
      const metadata = await this.getVideoDimensionsFromBuffer(body, key);
      ({ width, height, duration, hasAudio } = metadata);
      contentType = 'video/mp4';
    } else if (contentType.startsWith('image/')) {
      ({ width, height } = await this.getImageDimensions(body));
    }

    return { body, contentType, duration, hasAudio, height, width };
  }

  private async prepareUpload(
    source: UploadSource,
    key: string,
    url: string,
  ): Promise<PreparedUpload> {
    switch (source.type) {
      case 'file':
        return this.prepareFileUpload(source);
      case 'url':
        return this.prepareUrlUpload(source, key, url);
      case 'base64':
        return this.prepareBinaryUpload(
          Buffer.from(source.data.replace(/^data:[^;]+;base64,/, ''), 'base64'),
          source.contentType,
          key,
        );
      case 'buffer':
        return this.prepareBinaryUpload(source.data, source.contentType, key);
      default:
        throw new Error('Invalid upload source type');
    }
  }

  private async processImage(
    prepared: PreparedUpload,
    key: string,
    url: string,
  ): Promise<ProcessedUpload> {
    if (!prepared.contentType.startsWith('image/')) {
      return { ...prepared, imageProcessingDuration: 0 };
    }

    const imageProcessingStart = Date.now();
    const originalSizeBytes = prepared.body.length;
    const quality = Number(
      this.configService.get('AWS_IMAGE_COMPRESSION') || '90',
    );
    const processor = sharp(prepared.body).rotate();
    let body: Buffer;
    let contentType: string;

    if (prepared.contentType.includes('png')) {
      body = await processor.png({ compressionLevel: 9, quality }).toBuffer();
      contentType = 'image/png';
    } else if (prepared.contentType.includes('webp')) {
      body = await processor.webp({ quality }).toBuffer();
      contentType = 'image/webp';
    } else {
      body = await processor.jpeg({ quality }).toBuffer();
      contentType = 'image/jpeg';
    }

    const imageProcessingDuration = Date.now() - imageProcessingStart;
    this.loggerService.log(`${url} image processing completed`, {
      compressionRatio: `${((1 - body.length / originalSizeBytes) * 100).toFixed(1)}%`,
      imageProcessingDuration: `${imageProcessingDuration}ms`,
      key,
      originalSize: `${(originalSizeBytes / (1024 * 1024)).toFixed(2)} MB`,
      processedSize: `${(body.length / (1024 * 1024)).toFixed(2)} MB`,
    });

    return { ...prepared, body, contentType, imageProcessingDuration };
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

    this.loggerService.log(`${url} starting upload`, {
      key,
      sourceType: source.type,
      type,
      ...(source.type === 'url' && { url: source.url }),
      ...(source.type === 'file' && { path: source.path }),
    });

    try {
      const prepareStartTime = Date.now();
      const prepared = await this.prepareUpload(source, key, url);
      const prepareDuration = Date.now() - prepareStartTime;

      this.loggerService.log(`${url} file preparation completed`, {
        bufferSize: `${(prepared.body.length / (1024 * 1024)).toFixed(2)} MB`,
        bufferSizeBytes: prepared.body.length,
        contentType: prepared.contentType,
        key,
        prepareDuration: `${prepareDuration}ms`,
        sourceType: source.type,
        ...(prepared.width &&
          prepared.height && {
            dimensions: `${prepared.width}x${prepared.height}`,
          }),
        ...(prepared.duration && { duration: `${prepared.duration}s` }),
        hasAudio: prepared.hasAudio,
      });

      const processed = await this.processImage(prepared, key, url);
      const storagePath = CDN_ROOT_UPLOAD_TYPES.has(type)
        ? resolveContainedObjectKey(type, key, createBadRequest)
        : resolveContainedObjectKey(
            'ingredients',
            `${type}/${key}`,
            createBadRequest,
          );

      const s3UploadStartTime = Date.now();
      this.loggerService.log(`${url} starting storage upload`, {
        bufferSize: `${(processed.body.length / (1024 * 1024)).toFixed(2)} MB`,
        contentType: processed.contentType,
        key,
        storagePath,
      });

      const storedPath = await this.storage.upload(
        processed.body,
        storagePath,
        processed.contentType,
      );
      const publicUrl = this.storage.getUrl(storedPath);

      const s3UploadDuration = Date.now() - s3UploadStartTime;
      const totalDuration = Date.now() - uploadStartTime;

      this.loggerService.log(`${url} upload completed successfully`, {
        bufferSize: `${(processed.body.length / (1024 * 1024)).toFixed(2)} MB`,
        contentType: processed.contentType,
        key,
        prepareDuration: `${prepareDuration}ms`,
        publicUrl,
        storagePath: storedPath,
        ...(processed.imageProcessingDuration > 0 && {
          imageProcessingDuration: `${processed.imageProcessingDuration}ms`,
        }),
        s3UploadDuration: `${s3UploadDuration}ms`,
        totalDuration: `${totalDuration}ms`,
        ...(processed.width &&
          processed.height && {
            dimensions: `${processed.width}x${processed.height}`,
          }),
        ...(processed.duration && { duration: `${processed.duration}s` }),
        hasAudio: processed.hasAudio,
      });

      return {
        duration: processed.duration || 0,
        hasAudio: processed.hasAudio,
        height: processed.height || 0,
        publicUrl,
        size: processed.body.length,
        width: processed.width || 0,
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
