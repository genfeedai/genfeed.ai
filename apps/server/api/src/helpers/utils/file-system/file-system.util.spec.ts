import { promises as fs } from 'node:fs';
import { FileSystemUtil } from '@api/helpers/utils/file-system/file-system.util';

// Mock the fs module
vi.mock('fs', () => ({
  promises: {
    access: vi.fn(),
    mkdir: vi.fn(),
    stat: vi.fn(),
    unlink: vi.fn(),
    writeFile: vi.fn(),
  },
}));

describe('FileSystemUtil', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createTempFile', () => {
    it('should create a temporary file when directory exists', async () => {
      const key = 'test-key';
      const body = Buffer.from('test content');
      const extension = 'txt';

      (fs.access as vi.Mock).mockResolvedValue(undefined);
      (fs.writeFile as vi.Mock).mockResolvedValue(undefined);

      const result = await FileSystemUtil.createTempFile(key, body, extension);

      expect(result).toContain('public');
      expect(result).toContain('tmp');
      expect(result).toContain('test-key.txt');
      expect(fs.access).toHaveBeenCalledWith(expect.stringContaining('tmp'));
      expect(fs.writeFile).toHaveBeenCalledWith(result, body);
    });

    it('should create directory if it does not exist', async () => {
      const key = 'test-key';
      const body = Buffer.from('test content');
      const extension = 'txt';

      (fs.access as vi.Mock).mockRejectedValue(
        new Error('Directory not found'),
      );
      (fs.mkdir as vi.Mock).mockResolvedValue(undefined);
      (fs.writeFile as vi.Mock).mockResolvedValue(undefined);

      await FileSystemUtil.createTempFile(key, body, extension);

      expect(fs.mkdir).toHaveBeenCalledWith(expect.stringContaining('tmp'), {
        recursive: true,
      });
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should handle different file extensions', async () => {
      const key = 'image-key';
      const body = Buffer.from('image data');

      (fs.access as vi.Mock).mockResolvedValue(undefined);
      (fs.writeFile as vi.Mock).mockResolvedValue(undefined);

      const jpgResult = await FileSystemUtil.createTempFile(key, body, 'jpg');
      expect(jpgResult).toContain('.jpg');

      const pngResult = await FileSystemUtil.createTempFile(key, body, 'png');
      expect(pngResult).toContain('.png');

      const mp4Result = await FileSystemUtil.createTempFile(key, body, 'mp4');
      expect(mp4Result).toContain('.mp4');
    });
  });

  describe('cleanupFile', () => {
    it('should delete file successfully', async () => {
      const filePath = '/path/to/file.txt';

      (fs.unlink as vi.Mock).mockResolvedValue(undefined);

      await FileSystemUtil.cleanupFile(filePath);

      expect(fs.unlink).toHaveBeenCalledWith(filePath);
    });

    it('should not throw error if file deletion fails', async () => {
      const filePath = '/path/to/nonexistent.txt';
      const error = new Error('File not found');

      (fs.unlink as vi.Mock).mockRejectedValue(error);

      await expect(FileSystemUtil.cleanupFile(filePath)).resolves.not.toThrow();
      expect(fs.unlink).toHaveBeenCalledWith(filePath);
    });
  });

  describe('cleanupFiles', () => {
    it('should clean up multiple files', async () => {
      const filePaths = [
        '/path/to/file1.txt',
        '/path/to/file2.txt',
        '/path/to/file3.txt',
      ];

      (fs.unlink as vi.Mock).mockResolvedValue(undefined);

      await FileSystemUtil.cleanupFiles(filePaths);

      expect(fs.unlink).toHaveBeenCalledTimes(3);
      expect(fs.unlink).toHaveBeenCalledWith(filePaths[0]);
      expect(fs.unlink).toHaveBeenCalledWith(filePaths[1]);
      expect(fs.unlink).toHaveBeenCalledWith(filePaths[2]);
    });

    it('should not throw if some deletions fail', async () => {
      const filePaths = [
        '/path/to/file1.txt',
        '/path/to/file2.txt',
        '/path/to/file3.txt',
      ];

      (fs.unlink as vi.Mock)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('File not found'))
        .mockResolvedValueOnce(undefined);

      await expect(
        FileSystemUtil.cleanupFiles(filePaths),
      ).resolves.not.toThrow();
      expect(fs.unlink).toHaveBeenCalledTimes(3);
    });

    it('should handle empty array', async () => {
      await expect(FileSystemUtil.cleanupFiles([])).resolves.not.toThrow();
      expect(fs.unlink).not.toHaveBeenCalled();
    });
  });

  describe('fileExists', () => {
    it('should return true if file exists', async () => {
      const filePath = '/path/to/existing-file.txt';

      (fs.access as vi.Mock).mockResolvedValue(undefined);

      const result = await FileSystemUtil.fileExists(filePath);

      expect(result).toBe(true);
      expect(fs.access).toHaveBeenCalledWith(filePath);
    });

    it('should return false if file does not exist', async () => {
      const filePath = '/path/to/nonexistent-file.txt';

      (fs.access as vi.Mock).mockRejectedValue(new Error('File not found'));

      const result = await FileSystemUtil.fileExists(filePath);

      expect(result).toBe(false);
      expect(fs.access).toHaveBeenCalledWith(filePath);
    });
  });

  describe('getFileSize', () => {
    it('should return file size in bytes', async () => {
      const filePath = '/path/to/file.txt';
      const mockSize = 1024;

      (fs.stat as vi.Mock).mockResolvedValue({ size: mockSize });

      const result = await FileSystemUtil.getFileSize(filePath);

      expect(result).toBe(mockSize);
      expect(fs.stat).toHaveBeenCalledWith(filePath);
    });

    it('should handle large files', async () => {
      const filePath = '/path/to/large-file.mp4';
      const mockSize = 1024 * 1024 * 100; // 100MB

      (fs.stat as vi.Mock).mockResolvedValue({ size: mockSize });

      const result = await FileSystemUtil.getFileSize(filePath);

      expect(result).toBe(mockSize);
    });

    it('should handle zero-size files', async () => {
      const filePath = '/path/to/empty-file.txt';

      (fs.stat as vi.Mock).mockResolvedValue({ size: 0 });

      const result = await FileSystemUtil.getFileSize(filePath);

      expect(result).toBe(0);
    });
  });

  describe('ensureDirectory', () => {
    it('should not create directory if it exists', async () => {
      const dirPath = '/path/to/existing-dir';

      (fs.access as vi.Mock).mockResolvedValue(undefined);

      await FileSystemUtil.ensureDirectory(dirPath);

      expect(fs.access).toHaveBeenCalledWith(dirPath);
      expect(fs.mkdir).not.toHaveBeenCalled();
    });

    it('should create directory if it does not exist', async () => {
      const dirPath = '/path/to/new-dir';

      (fs.access as vi.Mock).mockRejectedValue(
        new Error('Directory not found'),
      );
      (fs.mkdir as vi.Mock).mockResolvedValue(undefined);

      await FileSystemUtil.ensureDirectory(dirPath);

      expect(fs.access).toHaveBeenCalledWith(dirPath);
      expect(fs.mkdir).toHaveBeenCalledWith(dirPath, { recursive: true });
    });

    it('should create nested directories', async () => {
      const dirPath = '/path/to/deeply/nested/dir';

      (fs.access as vi.Mock).mockRejectedValue(
        new Error('Directory not found'),
      );
      (fs.mkdir as vi.Mock).mockResolvedValue(undefined);

      await FileSystemUtil.ensureDirectory(dirPath);

      expect(fs.mkdir).toHaveBeenCalledWith(dirPath, { recursive: true });
    });
  });

  describe('generateTempFileName', () => {
    it('should generate unique temporary filename', () => {
      const extension = 'txt';

      const fileName1 = FileSystemUtil.generateTempFileName(extension);
      const fileName2 = FileSystemUtil.generateTempFileName(extension);

      expect(fileName1).toMatch(/^temp_\d+_[a-z0-9]+\.txt$/);
      expect(fileName2).toMatch(/^temp_\d+_[a-z0-9]+\.txt$/);
      expect(fileName1).not.toBe(fileName2);
    });

    it('should handle different extensions', () => {
      const jpgName = FileSystemUtil.generateTempFileName('jpg');
      expect(jpgName).toContain('.jpg');
      expect(jpgName).toMatch(/^temp_\d+_[a-z0-9]+\.jpg$/);

      const mp4Name = FileSystemUtil.generateTempFileName('mp4');
      expect(mp4Name).toContain('.mp4');
      expect(mp4Name).toMatch(/^temp_\d+_[a-z0-9]+\.mp4$/);
    });

    it('should include timestamp and random component', () => {
      const fileName = FileSystemUtil.generateTempFileName('txt');
      const parts = fileName.split('_');

      expect(parts.length).toBeGreaterThanOrEqual(3);
      expect(parts[0]).toBe('temp');
      expect(parseInt(parts[1], 10)).toBeGreaterThan(0);
    });

    it('should generate unique names in quick succession', () => {
      const names = new Set();
      for (let i = 0; i < 100; i++) {
        names.add(FileSystemUtil.generateTempFileName('txt'));
      }

      // All names should be unique
      expect(names.size).toBe(100);
    });
  });
});
