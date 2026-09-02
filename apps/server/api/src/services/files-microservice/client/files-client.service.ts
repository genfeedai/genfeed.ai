import path from 'node:path';
import type { Readable } from 'node:stream';
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
import FormData from 'form-data';
import { firstValueFrom } from 'rxjs';

const MULTIPART_MAX_BYTES = Number.POSITIVE_INFINITY;

function filenameForUpload(contentType: string, filename = 'upload'): string {
  if (path.extname(filename)) {
    return filename;
  }

  const mime = contentType.split(';')[0]?.trim().toLowerCase();
  switch (mime) {
    case 'application/zip':
      return `${filename}.zip`;
    case 'audio/mpeg':
      return `${filename}.mp3`;
    case 'image/gif':
      return `${filename}.gif`;
    case 'image/jpeg':
      return `${filename}.jpg`;
    case 'image/png':
      return `${filename}.png`;
    case 'image/webp':
      return `${filename}.webp`;
    case 'video/mp4':
    case 'video/quicktime':
    case 'video/webm':
      return `${filename}.mp4`;
    default:
      return filename;
  }
}

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

  /**
   * Run deterministic video QA (ffprobe + blackdetect/freezedetect/ebur128).
   * Matches POST /v1/files/processing/video-qa.
   */
  async inspectVideoQa(params: {
    videoUrl: string;
    isContactSheetEnabled: boolean;
    blackDurationSeconds: number;
    freezeDurationSeconds: number;
  }): Promise<{
    probeJson: string;
    detectLog: string;
    loudnessLog: string | null;
    decodeOk: boolean;
    contactSheetUrl: string | null;
  }> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.filesServiceUrl}/v1/files/processing/video-qa`,
          params,
        ),
      );
      return response.data;
    } catch (error: unknown) {
      this.loggerService.error('Failed to inspect video QA', error);
      throw error;
    }
  }

  /**
   * PUT a stream or buffer at a presigned object URL.
   */
  async putStreamToUrl(
    uploadUrl: string,
    data: Readable | Buffer,
    contentType: string,
  ): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.put(uploadUrl, data, {
          headers: { 'Content-Type': contentType },
          maxBodyLength: MULTIPART_MAX_BYTES,
          maxContentLength: MULTIPART_MAX_BYTES,
        }),
      );
    } catch (error: unknown) {
      this.loggerService.error(
        'Failed to upload stream to presigned URL',
        error,
      );
      throw error;
    }
  }

  /**
   * Stream bytes to the files service without base64 JSON amplification.
   */
  async uploadStreamToS3(
    key: string,
    type: string,
    source: {
      contentType: string;
      filename?: string;
      data: Readable | Buffer;
    },
  ): Promise<IFileMetadata> {
    try {
      return await this.postMultipartUpload(
        key,
        type,
        source.data,
        source.contentType,
        source.filename,
      );
    } catch (error: unknown) {
      this.loggerService.error('Failed to upload file to S3', error);
      throw error;
    }
  }

  /**
   * Upload file to S3 via files app.
   * Buffer sources go over multipart, never JSON base64.
   */
  async uploadToS3(
    key: string,
    type: string,
    source: UploadSource,
  ): Promise<IFileMetadata> {
    try {
      if (source.type === FileInputType.BUFFER) {
        return await this.postMultipartUpload(
          key,
          type,
          source.data,
          source.contentType,
        );
      }

      const apiSource: IApiUploadSource = source;
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

  /** Delete one full storage key through the configured storage provider. */
  async deleteStoredObject(storageKey: string): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.post(`${this.filesServiceUrl}/v1/files/delete`, {
          storageKey,
        }),
      );
    } catch (error: unknown) {
      this.loggerService.error('Failed to delete stored object', {
        error: (error as Error)?.message || 'Unknown error',
        storageKey,
      });
      throw error;
    }
  }

  private async postMultipartUpload(
    key: string,
    type: string,
    file: Readable | Buffer,
    contentType: string,
    filename = 'upload',
  ): Promise<IFileMetadata> {
    const form = new FormData();
    form.append('contentType', contentType);
    form.append('file', file, {
      contentType,
      filename: filenameForUpload(contentType, filename),
    });
    form.append('key', key);
    form.append('type', type);

    const response = await firstValueFrom(
      this.httpService.post(
        `${this.filesServiceUrl}/v1/files/upload/multipart`,
        form,
        {
          headers: form.getHeaders(),
          maxBodyLength: MULTIPART_MAX_BYTES,
          maxContentLength: MULTIPART_MAX_BYTES,
        },
      ),
    );

    return response.data;
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
