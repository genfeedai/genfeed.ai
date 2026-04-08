import {
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

import type {
  FileEntry,
  ListOptions,
  StorageProvider,
} from './storage.provider';

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

  constructor() {
    this.bucket = process.env.AWS_S3_BUCKET ?? '';
    this.region = process.env.AWS_REGION ?? 'us-east-1';
    this.client = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
      },
    });
  }

  async upload(file: Buffer, filePath: string): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: filePath,
      Body: file,
    });
    await this.client.send(command);
    return filePath;
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
