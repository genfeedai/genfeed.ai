import { stat } from 'node:fs/promises';
import {
  createStorageProvider,
  type StorageProvider,
} from '@genfeedai/storage';
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

/**
 * Thin NestJS wrapper over `@genfeedai/storage` — the single S3/local-FS
 * implementation. Keeps the DI ergonomics and per-call bucket API used by
 * the images/videos/voices services while `createStorageProvider()` decides
 * between S3 (cloud) and the local filesystem (self-hosted).
 */
@Injectable()
export class S3Service {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly providers = new Map<string, StorageProvider>();

  constructor(
    @Inject('ConfigService')
    private readonly configService: S3ConfigService,
    private readonly loggerService: LoggerService,
  ) {}

  private providerFor(bucket: string): StorageProvider {
    let provider = this.providers.get(bucket);
    if (!provider) {
      provider = createStorageProvider({
        accessKeyId: this.configService.AWS_ACCESS_KEY_ID,
        bucket,
        region: this.configService.AWS_REGION,
        secretAccessKey: this.configService.AWS_SECRET_ACCESS_KEY,
      });
      this.providers.set(bucket, provider);
    }
    return provider;
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
      message: 'Downloading file from storage',
    });

    await this.providerFor(bucket).download(key, localPath);

    this.loggerService.log(caller, {
      bucket,
      key,
      localPath,
      message: 'File downloaded successfully',
    });
  }

  /**
   * Upload a local file to storage.
   *
   * @param contentType - Optional explicit MIME type. When omitted the
   *   provider infers it from the file extension (with
   *   application/octet-stream as the final fallback).
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
      message: 'Uploading file to storage',
    });

    await this.providerFor(bucket).uploadFromFile(key, localPath, contentType);
    const fileStats = await stat(localPath);

    this.loggerService.log(caller, {
      bucket,
      key,
      message: 'File uploaded successfully',
      sizeBytes: fileStats.size,
    });
  }

  /**
   * Upload a safetensors LoRA file to the canonical storage path.
   * Always uses application/octet-stream content type.
   */
  async uploadSafetensors(
    bucket: string,
    loraName: string,
    localPath: string,
  ): Promise<{ s3Key: string; sizeBytes: number }> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const s3Key = `ingredients/trainings/loras/${loraName}.safetensors`;

    this.loggerService.log(caller, {
      bucket,
      localPath,
      loraName,
      message: 'Uploading safetensors to storage',
      s3Key,
    });

    await this.providerFor(bucket).uploadFromFile(
      s3Key,
      localPath,
      'application/octet-stream',
    );
    const fileStats = await stat(localPath);

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
      message: 'Listing storage objects',
      prefix,
    });

    const objects = await this.providerFor(bucket).listObjects(prefix);
    const mapped: S3Object[] = objects.map((object) => ({
      key: object.key,
      lastModified: object.lastModified.toISOString(),
      size: object.size,
    }));

    this.loggerService.log(caller, {
      bucket,
      count: mapped.length,
      message: 'Listed storage objects',
      prefix,
    });

    return mapped;
  }
}
