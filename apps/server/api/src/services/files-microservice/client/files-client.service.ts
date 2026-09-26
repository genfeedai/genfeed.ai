import path from 'node:path';
import type { Readable } from 'node:stream';
import { isSelfHostedDeployment } from '@genfeedai/config';
import { FileInputType } from '@genfeedai/contracts';
import {
  type MediaPerceptionArtefacts,
  type MediaPerceptionArtefactsRequest,
  type MediaPerceptionFingerprint,
  type MediaProbe,
  type MediaReadinessKind,
  mediaPerceptionArtefactsSchema,
  mediaPerceptionFingerprintSchema,
} from '@genfeedai/contracts/api-types/contracts';
import type {
  IApiUploadSource,
  IFFprobeResult,
  IFFprobeStream,
  IFileMetadata,
  IVideoDimensions,
  IWatermarkExportRequest,
  IWatermarkExportResult,
  UploadSource,
} from '@genfeedai/contracts/interfaces';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import FormData from 'form-data';
import { firstValueFrom } from 'rxjs';

const MULTIPART_MAX_BYTES = Number.POSITIVE_INFINITY;

/**
 * Perception downloads and hashes the whole asset, and extraction adds a seek,
 * an OCR pass and an upload per frame plus an audio transcode — far past the
 * module's 30s default for any real video.
 */
const PERCEPTION_FINGERPRINT_TIMEOUT_MS = 2 * 60 * 1000;
const PERCEPTION_ARTEFACTS_TIMEOUT_MS = 10 * 60 * 1000;

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

  async watermarkExport(
    payload: IWatermarkExportRequest,
  ): Promise<IWatermarkExportResult> {
    const response = await firstValueFrom(
      this.httpService.post<IWatermarkExportResult>(
        `${this.filesServiceUrl}/v1/files/watermark-export`,
        payload,
        {
          headers: {
            'x-api-key': this.configService.get('GENFEEDAI_API_KEY') || '',
          },
          timeout: 600000,
        },
      ),
    );
    return response.data;
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

  /**
   * Probe a media URL and normalise the ffprobe payload into the persisted
   * `MediaProbe` shape used by the pre-publish media readiness gate (#4878).
   *
   * `kind` comes from the asset record rather than the probe: ffprobe reports
   * a still image as a single video stream, so the payload alone cannot tell
   * an image from a one-frame video.
   */
  async probeMediaFromUrl(
    url: string,
    kind: MediaReadinessKind,
  ): Promise<MediaProbe> {
    const response = await firstValueFrom(
      this.httpService.post<IFFprobeResult>(
        `${this.filesServiceUrl}/v1/files/metadata`,
        { url },
      ),
    );
    return this.toMediaProbe(response.data, kind);
  }

  /** SHA-256 and size of the bytes behind an asset URL (#4879). */
  async fingerprintMedia(url: string): Promise<MediaPerceptionFingerprint> {
    const response = await firstValueFrom(
      this.httpService.post<unknown>(
        `${this.filesServiceUrl}/v1/files/perception/fingerprint`,
        { url },
        { timeout: PERCEPTION_FINGERPRINT_TIMEOUT_MS },
      ),
    );
    return mediaPerceptionFingerprintSchema.parse(response.data);
  }

  /**
   * Model-free perception artefacts (#4879): sampled frames, OCR text and the
   * extracted audio track. The response is validated before it is trusted.
   */
  async extractPerceptionArtefacts(
    request: MediaPerceptionArtefactsRequest,
  ): Promise<MediaPerceptionArtefacts> {
    const response = await firstValueFrom(
      this.httpService.post<unknown>(
        `${this.filesServiceUrl}/v1/files/perception/artefacts`,
        request,
        { timeout: PERCEPTION_ARTEFACTS_TIMEOUT_MS },
      ),
    );
    return mediaPerceptionArtefactsSchema.parse(response.data);
  }

  private toMediaProbe(
    probe: IFFprobeResult,
    kind: MediaReadinessKind,
  ): MediaProbe {
    const streams = Array.isArray(probe.streams) ? probe.streams : [];
    const videoStream = streams.find((stream) => stream.codec_type === 'video');
    const audioStream = streams.find((stream) => stream.codec_type === 'audio');
    const durationSeconds = this.readPositiveNumber(probe.format?.duration);

    return {
      audioCodec: this.readCodecName(audioStream),
      container: this.readNonEmptyString(probe.format?.format_name),
      // Still images have no meaningful duration; ffprobe reports either
      // nothing or a synthetic single-frame duration for them.
      durationSeconds: kind === 'image' ? null : durationSeconds,
      frameRate: kind === 'image' ? null : this.readFrameRate(videoStream),
      height: this.readPositiveInteger(videoStream?.height),
      kind,
      probedAt: new Date().toISOString(),
      sizeBytes: this.readNonNegativeInteger(probe.format?.size),
      videoCodec: this.readCodecName(videoStream),
      width: this.readPositiveInteger(videoStream?.width),
    };
  }

  private readCodecName(stream: IFFprobeStream | undefined): string | null {
    return this.readNonEmptyString(stream?.codec_name)?.toLowerCase() ?? null;
  }

  private readNonEmptyString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : null;
  }

  /**
   * Coerce only what ffprobe actually emits: a JSON number, or the numeric
   * string it uses for `duration` and `size`. Everything else stays null.
   * `Number()` alone would turn `true` into 1 and `null` or `''` into 0, which
   * reads downstream as a measured dimension or a zero-byte file rather than
   * as missing metadata.
   */
  private readFiniteNumber(value: unknown): number | null {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }
    if (typeof value !== 'string' || value.trim().length === 0) {
      return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private readPositiveNumber(value: unknown): number | null {
    const parsed = this.readFiniteNumber(value);
    return parsed !== null && parsed > 0 ? parsed : null;
  }

  private readPositiveInteger(value: unknown): number | null {
    const parsed = this.readPositiveNumber(value);
    return parsed === null ? null : Math.round(parsed);
  }

  private readNonNegativeInteger(value: unknown): number | null {
    const parsed = this.readFiniteNumber(value);
    return parsed !== null && parsed >= 0 ? Math.round(parsed) : null;
  }

  /** ffprobe reports frame rate as a `numerator/denominator` string. */
  private readFrameRate(stream: IFFprobeStream | undefined): number | null {
    const raw =
      this.readNonEmptyString(stream?.r_frame_rate) ??
      this.readNonEmptyString(stream?.avg_frame_rate);
    if (!raw) {
      return null;
    }
    const [numerator, denominator] = raw.split('/');
    const parsedNumerator = Number(numerator);
    const parsedDenominator =
      denominator === undefined ? 1 : Number(denominator);
    if (
      !Number.isFinite(parsedNumerator) ||
      !Number.isFinite(parsedDenominator) ||
      parsedDenominator === 0 ||
      parsedNumerator <= 0
    ) {
      return null;
    }
    return parsedNumerator / parsedDenominator;
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
  async assembleSpeech(params: {
    segments: { audioUrl: string; startSeconds: number; endSeconds: number }[];
    durationSeconds: number;
    outputKey?: string;
  }): Promise<{ publicUrl: string; s3Key: string; duration: number }> {
    const response = await firstValueFrom(
      this.httpService.post(
        `${this.filesServiceUrl}/v1/files/processing/speech-assembly`,
        params,
      ),
    );
    return response.data;
  }

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
