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

export interface StorageProvider {
  upload(file: Buffer, path: string): Promise<string>;
  getUrl(path: string): string;
  delete(path: string): Promise<void>;
  list(prefix: string, options?: ListOptions): Promise<FileEntry[]>;
  exists(path: string): Promise<boolean>;
}
