import * as fs from 'node:fs';
import { FileSystemUtil } from '@files/helpers/utils/file-system/file-system.util';
import type { Mock } from 'vitest';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  promises: {
    access: vi.fn(),
    copyFile: vi.fn(),
    mkdir: vi.fn(),
    readdir: vi.fn(),
    readFile: vi.fn(),
    rename: vi.fn(),
    stat: vi.fn(),
    unlink: vi.fn(),
    writeFile: vi.fn(),
  },
}));

describe('FileSystemUtil', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('ensureDir', () => {
    it('creates directory when it does not exist', async () => {
      (fs.existsSync as Mock).mockReturnValue(false);
      (fs.promises.mkdir as Mock).mockResolvedValue(undefined);

      await FileSystemUtil.ensureDir('public/tmp');

      expect(fs.promises.mkdir).toHaveBeenCalledWith('public/tmp', {
        recursive: true,
      });
    });

    it('skips creation when directory exists', async () => {
      (fs.existsSync as Mock).mockReturnValue(true);

      await FileSystemUtil.ensureDir('public/tmp');

      expect(fs.promises.mkdir).not.toHaveBeenCalled();
    });
  });

  describe('exists', () => {
    it('returns true when access succeeds', async () => {
      (fs.promises.access as Mock).mockResolvedValue(undefined);

      await expect(FileSystemUtil.exists('public/tmp/file.txt')).resolves.toBe(
        true,
      );
    });

    it('returns false when access fails', async () => {
      (fs.promises.access as Mock).mockRejectedValue(new Error('missing'));

      await expect(FileSystemUtil.exists('public/tmp/file.txt')).resolves.toBe(
        false,
      );
    });
  });

  describe('getFileSize', () => {
    it('returns file size in bytes', async () => {
      (fs.promises.stat as Mock).mockResolvedValue({ size: 1234 });

      await expect(
        FileSystemUtil.getFileSize('public/tmp/file.txt'),
      ).resolves.toBe(1234);
    });
  });

  describe('readFile', () => {
    it('reads file with default utf8 encoding', async () => {
      (fs.promises.readFile as Mock).mockResolvedValue('content');

      await expect(
        FileSystemUtil.readFile('public/tmp/file.txt'),
      ).resolves.toBe('content');

      expect(fs.promises.readFile).toHaveBeenCalledWith(
        'public/tmp/file.txt',
        'utf8',
      );
    });
  });

  describe('writeFile', () => {
    it('ensures directory exists before writing', async () => {
      const ensureSpy = vi
        .spyOn(FileSystemUtil, 'ensureDir')
        .mockResolvedValue(undefined);
      (fs.promises.writeFile as Mock).mockResolvedValue(undefined);

      await FileSystemUtil.writeFile('public/tmp/file.txt', 'data');

      expect(ensureSpy).toHaveBeenCalledWith('public/tmp');
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        'public/tmp/file.txt',
        'data',
      );
    });
  });

  describe('deleteFile', () => {
    it('deletes files that exist', async () => {
      vi.spyOn(FileSystemUtil, 'exists').mockResolvedValue(true);
      (fs.promises.unlink as Mock).mockResolvedValue(undefined);

      await FileSystemUtil.deleteFile('public/tmp/file.txt');

      expect(fs.promises.unlink).toHaveBeenCalledWith('public/tmp/file.txt');
    });

    it('skips deletion when file is missing', async () => {
      vi.spyOn(FileSystemUtil, 'exists').mockResolvedValue(false);

      await FileSystemUtil.deleteFile('public/tmp/file.txt');

      expect(fs.promises.unlink).not.toHaveBeenCalled();
    });
  });

  describe('listFiles', () => {
    it('filters by extension when provided', async () => {
      (fs.promises.readdir as Mock).mockResolvedValue([
        'a.txt',
        'b.png',
        'c.txt',
      ]);

      await expect(
        FileSystemUtil.listFiles('public/tmp', '.txt'),
      ).resolves.toEqual(['a.txt', 'c.txt']);
    });
  });

  describe('copyFile', () => {
    it('copies file after ensuring destination directory', async () => {
      const ensureSpy = vi
        .spyOn(FileSystemUtil, 'ensureDir')
        .mockResolvedValue(undefined);
      (fs.promises.copyFile as Mock).mockResolvedValue(undefined);

      await FileSystemUtil.copyFile(
        'public/src/file.txt',
        'public/tmp/file.txt',
      );

      expect(ensureSpy).toHaveBeenCalledWith('public/tmp');
      expect(fs.promises.copyFile).toHaveBeenCalledWith(
        'public/src/file.txt',
        'public/tmp/file.txt',
      );
    });
  });

  describe('moveFile', () => {
    it('moves file after ensuring destination directory', async () => {
      const ensureSpy = vi
        .spyOn(FileSystemUtil, 'ensureDir')
        .mockResolvedValue(undefined);
      (fs.promises.rename as Mock).mockResolvedValue(undefined);

      await FileSystemUtil.moveFile(
        'public/src/file.txt',
        'public/tmp/file.txt',
      );

      expect(ensureSpy).toHaveBeenCalledWith('public/tmp');
      expect(fs.promises.rename).toHaveBeenCalledWith(
        'public/src/file.txt',
        'public/tmp/file.txt',
      );
    });
  });

  describe('cleanupFile', () => {
    it('silently handles unlink failures', async () => {
      vi.spyOn(FileSystemUtil, 'exists').mockResolvedValue(true);
      (fs.promises.unlink as Mock).mockRejectedValue(new Error('locked'));

      await expect(
        FileSystemUtil.cleanupFile('public/tmp/file.txt'),
      ).resolves.not.toThrow();
    });
  });
});
