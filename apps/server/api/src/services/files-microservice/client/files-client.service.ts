import path from 'node:path';
import { ConfigService } from '@api/config/config.service';
import { IS_SELF_HOSTED } from '@genfeedai/config';
import { FileInputType } from '@genfeedai/enums';
import type {
  IApiUploadSource,
  ICaptionConfig,
  IDownloadHeaders,
  IFFprobeStream,
  IFileMetadata,
  IGifOptions,
  IImageInput,
  IImageToVideoConfig,
  IKenBurnsOptions,
  IPortraitBlurOptions,
  ISplitScreenOptions,
  ISplitScreenVideo,
  IVideoDimensions,
  UploadSource,
} from '@genfeedai/interfaces';
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

  async generateCaptions(
    videoUrl: string,
    captions: ICaptionConfig,
    ingredientId: string,
  ) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.filesServiceUrl}/v1/files/processing/captions`,
          {
            captions,
            ingredientId,
            videoUrl,
          },
        ),
      );
      return response.data;
    } catch (error: unknown) {
      this.loggerService.error('Failed to generate captions', error);
      throw error;
    }
  }

  async createGif(videoUrl: string, outputPath: string, options?: IGifOptions) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.filesServiceUrl}/v1/files/processing/gif`,
          {
            options,
            outputPath,
            videoUrl,
          },
        ),
      );
      return response.data;
    } catch (error: unknown) {
      this.loggerService.error('Failed to create GIF', error);
      throw error;
    }
  }

  async createVideoFromImages(
    images: IImageInput[],
    config: IImageToVideoConfig,
    ingredientId: string,
  ) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.filesServiceUrl}/v1/files/processing/image-to-video`,
          {
            config,
            images,
            ingredientId,
          },
        ),
      );
      return response.data;
    } catch (error: unknown) {
      this.loggerService.error('Failed to create video from images', error);
      throw error;
    }
  }

  async applyKenBurnsEffect(
    imageUrl: string,
    duration: number,
    ingredientId: string,
    options?: IKenBurnsOptions,
  ) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.filesServiceUrl}/v1/files/processing/ken-burns`,
          {
            duration,
            imageUrl,
            ingredientId,
            options,
          },
        ),
      );
      return response.data;
    } catch (error: unknown) {
      this.loggerService.error('Failed to apply Ken Burns effect', error);
      throw error;
    }
  }

  async applyPortraitBlur(
    videoUrl: string,
    ingredientId: string,
    options?: IPortraitBlurOptions,
  ) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.filesServiceUrl}/v1/files/processing/portrait-blur`,
          {
            ingredientId,
            options,
            videoUrl,
          },
        ),
      );
      return response.data;
    } catch (error: unknown) {
      this.loggerService.error('Failed to apply portrait blur', error);
      throw error;
    }
  }

  async createSplitScreenVideo(
    videos: ISplitScreenVideo[],
    ingredientId: string,
    options?: ISplitScreenOptions,
  ) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.filesServiceUrl}/v1/files/processing/split-screen`,
          {
            ingredientId,
            options,
            videos,
          },
        ),
      );
      return response.data;
    } catch (error: unknown) {
      this.loggerService.error('Failed to create split screen video', error);
      throw error;
    }
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

  async resizeVideo(inputPath: string, target: IVideoDimensions) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.filesServiceUrl}/v1/files/processing/resize-video`,
          {
            height: target.height,
            inputPath,
            width: target.width,
          },
        ),
      );
      return response.data;
    } catch (error: unknown) {
      this.loggerService.error('Failed to resize video', error);
      throw error;
    }
  }

  async downloadFile(
    url: string,
    outputPath: string,
    headers?: IDownloadHeaders,
  ) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.filesServiceUrl}/v1/files/processing/download-file`,
          {
            headers,
            outputPath,
            url,
          },
        ),
      );
      return response.data;
    } catch (error: unknown) {
      this.loggerService.error('Failed to download file', error);
      throw error;
    }
  }

  async getVideoMetadata(videoPath: string) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.filesServiceUrl}/v1/files/processing/get-video-metadata`,
          {
            videoPath,
          },
        ),
      );
      return response.data;
    } catch (error: unknown) {
      this.loggerService.error('Failed to get video metadata', error);
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

  async extractFrames(videoPath: string, outputDir: string, fps?: number) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.filesServiceUrl}/v1/files/processing/extract-frames`,
          {
            fps,
            outputDir,
            videoPath,
          },
        ),
      );
      return response.data;
    } catch (error: unknown) {
      this.loggerService.error('Failed to extract frames', error);
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

  async mergeVideos(
    videoPaths: string[],
    outputPath: string,
    transition?: string,
  ) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.filesServiceUrl}/v1/files/processing/merge-videos`,
          {
            outputPath,
            transition,
            videoPaths,
          },
        ),
      );
      return response.data;
    } catch (error: unknown) {
      this.loggerService.error('Failed to merge videos', error);
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
  ): Promise<{ uploadUrl: string; publicUrl: string; s3Key: string }> {
    // In self-hosted mode (LOCAL + HYBRID), skip S3 presigned URL.
    // Return direct upload URL to the Files service, which uses LocalStorageProvider.
    if (IS_SELF_HOSTED) {
      const localKey = `${type}/${key}`;
      return {
        publicUrl: `/local/${localKey}`,
        s3Key: localKey,
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
