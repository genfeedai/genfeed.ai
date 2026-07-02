import { createWriteStream } from 'node:fs';
import { mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

import type {
  FileEntry,
  ListOptions,
  StorageObject,
  StorageProvider,
  StorageProviderOptions,
} from './storage.provider';

const MIME_BY_EXT: Record<string, string> = {
  '.aac': 'audio/aac',
  '.avi': 'video/x-msvideo',
  '.flac': 'audio/flac',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.m4a': 'audio/mp4',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.pth': 'application/octet-stream',
  '.safetensors': 'application/octet-stream',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.zip': 'application/zip',
};

function mimeFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

function getFileType(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase() ?? '';
  const imageExts = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg']);
  const videoExts = new Set(['mp4', 'webm', 'mov', 'avi']);
  const audioExts = new Set(['mp3', 'wav', 'ogg', 'flac', 'aac']);
  if (imageExts.has(ext)) return 'image';
  if (videoExts.has(ext)) return 'video';
  if (audioExts.has(ext)) return 'audio';
  return 'file';
}

export class S3StorageProvider implements StorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly region: string;

  constructor(options: StorageProviderOptions = {}) {
    this.bucket = options.bucket ?? process.env.AWS_S3_BUCKET ?? '';
    this.region = options.region ?? process.env.AWS_REGION ?? 'us-east-1';
    this.client = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId: options.accessKeyId ?? process.env.AWS_ACCESS_KEY_ID ?? '',
        secretAccessKey:
          options.secretAccessKey ?? process.env.AWS_SECRET_ACCESS_KEY ?? '',
      },
    });
  }

  async upload(
    file: Buffer,
    filePath: string,
    contentType?: string,
  ): Promise<string> {
    const resolvedContentType = contentType ?? mimeFromPath(filePath);
    const command = new PutObjectCommand({
      Body: file,
      Bucket: this.bucket,
      ContentType: resolvedContentType,
      Key: filePath,
    });
    await this.client.send(command);
    return filePath;
  }

  async uploadFromFile(
    filePath: string,
    localPath: string,
    contentType?: string,
  ): Promise<string> {
    const fileBuffer = await readFile(localPath);
    const fileStats = await stat(localPath);
    const resolvedContentType = contentType ?? mimeFromPath(localPath);

    const command = new PutObjectCommand({
      Body: fileBuffer,
      Bucket: this.bucket,
      ContentLength: fileStats.size,
      ContentType: resolvedContentType,
      Key: filePath,
    });
    await this.client.send(command);
    return filePath;
  }

  async download(filePath: string, localPath: string): Promise<void> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: filePath,
    });
    const response = await this.client.send(command);

    if (!response.Body) {
      throw new Error(
        `Empty response body for s3://${this.bucket}/${filePath}`,
      );
    }

    await mkdir(path.dirname(localPath), { recursive: true });
    await pipeline(response.Body as Readable, createWriteStream(localPath));
  }

  getUrl(filePath: string): string {
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${filePath}`;
  }

  async delete(filePath: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: filePath,
    });
    await this.client.send(command);
  }

  async list(prefix: string, options?: ListOptions): Promise<FileEntry[]> {
    const command = new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: prefix,
      MaxKeys: (options?.offset ?? 0) + (options?.limit ?? 1000),
    });
    const response = await this.client.send(command);
    const contents = response.Contents ?? [];

    let entries: FileEntry[] = contents.map((obj) => {
      const key = obj.Key ?? '';
      const name = key.split('/').pop() ?? key;
      return {
        name,
        path: key,
        url: this.getUrl(key),
        type: getFileType(key),
        size: obj.Size ?? 0,
        modifiedAt: obj.LastModified ?? new Date(),
      };
    });

    if (options?.type && options.type !== 'all') {
      entries = entries.filter((entry) => entry.type === options.type);
    }

    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? entries.length;
    return entries.slice(offset, offset + limit);
  }

  async listObjects(prefix: string): Promise<StorageObject[]> {
    const objects: StorageObject[] = [];
    let continuationToken: string | undefined;

    do {
      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        ContinuationToken: continuationToken,
        Prefix: prefix,
      });
      const response = await this.client.send(command);

      for (const item of response.Contents ?? []) {
        if (item.Key && item.Size !== undefined) {
          objects.push({
            key: item.Key,
            lastModified: item.LastModified ?? new Date(0),
            size: item.Size,
          });
        }
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return objects;
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: filePath,
      });
      await this.client.send(command);
      return true;
    } catch (err: unknown) {
      const name = (err as Error).name;
      if (name === 'NotFound' || name === 'NoSuchKey') {
        return false;
      }
      throw err;
    }
  }
}
