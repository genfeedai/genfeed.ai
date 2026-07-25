import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAccess = vi.fn();
const mockCopyFile = vi.fn();
const mockMkdir = vi.fn();
const mockReaddir = vi.fn();
const mockStat = vi.fn();
const mockUnlink = vi.fn();
const mockWriteFile = vi.fn();

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  access: (...args: unknown[]) => mockAccess(...args),
  copyFile: (...args: unknown[]) => mockCopyFile(...args),
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  readdir: (...args: unknown[]) => mockReaddir(...args),
  stat: (...args: unknown[]) => mockStat(...args),
  unlink: (...args: unknown[]) => mockUnlink(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
}));

import { LocalStorageProvider } from './local-storage.provider';

const BASE_DIR = '/srv/genfeed/files';

/**
 * Each of these escapes the storage root once `path.join` is done with it —
 * either by walking up with `../` or, for the absolute forms, by replacing the
 * root outright under `path.resolve`.
 */
const ESCAPING_PATHS = [
  '../escaped.txt',
  '../../etc/passwd',
  'nested/../../escaped.txt',
  '..',
  '/etc/passwd',
  '/srv/genfeed/files-sibling/escaped.txt',
];

describe('LocalStorageProvider path containment', () => {
  let provider: LocalStorageProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    mockReaddir.mockResolvedValue([]);
    provider = new LocalStorageProvider(BASE_DIR);
  });

  describe('upload', () => {
    it.each(ESCAPING_PATHS)('rejects %s', async (filePath) => {
      await expect(
        provider.upload(Buffer.from('payload'), filePath),
      ).rejects.toThrow(/must stay within/);

      expect(mockWriteFile).not.toHaveBeenCalled();
      expect(mockMkdir).not.toHaveBeenCalled();
    });

    it('writes inside the storage root for an ordinary path', async () => {
      await provider.upload(Buffer.from('payload'), 'nested/ok.txt');

      expect(mockWriteFile).toHaveBeenCalledWith(
        `${BASE_DIR}/nested/ok.txt`,
        expect.any(Buffer),
      );
    });
  });

  describe('uploadFromFile', () => {
    it.each(ESCAPING_PATHS)('rejects %s', async (filePath) => {
      await expect(
        provider.uploadFromFile(filePath, '/tmp/source.txt'),
      ).rejects.toThrow(/must stay within/);

      expect(mockCopyFile).not.toHaveBeenCalled();
    });
  });

  describe('download', () => {
    it.each(ESCAPING_PATHS)('rejects %s', async (filePath) => {
      await expect(
        provider.download(filePath, '/tmp/destination.txt'),
      ).rejects.toThrow(/must stay within/);

      expect(mockCopyFile).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it.each(ESCAPING_PATHS)('rejects %s', async (filePath) => {
      await expect(provider.delete(filePath)).rejects.toThrow(
        /must stay within/,
      );

      expect(mockUnlink).not.toHaveBeenCalled();
    });

    it('unlinks inside the storage root for an ordinary path', async () => {
      await provider.delete('nested/ok.txt');

      expect(mockUnlink).toHaveBeenCalledWith(`${BASE_DIR}/nested/ok.txt`);
    });
  });

  describe('list', () => {
    it.each(ESCAPING_PATHS)('rejects %s', async (prefix) => {
      await expect(provider.list(prefix)).rejects.toThrow(/must stay within/);

      expect(mockReaddir).not.toHaveBeenCalled();
    });

    it('reads the resolved directory for an ordinary prefix', async () => {
      await provider.list('images');

      expect(mockReaddir).toHaveBeenCalledWith(`${BASE_DIR}/images`, {
        withFileTypes: true,
      });
    });
  });

  describe('listObjects', () => {
    it.each(ESCAPING_PATHS)('rejects %s', async (prefix) => {
      await expect(provider.listObjects(prefix)).rejects.toThrow(
        /must stay within/,
      );

      expect(mockReaddir).not.toHaveBeenCalled();
    });
  });

  describe('exists', () => {
    it.each(
      ESCAPING_PATHS,
    )('rejects %s rather than probing it', async (filePath) => {
      await expect(provider.exists(filePath)).rejects.toThrow(
        /must stay within/,
      );

      expect(mockAccess).not.toHaveBeenCalled();
    });
  });

  it('rejects a non-string path', async () => {
    await expect(
      provider.upload(Buffer.from('payload'), null as unknown as string),
    ).rejects.toThrow(/must be a string/);

    expect(mockWriteFile).not.toHaveBeenCalled();
  });
});
