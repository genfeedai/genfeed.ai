import * as fs from 'node:fs';
import path from 'node:path';
import { TempFileCleanupCron } from '@files/cron/temp-file-cleanup.cron';
import { FFmpegService } from '@files/services/ffmpeg/services/ffmpeg.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Post,
} from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

@Controller('files')
export class FilesMetadataController {
  constructor(
    @Inject(FFmpegService) private readonly ffmpegService: FFmpegService,
    @Inject(HttpService) private readonly httpService: HttpService,
    private readonly logger: LoggerService,
    @Inject(TempFileCleanupCron)
    private readonly tempFileCleanupCron: TempFileCleanupCron,
  ) {}

  @Post('metadata')
  async getFileMetadata(@Body() body: { filePath?: string; url?: string }) {
    let filePath: string | undefined;
    let tempFilePath: string | undefined;
    let shouldCleanup = true; // Flag to control cleanup

    try {
      const { filePath: bodyFilePath, url } = body;

      if (!bodyFilePath && !url) {
        throw new HttpException(
          'Either filePath or url is required',
          HttpStatus.BAD_REQUEST,
        );
      }

      // If URL is provided, download the file first
      if (url) {
        this.logger.log(`Downloading file from URL for metadata: ${url}`);
        try {
          const response = await firstValueFrom(
            this.httpService.get(url, {
              maxBodyLength: 100 * 1024 * 1024,
              maxContentLength: 100 * 1024 * 1024, // 100MB limit
              maxRedirects: 5, // Limit redirects
              responseType: 'arraybuffer',
              timeout: 60000, // 60 second timeout
            }),
          );

          const tmpDir = path.resolve('public', 'tmp', 'metadata');
          if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
          }

          // Determine file extension from URL or Content-Type
          const rawContentType = response.headers['content-type'];
          const contentType =
            (typeof rawContentType === 'string' ? rawContentType : undefined) ||
            'application/octet-stream';
          const extension = this.getFileExtensionFromContentType(contentType);

          const tempFileName = `metadata_${Date.now()}_${Math.random().toString(36).substring(7)}${extension}`;
          tempFilePath = path.resolve(tmpDir, tempFileName);
          fs.writeFileSync(tempFilePath, Buffer.from(response.data));

          filePath = tempFilePath;

          // Don't cleanup immediately - we'll return the file path for caching
          shouldCleanup = false;

          this.logger.log(
            `File downloaded to temporary location: ${tempFilePath}`,
          );
        } catch (error: unknown) {
          this.logger.error(
            `Failed to download file from URL: ${url}`,
            error as Error,
          );

          const parsedError = error as {
            response?: { status?: number };
            code?: string;
            message?: string;
          };

          if (parsedError?.response?.status === 404) {
            throw new HttpException(
              `File not found at URL: ${url}`,
              HttpStatus.NOT_FOUND,
            );
          } else if (parsedError?.response?.status === 403) {
            throw new HttpException(
              `Access denied to URL: ${url}`,
              HttpStatus.FORBIDDEN,
            );
          } else if (parsedError?.code === 'ERR_FR_MAX_BODY_LENGTH_EXCEEDED') {
            throw new HttpException(
              `File size exceeds 100MB limit`,
              HttpStatus.PAYLOAD_TOO_LARGE,
            );
          } else if (
            parsedError?.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
            parsedError?.code === 'CERT_HAS_EXPIRED'
          ) {
            throw new HttpException(
              `SSL certificate error for URL: ${url}`,
              HttpStatus.BAD_REQUEST,
            );
          }

          throw new HttpException(
            `Failed to download file from URL: ${parsedError?.message || 'Unknown error'}`,
            HttpStatus.BAD_REQUEST,
          );
        }
      } else {
        filePath = bodyFilePath;
      }

      if (!filePath) {
        throw new HttpException('filePath is required', HttpStatus.BAD_REQUEST);
      }

      this.logger.log(`Getting metadata for file: ${filePath}`);

      const metadata = await this.ffmpegService.getVideoMetadata(filePath);

      return {
        ...metadata,
        ...(tempFilePath && {
          cachedFileName: path.basename(tempFilePath),
          cachedFilePath: tempFilePath,
        }),
      };
    } catch (error: unknown) {
      const parsedError = error as { name?: string; message?: string };
      if (
        parsedError?.name === 'ValidationException' ||
        (error instanceof Error && error.message.includes('does not exist'))
      ) {
        this.logger.error(`File not accessible: ${filePath}`, parsedError);
        throw new HttpException(
          `File not accessible: ${parsedError?.message || 'File does not exist or is not readable.'}`,
          HttpStatus.BAD_REQUEST,
        );
      }

      if (parsedError instanceof HttpException) {
        throw error;
      }

      this.logger.error('Failed to get file metadata:', error);
      throw new HttpException(
        parsedError?.message || 'Failed to get file metadata',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    } finally {
      // Only clean up temporary file if shouldCleanup flag is true
      // (i.e., if there was an error or it wasn't a URL download)
      if (shouldCleanup && tempFilePath && fs.existsSync(tempFilePath)) {
        try {
          fs.unlinkSync(tempFilePath);
          this.logger.log(`Cleaned up temporary file: ${tempFilePath}`);
        } catch (cleanupError: unknown) {
          this.logger.warn(
            `Failed to cleanup temporary file: ${tempFilePath}`,
            cleanupError instanceof Error
              ? cleanupError.message
              : String(cleanupError),
          );
        }
      }
    }
  }

