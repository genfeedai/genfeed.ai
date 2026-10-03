import { constants, existsSync, mkdirSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  collectBoundedStorageBytes,
  createStorageReadContext,
  normalizeStorageReadError,
  StorageReadError,
} from './bounded-storage-read';
import {
  assertSafeObjectKey,
  resolveContainedPathWithoutSymlinks,
} from './path-containment';
import type {
  FileEntry,
  ListOptions,
  StorageObject,
  StorageReadOptions,
  VersionedStorageProvider,
} from './storage.provider';
import { resolveLocalStorageBaseDir } from './storage-base-dir';

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

export class LocalStorageProvider implements VersionedStorageProvider {
  private readonly baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = resolveLocalStorageBaseDir(baseDir);
    if (!existsSync(this.baseDir)) {
      mkdirSync(this.baseDir, { recursive: true });
    }
  }

  /** Resolve a caller-supplied path against the storage root. */
  private async resolvePath(filePath: string): Promise<string> {
    return resolveContainedPathWithoutSymlinks(
      this.baseDir,
      filePath === '' ? '.' : filePath,
      (message) => new Error(message),
    );
  }

  async readBytes(
    filePath: string,
    options: StorageReadOptions,
  ): Promise<Buffer> {
    return (await this.read(filePath, options)).bytes;
  }
  async readVersionedBytes(
    filePath: string,
    options: StorageReadOptions & { expectedVersion?: string },
  ): Promise<{ bytes: Buffer; version: string }> {
    return this.read(filePath, options);
  }
  private async read(
    filePath: string,
    options: StorageReadOptions & { expectedVersion?: string },
  ): Promise<{ bytes: Buffer; version: string }> {
    const context = createStorageReadContext(options);
    let token = '';
    let handle: fs.FileHandle | undefined;
    let primary: StorageReadError | undefined;
    let result: Buffer | undefined;
    try {
      context.throwIfAborted();
      const key = assertSafeObjectKey(
        filePath,
        () => new StorageReadError('storage_read_invalid_key'),
      );
      const fullPath = await resolveContainedPathWithoutSymlinks(
        this.baseDir,
        key,
        () => new StorageReadError('storage_read_invalid_key'),
      );
      context.throwIfAborted();
      handle = await fs.open(
        fullPath,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      context.throwIfAborted();
      const before = await handle.stat({ bigint: true });
      context.throwIfAborted();
      if (
        !before.isFile() ||
        before.size < 0n ||
        before.size > BigInt(Number.MAX_SAFE_INTEGER)
      )
        throw new StorageReadError('storage_read_invalid_response');
      if (before.size > BigInt(context.maxBytes))
        throw new StorageReadError('storage_read_limit_exceeded');
      token = `local:${before.dev}:${before.ino}:${before.size}:${before.mtimeNs}`;
      if (
        options.expectedVersion !== undefined &&
        options.expectedVersion !== token
      )
        throw new StorageReadError('storage_read_changed');
      await resolveContainedPathWithoutSymlinks(
        this.baseDir,
        key,
        () => new StorageReadError('storage_read_changed'),
      );
      context.throwIfAborted();
      const pathname = await fs.lstat(fullPath, { bigint: true });
      context.throwIfAborted();
      if (
        pathname.dev !== before.dev ||
        pathname.ino !== before.ino ||
        !pathname.isFile()
      )
        throw new StorageReadError('storage_read_changed');
      const opened = handle;
      const body = opened.createReadStream({
        autoClose: false,
        emitClose: true,
        highWaterMark: 65536,
        signal: context.signal,
      });
      result = await collectBoundedStorageBytes(
        body,
        Number(before.size),
        context,
        async () => {
          context.throwIfAborted();
          const after = await opened.stat({ bigint: true });
          context.throwIfAborted();
          if (
            before.dev !== after.dev ||
            before.ino !== after.ino ||
            before.size !== after.size ||
            before.mtimeNs !== after.mtimeNs ||
            before.ctimeNs !== after.ctimeNs
          )
            throw new StorageReadError('storage_read_changed');
        },
      );
    } catch (error) {
      primary = normalizeStorageReadError(error, context);
    } finally {
      try {
        await handle?.close();
      } catch (error) {
        primary ??= normalizeStorageReadError(error, context);
      } finally {
        if (!primary) {
          try {
            context.throwIfAborted();
          } catch (error) {
            primary = normalizeStorageReadError(error, context);
          }
        }
        context.dispose();
      }
    }
    if (primary) throw primary;
    if (!result) throw new StorageReadError('storage_read_unavailable');
    return { bytes: result, version: token };
  }

  async upload(
    file: Buffer,
    filePath: string,
    _contentType?: string,
  ): Promise<string> {
    const fullPath = await this.resolvePath(filePath);
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, file);
    return filePath;
  }

  async uploadFromFile(
    filePath: string,
    localPath: string,
    localRoot: string,
    _contentType?: string,
  ): Promise<string> {
    const fullPath = await this.resolvePath(filePath);
    const containedLocalPath = await resolveContainedPathWithoutSymlinks(
      localRoot,
      localPath,
      (message) => new Error(message),
    );
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.copyFile(containedLocalPath, fullPath);
    return filePath;
  }

  async download(
    filePath: string,
    localPath: string,
    localRoot: string,
  ): Promise<void> {
    const fullPath = await this.resolvePath(filePath);
    const containedLocalPath = await resolveContainedPathWithoutSymlinks(
      localRoot,
      localPath,
      (message) => new Error(message),
    );
    await fs.mkdir(path.dirname(containedLocalPath), { recursive: true });
    await fs.copyFile(fullPath, containedLocalPath);
  }

  getUrl(filePath: string): string {
    return `/local/${filePath}`;
  }

  async delete(filePath: string): Promise<void> {
    const fullPath = await this.resolvePath(filePath);
    try {
      await fs.unlink(fullPath);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }
  }

  async list(prefix: string, options?: ListOptions): Promise<FileEntry[]> {
    const dirPath = await this.resolvePath(prefix);
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
    const dirPath = await this.resolvePath(prefix);
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
    const fullPath = await this.resolvePath(filePath);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }
}
