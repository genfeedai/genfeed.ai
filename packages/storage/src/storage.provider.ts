export interface ListOptions {
  offset?: number;
  limit?: number;
  type?: 'image' | 'video' | 'audio' | 'all';
}

export interface FileEntry {
  name: string;
  path: string;
  url: string;
  type: string;
  size: number;
  modifiedAt: Date;
}

/** Raw object listing entry (S3 object metadata shape). */
export interface StorageObject {
  key: string;
  size: number;
  lastModified: Date;
}

/**
 * Construction options for storage providers.
 *
 * Every field falls back to environment variables (S3) or the default
 * base directory (local), so `createStorageProvider()` with no arguments
 * keeps working for existing consumers.
 */
export interface StorageProviderOptions {
  /** S3 bucket. Defaults to AWS_S3_BUCKET. */
  bucket?: string;
  /** AWS region. Defaults to AWS_REGION. */
  region?: string;
  /** Defaults to AWS_ACCESS_KEY_ID. */
  accessKeyId?: string;
  /** Defaults to AWS_SECRET_ACCESS_KEY. */
  secretAccessKey?: string;
  /** Local provider base directory. Defaults to GENFEED_STORAGE_PATH. */
  baseDir?: string;
}

export interface StorageProvider {
  upload(file: Buffer, path: string, contentType?: string): Promise<string>;
  /** Upload from a file on the local filesystem. */
  uploadFromFile(
    path: string,
    localPath: string,
    contentType?: string,
  ): Promise<string>;
  /** Download a stored object to a local filesystem path. */
  download(path: string, localPath: string): Promise<void>;
  getUrl(path: string): string;
  delete(path: string): Promise<void>;
  list(prefix: string, options?: ListOptions): Promise<FileEntry[]>;
  /** Exhaustive raw listing under a prefix (fully paginated). */
  listObjects(prefix: string): Promise<StorageObject[]>;
  exists(path: string): Promise<boolean>;
}
