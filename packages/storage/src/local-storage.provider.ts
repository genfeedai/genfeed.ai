import { existsSync, mkdirSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type {
  FileEntry,
  ListOptions,
  StorageObject,
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

/**
 * Resolve `candidate` against `root` and assert the result stays inside it.
 *
 * `path.join(root, candidate)` is not a containment check: enough leading
 * `../` segments walk straight out of the storage directory. Resolving and
 * then comparing against the root catches that, and also catches an absolute
 * candidate, which `path.resolve` discards the root for entirely. Every method
 * here takes its path from a caller, so every one of them resolves through
 * this.
 *
 * `@libs/security` has the same guard, but this package deliberately depends
 * on nothing but `@aws-sdk/client-s3` and `@genfeedai/config`, so it keeps its
 * own copy rather than acquire a workspace dependency for six lines.
 */
function resolveWithin(root: string, candidate: string): string {
  if (typeof candidate !== 'string') {
    throw new Error('Storage path must be a string');
  }

  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, candidate);

  if (
    resolved !== resolvedRoot &&
    !resolved.startsWith(`${resolvedRoot}${path.sep}`)
  ) {
    throw new Error(`Storage path must stay within ${resolvedRoot}`);
  }

  return resolved;
}

export class LocalStorageProvider implements StorageProvider {
  private readonly baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? resolveBaseDir();
    if (!existsSync(this.baseDir)) {
      mkdirSync(this.baseDir, { recursive: true });
    }
  }

  /** Resolve a caller-supplied path against the storage root. */
  private resolvePath(filePath: string): string {
    return resolveWithin(this.baseDir, filePath);
  }

  async upload(
    file: Buffer,
    filePath: string,
    _contentType?: string,
  ): Promise<string> {
    const fullPath = this.resolvePath(filePath);
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, file);
    return filePath;
  }

  async uploadFromFile(
    filePath: string,
    localPath: string,
    _contentType?: string,
  ): Promise<string> {
    const fullPath = this.resolvePath(filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.copyFile(localPath, fullPath);
    return filePath;
  }

  async download(filePath: string, localPath: string): Promise<void> {
    const fullPath = this.resolvePath(filePath);
    await fs.mkdir(path.dirname(localPath), { recursive: true });
    await fs.copyFile(fullPath, localPath);
  }

  getUrl(filePath: string): string {
    return `/local/${filePath}`;
  }

  async delete(filePath: string): Promise<void> {
    const fullPath = this.resolvePath(filePath);
    try {
      await fs.unlink(fullPath);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }
  }

  async list(prefix: string, options?: ListOptions): Promise<FileEntry[]> {
    const dirPath = this.resolvePath(prefix);
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
      const stat = await fs.stat(path.join(dirPath, entry.name));

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

  async listObjects(prefix: string): Promise<StorageObject[]> {
    const dirPath = this.resolvePath(prefix);
    if (!existsSync(dirPath)) {
      return [];
    }

    const entries = await fs.readdir(dirPath, {
      recursive: true,
      withFileTypes: true,
    });
    const objects: StorageObject[] = [];

    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }

      const fullPath = path.join(entry.parentPath, entry.name);
      const stat = await fs.stat(fullPath);
      objects.push({
        key: path.relative(this.baseDir, fullPath),
        lastModified: stat.mtime,
        size: stat.size,
      });
    }

    return objects;
  }

  async exists(filePath: string): Promise<boolean> {
    const fullPath = this.resolvePath(filePath);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }
}