  /**
   * Helper method to determine file extension from Content-Type header
   */
  private getFileExtensionFromContentType(contentType: string): string {
    // Video formats
    if (contentType.startsWith('video/')) {
      if (contentType.includes('quicktime')) {
        return '.mov';
      }
      if (contentType.includes('avi') || contentType.includes('msvideo')) {
        return '.avi';
      }
      if (contentType.includes('webm')) {
        return '.webm';
      }
      if (contentType.includes('x-matroska')) {
        return '.mkv';
      }
      return '.mp4'; // Default for video
    }

    // Image formats
    if (contentType.startsWith('image/')) {
      if (contentType.includes('jpeg') || contentType.includes('jpg')) {
        return '.jpg';
      }
      if (contentType.includes('png')) {
        return '.png';
      }
      if (contentType.includes('webp')) {
        return '.webp';
      }
      if (contentType.includes('gif')) {
        return '.gif';
      }
      if (contentType.includes('bmp')) {
        return '.bmp';
      }
      if (contentType.includes('tiff')) {
        return '.tiff';
      }
      return '.jpg'; // Default for image
    }

    // Audio formats
    if (contentType.startsWith('audio/')) {
      if (contentType.includes('mpeg')) {
        return '.mp3';
      }
      if (contentType.includes('wav')) {
        return '.wav';
      }
      if (contentType.includes('ogg')) {
        return '.ogg';
      }
      return '.mp3'; // Default for audio
    }

    return '.bin'; // Default fallback
  }

  /**
   * Serve cached temporary files
   */
  @Get('temp/:filename')
  async getTempFile(@Param('filename') filename: string) {
    try {
      const tmpDir = path.resolve('public', 'tmp', 'metadata');
      const filePath = path.resolve(tmpDir, filename);

      // Security check: ensure file is within tmp directory
      if (!filePath.startsWith(tmpDir)) {
        throw new HttpException('Invalid file path', HttpStatus.BAD_REQUEST);
      }

      if (!fs.existsSync(filePath)) {
        throw new HttpException('File not found', HttpStatus.NOT_FOUND);
      }

      const fileBuffer = fs.readFileSync(filePath);
      const extension = path.extname(filename).toLowerCase();

      let contentType = 'application/octet-stream';
      if (['.mp4', '.mov', '.avi', '.webm', '.mkv'].includes(extension)) {
        contentType = 'video/mp4';
      } else if (
        ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(extension)
      ) {
        contentType = `image/${extension.substring(1)}`;
      }

      return {
        buffer: fileBuffer.toString('base64'),
        contentType,
        filename,
      };
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to serve temp file: ${filename}`, error);
      throw new HttpException(
        'Failed to retrieve temporary file',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Manual cleanup endpoint for temporary files
   * Note: Automatic cleanup runs daily at 2 AM via @Cron decorator in TempFileCleanupCron
   */
  @Post('cleanup-temp-files')
  async cleanupTempFiles() {
    try {
      const result = await this.tempFileCleanupCron.manualCleanup();
      return result;
    } catch (error: unknown) {
      this.logger.error('Failed to cleanup temp files:', error);
      throw new HttpException(
        'Failed to cleanup temporary files',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
