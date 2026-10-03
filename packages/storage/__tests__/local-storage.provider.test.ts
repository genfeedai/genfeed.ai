import { existsSync, ReadStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as boundedRead from '../src/bounded-storage-read';
import { LocalStorageProvider } from '../src/local-storage.provider';

describe('LocalStorageProvider', () => {
  let baseDir: string;
  let scratchDir: string;
  let provider: LocalStorageProvider;

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(tmpdir(), 'genfeed-storage-base-'));
    scratchDir = await fs.mkdtemp(
      path.join(tmpdir(), 'genfeed-storage-scratch-'),
    );
    provider = new LocalStorageProvider(baseDir);
  });

  afterEach(async () => {
    await fs.rm(baseDir, { force: true, recursive: true });
    await fs.rm(scratchDir, { force: true, recursive: true });
  });

  it('returns a local pin and rejects it after a rewrite', async () => {
    const options = { maxBytes: 100, timeoutMs: 1000 };
    await provider.upload(Buffer.from('first'), 'image.png');
    const first = await provider.readVersionedBytes('image.png', options);
    expect(first.bytes).toEqual(Buffer.from('first'));
    expect(first.version).toMatch(/^local:\d+:\d+:5:\d+$/);
    await provider.upload(Buffer.from('rewritten'), 'image.png');
    const second = await provider.readVersionedBytes('image.png', options);
    expect(second.version).not.toBe(first.version);
    await expect(
      provider.readVersionedBytes('image.png', {
        ...options,
        expectedVersion: first.version,
      }),
    ).rejects.toThrow('storage_read_changed');
  });
  it('rejects an oversized versioned file', async () => {
    await provider.upload(Buffer.alloc(21), 'image.png');
    await expect(
      provider.readVersionedBytes('image.png', {
        maxBytes: 20,
        timeoutMs: 1000,
      }),
    ).rejects.toThrow('storage_read_limit_exceeded');
  });
  describe('upload', () => {
    it('writes buffer under base dir and returns the path', async () => {
      const result = await provider.upload(
        Buffer.from('hello'),
        'images/a/photo.png',
      );

      expect(result).toBe('images/a/photo.png');
      const written = await fs.readFile(
        path.join(baseDir, 'images/a/photo.png'),
        'utf8',
      );
      expect(written).toBe('hello');
    });
  });

  describe('uploadFromFile', () => {
    it('copies a local file into storage', async () => {
      const source = path.join(scratchDir, 'video.mp4');
      await fs.writeFile(source, 'video-bytes');

      const result = await provider.uploadFromFile(
        'videos/clip.mp4',
        source,
        scratchDir,
      );

      expect(result).toBe('videos/clip.mp4');
      const written = await fs.readFile(
        path.join(baseDir, 'videos/clip.mp4'),
        'utf8',
      );
      expect(written).toBe('video-bytes');
    });

    it('throws when the source file does not exist', async () => {
      await expect(
        provider.uploadFromFile(
          'videos/clip.mp4',
          path.join(scratchDir, 'missing.mp4'),
          scratchDir,
        ),
      ).rejects.toThrow();
    });
  });

  describe('download', () => {
    it('copies a stored file to a local path, creating directories', async () => {
      await provider.upload(Buffer.from('stored'), 'datasets/d1/img.png');
      const target = path.join(scratchDir, 'nested/dir/img.png');

      await provider.download('datasets/d1/img.png', target, scratchDir);

      expect(await fs.readFile(target, 'utf8')).toBe('stored');
    });

    it('throws when the stored file does not exist', async () => {
      await expect(
        provider.download(
          'missing/file.png',
          path.join(scratchDir, 'x.png'),
          scratchDir,
        ),
      ).rejects.toThrow();
    });
  });

  describe('listObjects', () => {
    it('recursively lists all files under a prefix with size and mtime', async () => {
      await provider.upload(Buffer.from('a'), 'loras/model-a.safetensors');
      await provider.upload(Buffer.from('bb'), 'loras/sub/model-b.safetensors');
      await provider.upload(Buffer.from('ccc'), 'other/file.txt');

      const objects = await provider.listObjects('loras');

      expect(objects).toHaveLength(2);
      const keys = objects.map((obj) => obj.key).sort();
      expect(keys).toEqual([
        'loras/model-a.safetensors',
        'loras/sub/model-b.safetensors',
      ]);
      const modelA = objects.find(
        (obj) => obj.key === 'loras/model-a.safetensors',
      );
      expect(modelA?.size).toBe(1);
      expect(modelA?.lastModified).toBeInstanceOf(Date);
    });

    it('returns empty array for unknown prefix', async () => {
      expect(await provider.listObjects('nope')).toEqual([]);
    });
  });

  describe('existing surface', () => {
    it('exists / delete / list still behave', async () => {
      await provider.upload(Buffer.from('x'), 'media/a.png');

      expect(await provider.exists('media/a.png')).toBe(true);
      const entries = await provider.list('media');
      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe('image');

      await provider.delete('media/a.png');
      expect(await provider.exists('media/a.png')).toBe(false);
      expect(existsSync(path.join(baseDir, 'media/a.png'))).toBe(false);
    });
  });
  describe('native bounded reads', () => {
    afterEach(() => vi.restoreAllMocks());
    it('returns exact stored bytes and rejects oversized metadata', async () => {
      await provider.upload(Buffer.from([0, 1, 255]), 'bytes.bin');
      expect(
        await provider.readBytes('bytes.bin', { maxBytes: 3, timeoutMs: 1000 }),
      ).toEqual(Buffer.from([0, 1, 255]));
      await expect(
        provider.readBytes('bytes.bin', { maxBytes: 2, timeoutMs: 1000 }),
      ).rejects.toThrow('storage_read_limit_exceeded');
    });
    it.each(['../escape', '/absolute', 'https://private.invalid/key'])(
      'rejects unsafe key %s',
      async (key) => {
        await expect(
          provider.readBytes(key, { maxBytes: 1, timeoutMs: 1000 }),
        ).rejects.toThrow('storage_read_invalid_key');
      },
    );
    it('rejects symlinks and already-aborted reads without opening a payload stream', async () => {
      await fs.writeFile(path.join(scratchDir, 'outside'), Buffer.from([1]));
      await fs.symlink(
        path.join(scratchDir, 'outside'),
        path.join(baseDir, 'link'),
      );
      await expect(
        provider.readBytes('link', { maxBytes: 1, timeoutMs: 1000 }),
      ).rejects.toThrow('storage_read_invalid_key');
      const signal = new AbortController();
      signal.abort();
      await expect(
        provider.readBytes('missing', {
          maxBytes: 1,
          timeoutMs: 1000,
          signal: signal.signal,
        }),
      ).rejects.toThrow('storage_read_aborted');
    });
    it.each(['grow', 'truncate', 'rewrite'] as const)(
      'rejects source %s after actual payload collection',
      async (change) => {
        await provider.upload(Buffer.from([1, 2, 3]), 'changing');
        const collect = boundedRead.collectBoundedStorageBytes;
        vi.spyOn(
          boundedRead,
          'collectBoundedStorageBytes',
        ).mockImplementationOnce(async (body, size, context, beforeClose) => {
          return collect(body, size, context, async () => {
            const filename = path.join(baseDir, 'changing');
            if (change === 'grow')
              await fs.appendFile(filename, Buffer.from([4]));
            else if (change === 'truncate') await fs.truncate(filename, 1);
            else {
              const beforeStat = await fs.stat(filename);
              await fs.writeFile(filename, Buffer.from([3, 2, 1]));
              await fs.utimes(
                filename,
                beforeStat.atime,
                new Date(beforeStat.mtimeMs + 2000),
              );
            }
            await beforeClose?.();
          });
        });
        await expect(
          provider.readBytes('changing', { maxBytes: 3, timeoutMs: 1000 }),
        ).rejects.toThrow('storage_read_changed');
      },
    );
    it('accepts exact 20MiB and closes resources so the file can be removed', async () => {
      await provider.upload(
        Buffer.alloc(boundedRead.STORAGE_READ_MAX_BYTES, 7),
        'boundary',
      );
      const result = await provider.readBytes('boundary', {
        maxBytes: boundedRead.STORAGE_READ_MAX_BYTES,
        timeoutMs: 30000,
      });
      expect(result.length).toBe(boundedRead.STORAGE_READ_MAX_BYTES);
      expect(result.at(-1)).toBe(7);
      await fs.unlink(path.join(baseDir, 'boundary'));
    });
  });
  it('checks stability on the open native descriptor and closes before returning, including empty files', async () => {
    for (const bytes of [Buffer.alloc(0), Buffer.from([1])]) {
      await provider.upload(bytes, 'lifecycle');
      let opened: ReadStream | undefined;
      let checked = false;
      const collect = boundedRead.collectBoundedStorageBytes;
      vi.spyOn(
        boundedRead,
        'collectBoundedStorageBytes',
      ).mockImplementationOnce(async (body, size, context, beforeClose) => {
        if (!(body instanceof ReadStream))
          throw new Error('Expected actual file stream');
        opened = body;
        return collect(body, size, context, async () => {
          expect(body.destroyed).toBe(false);
          expect(Reflect.get(body, 'fd')).toBeTypeOf('number');
          await beforeClose?.();
          checked = true;
        });
      });
      expect(
        await provider.readBytes('lifecycle', { maxBytes: 1, timeoutMs: 1000 }),
      ).toEqual(bytes);
      expect(checked).toBe(true);
      expect(opened?.closed).toBe(true);
      if (!opened) throw new Error('Missing actual stream');
      expect(Reflect.get(opened, 'fd')).toBeNull();
      vi.restoreAllMocks();
    }
  });
});
