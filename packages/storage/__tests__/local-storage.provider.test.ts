import { existsSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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

      const result = await provider.uploadFromFile('videos/clip.mp4', source);

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
        ),
      ).rejects.toThrow();
    });
  });

  describe('download', () => {
    it('copies a stored file to a local path, creating directories', async () => {
      await provider.upload(Buffer.from('stored'), 'datasets/d1/img.png');
      const target = path.join(scratchDir, 'nested/dir/img.png');

      await provider.download('datasets/d1/img.png', target);

      expect(await fs.readFile(target, 'utf8')).toBe('stored');
    });

    it('throws when the stored file does not exist', async () => {
      await expect(
        provider.download('missing/file.png', path.join(scratchDir, 'x.png')),
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
});
