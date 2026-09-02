import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
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
import { fromIni } from '@aws-sdk/credential-provider-ini';
import { Upload } from '@aws-sdk/lib-storage';
import {
  assertSafeObjectKey,
  assertSafeObjectKeyPrefix,
  resolveContainedPathWithoutSymlinks,
} from './path-containment';
import type {
  FileEntry,
  ListOptions,
  StorageObject,
  StorageProvider,
  StorageProviderOptions,
} from './storage.provider';

const createStorageError = (message: string) => new Error(message);

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

function stripTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47) {
    end -= 1;
  }
  return end === value.length ? value : value.slice(0, end);
}

function normalizeCdnUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  return stripTrailingSlashes(trimmed);
}

export class S3StorageProvider implements StorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly region: string;
  private readonly cdnUrl: string | undefined;

  constructor(options: StorageProviderOptions = {}) {
    this.bucket = options.bucket ?? process.env.AWS_S3_BUCKET ?? '';
    this.region = options.region ?? process.env.AWS_REGION ?? 'us-east-1';
    this.cdnUrl = normalizeCdnUrl(
      options.cdnUrl ?? process.env.GENFEEDAI_CDN_URL,
    );
    const profile = options.profile ?? process.env.AWS_PROFILE?.trim();
    const credentials = profile
      ? fromIni({ profile })
      : {
          accessKeyId:
            options.accessKeyId ?? process.env.AWS_ACCESS_KEY_ID ?? '',
          secretAccessKey:
            options.secretAccessKey ?? process.env.AWS_SECRET_ACCESS_KEY ?? '',
        };
    this.client = new S3Client({
      region: this.region,
      credentials,
    });
  }

  async upload(
    file: Buffer,
    filePath: string,
    contentType?: string,
  ): Promise<string> {
    const safeFilePath = assertSafeObjectKey(filePath, createStorageError);
    const resolvedContentType = contentType ?? mimeFromPath(filePath);
    const command = new PutObjectCommand({
      Body: file,
      Bucket: this.bucket,
      ContentType: resolvedContentType,
      Key: safeFilePath,
    });
    await this.client.send(command);
    return safeFilePath;
  }

  async uploadFromFile(
    filePath: string,
    localPath: string,
    localRoot: string,
    contentType?: string,
  ): Promise<string> {
    const safeFilePath = assertSafeObjectKey(filePath, createStorageError);
    const containedLocalPath = await resolveContainedPathWithoutSymlinks(
      localRoot,
      localPath,
      createStorageError,
    );
    const fileStats = await stat(containedLocalPath);
    const resolvedContentType = contentType ?? mimeFromPath(containedLocalPath);
    const fileStream = createReadStream(
      /* lgtm[js/path-injection] contained via resolveContainedPathWithoutSymlinks */
      containedLocalPath,
    );

    try {
      const upload = new Upload({
        client: this.client,
        params: {
          Body: fileStream,
          Bucket: this.bucket,
          ContentLength: fileStats.size,
          ContentType: resolvedContentType,
          Key: safeFilePath,
        },
      });
      await upload.done();
      return safeFilePath;
    } finally {
      fileStream.destroy();
    }
  }

  async download(
    filePath: string,
    localPath: string,
    localRoot: string,
  ): Promise<void> {
    const safeFilePath = assertSafeObjectKey(filePath, createStorageError);
    const containedLocalPath = await resolveContainedPathWithoutSymlinks(
      localRoot,
      localPath,
      createStorageError,
    );
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: safeFilePath,
    });
    const response = await this.client.send(command);

    if (!response.Body) {
      throw new Error(
        `Empty response body for s3://${this.bucket}/${safeFilePath}`,
      );
    }

    await mkdir(path.dirname(containedLocalPath), { recursive: true });
    await pipeline(
      response.Body as Readable,
      createWriteStream(
        /* lgtm[js/path-injection] contained via resolveContainedPathWithoutSymlinks */
        containedLocalPath,
      ),
    );
  }

  getUrl(filePath: string): string {
    const safeFilePath = assertSafeObjectKey(filePath, createStorageError);
    return this.buildObjectUrl(safeFilePath);
  }

  /**
   * Build the public URL for a key that is already known to be safe.
   *
   * `assertSafeObjectKey` guards *caller-supplied* paths against traversal. Keys
   * returned by ListObjectsV2 are S3's own output, and legitimately include
   * shapes that validator rejects — folder-marker objects ending in `/` and keys
   * containing empty segments. Re-validating them made `list()` throw on
   * ordinary buckets, so listing builds its URLs through here instead.
   */
  private buildObjectUrl(objectKey: string): string {
    if (this.cdnUrl) {
      return `${this.cdnUrl}/${objectKey}`;
    }
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${objectKey}`;
  }

  async delete(filePath: string): Promise<void> {
    const safeFilePath = assertSafeObjectKey(filePath, createStorageError);
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: safeFilePath,
    });
    await this.client.send(command);
  }

  async list(prefix: string, options?: ListOptions): Promise<FileEntry[]> {
    const safePrefix = assertSafeObjectKeyPrefix(prefix, createStorageError);
    const command = new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: safePrefix,
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
        url: this.buildObjectUrl(key),
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
    const safePrefix = assertSafeObjectKeyPrefix(prefix, createStorageError);
    const objects: StorageObject[] = [];
    let continuationToken: string | undefined;

    do {
      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        ContinuationToken: continuationToken,
        Prefix: safePrefix,
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
    const safeFilePath = assertSafeObjectKey(filePath, createStorageError);
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: safeFilePath,
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
