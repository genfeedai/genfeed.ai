import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ConfigService } from '@files/config/config.service';
import { FILES_TMP_ROOT } from '@files/constants/path.constants';
import { FFmpegService } from '@files/services/ffmpeg/services/ffmpeg.service';
import type { StorageProvider } from '@genfeedai/storage';
import { LoggerService } from '@libs/logger/logger.service';
import {
  assertSafeObjectKey,
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
  body?: Buffer;
  filePath?: string;
  spooledPath?: string;
  size?: number;
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

  async deleteStoredObject(storageKey: string): Promise<void> {
    const safeStorageKey = assertSafeObjectKey(storageKey, createBadRequest);
    await this.storage.delete(safeStorageKey);
  }

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
  private async getVideoDimensionsFromBuffer(buffer: Buffer): Promise<{
    width: number;
    height: number;
    duration: number;
    hasAudio: boolean;
  }> {
    const tmpPath = resolveContainedPath(
      FILES_TMP_ROOT,
      `${randomUUID()}.mp4`,
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
    knownContentType?: string,
  ): Promise<PreparedUpload> {
    const filePath = resolveContainedPath(
      FILES_TMP_ROOT,
      source.path,
      createBadRequest,
    );
    const size = fs.statSync(filePath).size;
    // A transport-provided type (e.g. the HTTP Content-Type of a remote
    // download) wins over the extension sniff, which cannot classify
    // extension-less URLs and only knows a narrow extension list.
    const contentType =
      this.normalizeContentType(knownContentType) ??
      this.resolveContentType(undefined, filePath);
    let width: number | undefined;
    let height: number | undefined;
    let duration: number | undefined;
    let hasAudio = false;

    if (contentType.startsWith('video/')) {
      const metadata = await this.getVideoDimensions(filePath);
      ({ width, height, duration, hasAudio } = metadata);
    } else if (contentType.startsWith('image/')) {
      ({ width, height } = await this.getImageDimensions(filePath));
    }

    return {
      contentType,
      duration,
      filePath,
      hasAudio,
      height,
      size,
      width,
    };
  }

  private assertRemoteUrl(remoteUrl: string): void {
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
  }

  private async spoolRemoteUpload(
    remoteUrl: string,
    key: string,
    url: string,
  ): Promise<{ contentType: string; tmpPath: string }> {
    this.loggerService.log(`${url} downloading remote file`, {
      key,
      url: remoteUrl,
    });

    try {
      const downloadStartTime = Date.now();
      const response = await firstValueFrom(
        this.httpService.get<Readable>(remoteUrl, {
          maxBodyLength: 200 * 1024 * 1024,
          maxContentLength: 200 * 1024 * 1024,
          responseType: 'stream',
          timeout: 60000,
        }),
      );
      const rawContentType = response.headers['content-type'];
      const contentType = this.resolveContentType(
        typeof rawContentType === 'string' ? rawContentType : undefined,
        remoteUrl,
      );
      const extension = this.getExtensionFromContentType(contentType);
      const tmpPath = resolveContainedPath(
        FILES_TMP_ROOT,
        path.join('downloads', `${randomUUID()}${extension}`),
        createBadRequest,
      );
      const tmpDir = path.dirname(tmpPath);
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }

      await pipeline(response.data, fs.createWriteStream(tmpPath));

      this.loggerService.log(`${url} remote download completed`, {
        contentType,
        downloadDuration: `${Date.now() - downloadStartTime}ms`,
        key,
        path: tmpPath,
        url: remoteUrl,
      });

      return { contentType, tmpPath };
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
    this.assertRemoteUrl(source.url);
    const spooled = await this.spoolRemoteUpload(source.url, key, url);
    try {
      const prepared = await this.prepareFileUpload(
        { path: spooled.tmpPath, type: 'file' },
        spooled.contentType,
      );
      return { ...prepared, spooledPath: spooled.tmpPath };
    } catch (error: unknown) {
      // uploadToS3's finally only sees spooledPath once preparation returned;
      // a corrupt download (sharp/ffprobe failure) would otherwise leak the
      // spooled file in FILES_TMP_ROOT/downloads forever.
      if (fs.existsSync(spooled.tmpPath)) {
        fs.unlinkSync(spooled.tmpPath);
      }
      throw error;
    }
  }

  private async prepareBinaryUpload(
    body: Buffer,
    contentType: string,
  ): Promise<PreparedUpload> {
    let width: number | undefined;
    let height: number | undefined;
    let duration: number | undefined;
    let hasAudio = false;

    if (contentType.startsWith('video/')) {
      const metadata = await this.getVideoDimensionsFromBuffer(body);
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
        );
      case 'buffer':
        return this.prepareBinaryUpload(source.data, source.contentType);
      default:
        throw new Error('Invalid upload source type');
    }
  }

  private async processImage(
    prepared: PreparedUpload,
    key: string,
    url: string,
  ): Promise<ProcessedUpload> {
    // Gifs pass through untouched: re-encoding via sharp would flatten an
    // animated gif to its first frame.
    if (
      !prepared.contentType.startsWith('image/') ||
      prepared.contentType.includes('gif')
    ) {
      return { ...prepared, imageProcessingDuration: 0 };
    }

    const imageInput = prepared.filePath ?? prepared.body;
    if (!imageInput) {
      throw new Error('Image upload is missing a file path or buffer');
    }

    const imageProcessingStart = Date.now();
    const originalSizeBytes = prepared.body?.length ?? prepared.size ?? 0;
    const quality = Number(
      this.configService.get('AWS_IMAGE_COMPRESSION') || '90',
    );
    const processor = sharp(imageInput).rotate();
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

    return {
      ...prepared,
      body,
      contentType,
      filePath: undefined,
      imageProcessingDuration,
    };
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

    let prepared: PreparedUpload | undefined;
    try {
      const prepareStartTime = Date.now();
      prepared = await this.prepareUpload(source, key, url);
      const prepareDuration = Date.now() - prepareStartTime;
      const preparedSize = prepared.body?.length ?? prepared.size ?? 0;

      this.loggerService.log(`${url} file preparation completed`, {
        bufferSize: `${(preparedSize / (1024 * 1024)).toFixed(2)} MB`,
        bufferSizeBytes: preparedSize,
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
      const processedSize = processed.body?.length ?? processed.size ?? 0;

      const s3UploadStartTime = Date.now();
      this.loggerService.log(`${url} starting storage upload`, {
        bufferSize: `${(processedSize / (1024 * 1024)).toFixed(2)} MB`,
        contentType: processed.contentType,
        key,
        storagePath,
      });

      let storedPath: string;
      if (processed.body) {
        storedPath = await this.storage.upload(
          processed.body,
          storagePath,
          processed.contentType,
        );
      } else if (processed.filePath) {
        storedPath = await this.storage.uploadFromFile(
          storagePath,
          processed.filePath,
          FILES_TMP_ROOT,
          processed.contentType,
        );
      } else {
        throw new Error('Upload source produced no file or buffer');
      }
      const publicUrl = this.storage.getUrl(storedPath);

      const s3UploadDuration = Date.now() - s3UploadStartTime;
      const totalDuration = Date.now() - uploadStartTime;

      this.loggerService.log(`${url} upload completed successfully`, {
        bufferSize: `${(processedSize / (1024 * 1024)).toFixed(2)} MB`,
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
        size: processedSize,
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
    } finally {
      if (prepared?.spooledPath && fs.existsSync(prepared.spooledPath)) {
        fs.unlinkSync(prepared.spooledPath);
      }
    }
  }

  private getExtensionFromContentType(contentType: string): string {
    const mime = contentType.split(';')[0]?.trim().toLowerCase();
    switch (mime) {
      case 'application/zip':
        return '.zip';
      case 'image/gif':
        return '.gif';
      case 'image/jpeg':
        return '.jpg';
      case 'image/png':
        return '.png';
      case 'image/webp':
        return '.webp';
      case 'video/mp4':
      case 'video/quicktime':
      case 'video/webm':
        return '.mp4';
      default:
        return '';
    }
  }

  /**
   * A usable media type from a transport header, or undefined when the header
   * is absent or carries no information (octet-stream), so callers can fall
   * back to the extension sniff.
   */
  private normalizeContentType(value?: string): string | undefined {
    const mime = value?.split(';')[0]?.trim().toLowerCase();
    if (!mime || mime === 'application/octet-stream') {
      return undefined;
    }
    return mime;
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
