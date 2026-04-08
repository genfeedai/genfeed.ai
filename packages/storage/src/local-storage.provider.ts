import { existsSync, mkdirSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type {
  FileEntry,
  ListOptions,
  StorageProvider,
} from './storage.provider';

const MIME_TYPE_MAP: Record<string, string> = {
  '.jpg': 'image',
  '.jpeg': 'image',
  '.png': 'image',
  '.gif': 'image',
  '.webp': 'image',
  '.svg': 'image',
  '.mp4': 'video',
  '.webm': 'video',
  '.mov': 'video',
  '.avi': 'video',
  '.mp3': 'audio',
  '.wav': 'audio',
  '.ogg': 'audio',
  '.flac': 'audio',
  '.aac': 'audio',
};

function getFileType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPE_MAP[ext] ?? 'file';
}

function resolveBaseDir(): string {
  return (
    process.env.GENFEED_STORAGE_PATH ??
    path.join(process.env.HOME ?? '~', '.genfeed', 'data', 'files')
  );
}

export class LocalStorageProvider implements StorageProvider {
  private readonly baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? resolveBaseDir();
    if (!existsSync(this.baseDir)) {
      mkdirSync(this.baseDir, { recursive: true });
    }
  }

  async upload(file: Buffer, filePath: string): Promise<string> {
    const fullPath = path.join(this.baseDir, filePath);
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, file);
    return filePath;
  }

  getUrl(filePath: string): string {
    return `/local/${filePath}`;
  }

  async delete(filePath: string): Promise<void> {
    const fullPath = path.join(this.baseDir, filePath);
    try {
      await fs.unlink(fullPath);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }
  }

  async list(prefix: string, options?: ListOptions): Promise<FileEntry[]> {
    const dirPath = path.join(this.baseDir, prefix);
    if (!existsSync(dirPath)) {
      return [];
    }

    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const fileEntries: FileEntry[] = [];

    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }

      const fileType = getFileType(entry.name);
      if (
        options?.type &&
        options.type !== 'all' &&
        fileType !== options.type
      ) {
        continue;
      }

      const filePath = path.join(prefix, entry.name);
      const fullPath = path.join(this.baseDir, filePath);
      const stat = await fs.stat(fullPath);

      fileEntries.push({
        name: entry.name,
        path: filePath,
        url: this.getUrl(filePath),
        type: fileType,
        size: stat.size,
        modifiedAt: stat.mtime,
      });
    }

    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? fileEntries.length;
    return fileEntries.slice(offset, offset + limit);
  }

  async exists(filePath: string): Promise<boolean> {
    const fullPath = path.join(this.baseDir, filePath);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }
}
