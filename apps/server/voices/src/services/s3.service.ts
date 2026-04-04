import { createWriteStream } from 'node:fs';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@voices/config/config.service';

export interface S3Object {
  key: string;
  size: number;
  lastModified: string;
}

@Injectable()
export class S3Service {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly client: S3Client;

  constructor(
    private readonly configService: ConfigService,
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

  async uploadFile(
    bucket: string,
    key: string,
    localPath: string,
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

    const command = new PutObjectCommand({
      Body: fileBuffer,
      Bucket: bucket,
      ContentLength: fileStats.size,
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
