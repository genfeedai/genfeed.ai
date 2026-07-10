import path from 'node:path';
import process from 'node:process';
import { isSelfHostedDeployment } from '@genfeedai/config';
import { FileInputType } from '@genfeedai/enums';
import type {
  IApiUploadSource,
  IFFprobeStream,
  IFileMetadata,
  IVideoDimensions,
  UploadSource,
} from '@genfeedai/interfaces';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class FilesClientService {
  private readonly filesServiceUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
  ) {
    this.filesServiceUrl =
      this.configService.get('GENFEEDAI_MICROSERVICES_FILES_URL') ||
      'http://localhost:3012';
  }

  async resizeImage(imageData: Buffer, target: IVideoDimensions) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.filesServiceUrl}/v1/files/processing/resize-image`,
          {
            height: target.height,
            imageData: imageData.toString('base64'),
            width: target.width,
          },
        ),
      );
      return Buffer.from(response.data.data, 'base64');
    } catch (error: unknown) {
      this.loggerService.error('Failed to resize image', error);
      throw error;
    }
  }

  async resizeImageFromUrl(imageUrl: string, target: IVideoDimensions) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.filesServiceUrl}/v1/files/processing/resize-image`,
          {
            height: target.height,
            imageUrl,
            width: target.width,
          },
        ),
      );
      return Buffer.from(response.data.data, 'base64');
    } catch (error: unknown) {
      this.loggerService.error('Failed to resize image from URL', error);
      throw error;
    }
  }

  /**
   * Extract metadata from a file URL without uploading to S3
   * This is useful for refreshing metadata for existing files
   */
  async extractMetadataFromUrl(url: string): Promise<{
    width?: number;
    height?: number;
    duration?: number;
    size?: number;
    hasAudio?: boolean;
  }> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.filesServiceUrl}/v1/files/metadata`, {
          url,
        }),
      );

      const metadata = response.data;

      // Extract dimensions from video stream
      const videoStream = metadata.streams?.find(
        (s: IFFprobeStream) => s.codec_type === 'video',
      );
      const audioStream = metadata.streams?.find(
        (s: IFFprobeStream) => s.codec_type === 'audio',
      );

      return {
        duration: Number(metadata.format?.duration) || 0,
        hasAudio: !!audioStream,
        height: videoStream?.height || 0,
        size: metadata.format?.size || 0,
        width: videoStream?.width || 0,
      };
    } catch (error: unknown) {
      this.loggerService.error('Failed to extract metadata from URL', error);
      throw error;
    }
  }

  async generateThumbnail(
    videoUrl: string,
    ingredientId: string,
    timeInSeconds?: number,
    width?: number,
  ) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.filesServiceUrl}/v1/files/processing/generate-thumbnail`,
          {
            ingredientId,
            timeInSeconds,
            videoUrl,
            width,
          },
        ),
      );
      return response.data;
    } catch (error: unknown) {
      this.loggerService.error('Failed to generate thumbnail', error);
      throw error;
    }
  }

  /**
   * Overlay audio onto video using the files microservice.
   * Matches the POST /v1/files/processing/audio-overlay endpoint.
   */
  async audioOverlay(params: {
    videoUrl: string;
    audioUrl: string;
    mixMode?: 'replace' | 'mix' | 'background';
    audioVolume?: number;
    videoVolume?: number;
    fadeIn?: number;
    fadeOut?: number;
    outputKey?: string;
  }): Promise<{
    publicUrl: string;
    s3Key: string;
    duration?: number;
  }> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.filesServiceUrl}/v1/files/processing/audio-overlay`,
          params,
        ),
      );
      return response.data;
    } catch (error: unknown) {
      this.loggerService.error('Failed to overlay audio', error);
      throw error;
    }
  }

  // Compatibility methods to match the original FilesService interface
  getPath(type: string, ingredientId: string): string {
    // This should be handled by the files service internally
    // Return a placeholder path for compatibility
    return path.join(process.cwd(), 'public', 'tmp', type, ingredientId);
  }

  /**
   * Upload file to S3 via files app
   */
  async uploadToS3(
    key: string,
    type: string,
    source: UploadSource,
  ): Promise<IFileMetadata> {
    try {
      // Prepare source for API call
      let apiSource: IApiUploadSource;
      if (source.type === 'buffer') {
        // Convert buffer to base64 for API call
        apiSource = {
          contentType: source.contentType,
          data: source.data.toString('base64'),
          type: FileInputType.BUFFER,
        };
      } else {
        apiSource = source;
      }

      const response = await firstValueFrom(
        this.httpService.post(`${this.filesServiceUrl}/v1/files/upload`, {
          key,
          source: apiSource,
          type,
        }),
      );

      return response.data;
    } catch (error: unknown) {
      this.loggerService.error('Failed to upload file to S3', error);
      throw error;
    }
  }

  /**
   * Download file from S3 via files app
   */
  async getFileFromS3(
    key: string,
    type: string,
  ): Promise<NodeJS.ReadableStream> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.filesServiceUrl}/v1/files/download/${type}/${key}`,
          {
            responseType: 'stream',
          },
        ),
      );

      return response.data as NodeJS.ReadableStream;
    } catch (error: unknown) {
      this.loggerService.error('Failed to download file from S3', {
        error: (error as Error)?.message || 'Unknown error',
        key,
        statusCode: (error as { status?: number })?.status,
        type,
      });
      throw error;
    }
  }

  /**
   * Get presigned upload URL via files app
   */
  async getPresignedUploadUrl(
    key: string,
    type: string,
    contentType: string = 'application/octet-stream',
    _expiresIn: number = 3600,
  ): Promise<{
    uploadMethod?: 'POST_JSON' | 'PUT';
    uploadUrl: string;
    publicUrl: string;
    s3Key: string;
  }> {
    // In self-hosted mode (LOCAL + HYBRID), skip S3 presigned URL.
    // Return direct upload URL to the Files service, which uses LocalStorageProvider.
    if (isSelfHostedDeployment()) {
      const localKey = `ingredients/${type}/${key}`;
      return {
        publicUrl: `/local/${localKey}`,
        s3Key: localKey,
        uploadMethod: 'POST_JSON',
        uploadUrl: `${this.filesServiceUrl}/v1/files/upload`,
      };
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.filesServiceUrl}/v1/files/presigned-upload`,
          {
            contentType,
            filename: key,
            type,
          },
        ),
      );

      return {
        publicUrl: response.data.publicUrl,
        s3Key: response.data.key,
        uploadMethod: 'PUT',
        uploadUrl: response.data.uploadUrl,
      };
    } catch (error: unknown) {
      this.loggerService.error('Failed to get presigned upload URL', error);
      throw error;
    }
  }

  /**
   * Get presigned download URL via files app
   */
  async getPresignedDownloadUrl(
    key: string,
    type: string,
    _expiresIn: number = 3600,
  ): Promise<string> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.filesServiceUrl}/v1/files/presigned-download/${type}/${key}`,
        ),
      );

      return response.data.downloadUrl;
    } catch (error: unknown) {
      this.loggerService.error('Failed to get presigned download URL', error);
      throw error;
    }
  }

  /**
   * Copy file within S3 via files app
   */
  async copyInS3(
    sourceKey: string,
    destinationKey: string,
    sourceType?: string,
    destinationType?: string,
  ): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.post(`${this.filesServiceUrl}/v1/files/copy`, {
          destinationKey,
          destinationType,
          sourceKey,
          sourceType,
        }),
      );
    } catch (error: unknown) {
      const parsedError = error as Error & {
        code?: string;
        response?: { status?: number };
        statusCode?: number;
      };
      const errorMessage = parsedError?.message || 'Unknown error';
      const errorDetails = {
        code: parsedError?.code,
        destinationKey,
        message: errorMessage,
        sourceKey,
        statusCode: parsedError?.response?.status || parsedError?.statusCode,
        ...(parsedError?.stack && { stack: parsedError.stack }),
      };
      this.loggerService.error('Failed to copy file in S3', errorDetails);
      throw error;
    }
  }

  /**
   * Split a contact sheet image into individual frames
   */
  async splitImage(
    imageUrl: string,
    gridRows: number,
    gridCols: number,
    borderInset?: number,
  ): Promise<{ frames: Buffer[] }> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.filesServiceUrl}/v1/files/processing/split-image`,
          {
            borderInset: borderInset ?? 10,
            gridCols,
            gridRows,
            imageUrl,
          },
        ),
      );

      // Decode base64 frames back to buffers
      const frames = response.data.frames.map((base64: string) =>
        Buffer.from(base64, 'base64'),
      );

      return { frames };
    } catch (error: unknown) {
      this.loggerService.error('Failed to split image', error);
      throw error;
    }
  }
}
