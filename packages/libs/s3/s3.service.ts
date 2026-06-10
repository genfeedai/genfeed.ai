import { createWriteStream } from 'node:fs';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { dirname, extname } from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime imports
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Inject, Injectable } from '@nestjs/common';

export interface S3Object {
  key: string;
  size: number;
  lastModified: string;
}

/** Minimal shape of ConfigService required by S3Service. */
export interface S3ConfigService {
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  AWS_REGION: string;
}

/** MIME fallback table keyed by lowercase file extension (without the dot). */
const MIME_BY_EXT: Readonly<Record<string, string>> = {
  aac: 'audio/aac',
  avi: 'video/x-msvideo',
  flac: 'audio/flac',
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  ogg: 'audio/ogg',
  png: 'image/png',
  pth: 'application/octet-stream',
  safetensors: 'application/octet-stream',
  wav: 'audio/wav',
  webm: 'video/webm',
  webp: 'image/webp',
};

/** Derive a MIME type from a file path extension, defaulting to application/octet-stream. */
function mimeFromPath(filePath: string): string {
  const ext = extname(filePath).replace('.', '').toLowerCase();
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

@Injectable()
export class S3Service {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly client: S3Client;

  constructor(
    @Inject('ConfigService')
    private readonly configService: S3ConfigService,
    private readonly loggerService: LoggerService,
  ) {
    this.client = new S3Client({
      credentials: {
        accessKeyId: this.configService.AWS_ACCESS_KEY_ID,
        secretAccessKey: this.configService.AWS_SECRET_ACCESS_KEY,
      },
      region: this.configService.AWS_REGION,
    });
  }

  async downloadFile(
    bucket: string,
    key: string,
    localPath: string,
  ): Promise<void> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    this.loggerService.log(caller, {
      bucket,
      key,
      localPath,
      message: 'Downloading file from S3',
    });

    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    const response = await this.client.send(command);

    if (!response.Body) {
      throw new Error(`Empty response body for s3://${bucket}/${key}`);
    }

    await mkdir(dirname(localPath), { recursive: true });

    const body = response.Body as Readable;
    const writeStream = createWriteStream(localPath);
    await pipeline(body, writeStream);

    this.loggerService.log(caller, {
      bucket,
      key,
      localPath,
      message: 'File downloaded successfully',
    });
  }

  /**
   * Upload a local file to S3.
   *
   * @param contentType - Optional explicit MIME type. When omitted the type is
   *   inferred from the file extension (with application/octet-stream as the
   *   final fallback).
   */
  async uploadFile(
    bucket: string,
    key: string,
    localPath: string,
    contentType?: string,
  ): Promise<void> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    this.loggerService.log(caller, {
      bucket,
      key,
      localPath,
      message: 'Uploading file to S3',
    });

    const fileBuffer = await readFile(localPath);
    const fileStats = await stat(localPath);
    const resolvedContentType = contentType ?? mimeFromPath(localPath);

    const command = new PutObjectCommand({
      Body: fileBuffer,
      Bucket: bucket,
      ContentLength: fileStats.size,
      ContentType: resolvedContentType,
      Key: key,
    });

    await this.client.send(command);

    this.loggerService.log(caller, {
      bucket,
      key,
      message: 'File uploaded successfully',
      sizeBytes: fileStats.size,
    });
  }

  /**
   * Upload a safetensors LoRA file to the canonical S3 path.
   * Always uses application/octet-stream content type.
   */
  async uploadSafetensors(
    bucket: string,
    loraName: string,
    localPath: string,
  ): Promise<{ s3Key: string; sizeBytes: number }> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const s3Key = `trainings/loras/${loraName}.safetensors`;

    this.loggerService.log(caller, {
      bucket,
      localPath,
      loraName,
      message: 'Uploading safetensors to S3',
      s3Key,
    });

    const fileBuffer = await readFile(localPath);
    const fileStats = await stat(localPath);

    const command = new PutObjectCommand({
      Body: fileBuffer,
      Bucket: bucket,
      ContentLength: fileStats.size,
      ContentType: 'application/octet-stream',
      Key: s3Key,
    });

    await this.client.send(command);

    this.loggerService.log(caller, {
      bucket,
      loraName,
      message: 'Safetensors uploaded successfully',
      s3Key,
      sizeBytes: fileStats.size,
    });

    return { s3Key, sizeBytes: fileStats.size };
  }

  async listObjects(bucket: string, prefix: string): Promise<S3Object[]> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    this.loggerService.log(caller, {
      bucket,
      message: 'Listing S3 objects',
      prefix,
    });

    const objects: S3Object[] = [];
    let continuationToken: string | undefined;

    do {
      const command = new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: continuationToken,
        Prefix: prefix,
      });

      const response = await this.client.send(command);

      if (response.Contents) {
        for (const item of response.Contents) {
          if (item.Key && item.Size !== undefined) {
            objects.push({
              key: item.Key,
              lastModified: item.LastModified?.toISOString() ?? '',
              size: item.Size,
            });
          }
        }
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    this.loggerService.log(caller, {
      bucket,
      count: objects.length,
      message: 'Listed S3 objects',
      prefix,
    });

    return objects;
  }
}
