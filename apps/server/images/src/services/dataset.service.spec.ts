import { ConfigService } from '@images/config/config.service';
import { DatasetService } from '@images/services/dataset.service';
import { S3Service } from '@images/services/s3.service';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

// Mock node:fs/promises
const mockReaddir = vi.fn();
const mockRm = vi.fn();
const mockStat = vi.fn();
const mockMkdir = vi.fn();

vi.mock('node:fs/promises', () => ({
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  readdir: (...args: unknown[]) => mockReaddir(...args),
  rm: (...args: unknown[]) => mockRm(...args),
  stat: (...args: unknown[]) => mockStat(...args),
}));

describe('DatasetService', () => {
  let service: DatasetService;
  let mockS3Service: {
    downloadFile: ReturnType<typeof vi.fn>;
    uploadFile: ReturnType<typeof vi.fn>;
    listObjects: ReturnType<typeof vi.fn>;
  };
  let mockLoggerService: {
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  const mockConfigService = {
    AWS_S3_BUCKET: 'test-bucket',
    DATASETS_PATH: '/datasets',
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    mockS3Service = {
      downloadFile: vi.fn().mockResolvedValue(undefined),
      listObjects: vi.fn().mockResolvedValue([]),
      uploadFile: vi.fn().mockResolvedValue(undefined),
    };

    mockLoggerService = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    mockMkdir.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatasetService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: S3Service, useValue: mockS3Service },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile();

    service = module.get<DatasetService>(DatasetService);
  });

  describe('syncDataset', () => {
    it('should download images from S3 to local dataset folder', async () => {
      const result = await service.syncDataset('my-persona', {
        s3Keys: ['uploads/photo1.jpg', 'uploads/photo2.png'],
      });

      expect(result.slug).toBe('my-persona');
      expect(result.downloaded).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.path).toBe('/datasets/my-persona');
      expect(mockS3Service.downloadFile).toHaveBeenCalledTimes(2);
      expect(mockMkdir).toHaveBeenCalledWith('/datasets/my-persona', {
        recursive: true,
      });
    });

    it('should use custom bucket when provided', async () => {
      await service.syncDataset('test', {
        bucket: 'custom-bucket',
        s3Keys: ['photo.jpg'],
      });

      expect(mockS3Service.downloadFile).toHaveBeenCalledWith(
        'custom-bucket',
        'photo.jpg',
        '/datasets/test/photo.jpg',
      );
    });

    it('should skip non-image files', async () => {
      const result = await service.syncDataset('test', {
        s3Keys: ['photo.jpg', 'document.pdf', 'script.sh'],
      });

      expect(result.downloaded).toBe(1);
      expect(result.failed).toBe(2);
      expect(result.errors).toHaveLength(2);
      expect(mockS3Service.downloadFile).toHaveBeenCalledTimes(1);
    });

    it('should throw on invalid slug', async () => {
      await expect(
        service.syncDataset('../evil', { s3Keys: ['photo.jpg'] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if s3Keys is empty', async () => {
      await expect(service.syncDataset('test', { s3Keys: [] })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should continue on individual download failures', async () => {
      mockS3Service.downloadFile
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('S3 error'));

      const result = await service.syncDataset('test', {
        s3Keys: ['good.jpg', 'bad.jpg'],
      });

      expect(result.downloaded).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('S3 error');
    });
  });

  describe('getDataset', () => {
    it('should return dataset info with image list', async () => {
      mockStat.mockResolvedValue({ isDirectory: () => true });
      mockReaddir.mockResolvedValue([
        'photo1.jpg',
        'photo2.png',
        'photo3.webp',
        'caption.txt',
        'readme.md',
      ]);

      const result = await service.getDataset('my-persona');

      expect(result.slug).toBe('my-persona');
      expect(result.imageCount).toBe(3);
      expect(result.images).toEqual([
        'photo1.jpg',
        'photo2.png',
        'photo3.webp',
      ]);
      expect(result.path).toBe('/datasets/my-persona');
    });

    it('should throw NotFoundException for non-existent dataset', async () => {
      const error = new Error('ENOENT') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      mockStat.mockRejectedValue(error);

      await expect(service.getDataset('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw on invalid slug', async () => {
      await expect(service.getDataset('../../etc')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('deleteDataset', () => {
    it('should delete an existing dataset directory', async () => {
      mockStat.mockResolvedValue({ isDirectory: () => true });
      mockRm.mockResolvedValue(undefined);

      const result = await service.deleteDataset('my-persona');

      expect(result.slug).toBe('my-persona');
      expect(result.deleted).toBe(true);
      expect(mockRm).toHaveBeenCalledWith('/datasets/my-persona', {
        force: true,
        recursive: true,
      });
    });

    it('should throw NotFoundException for non-existent dataset', async () => {
      mockStat.mockRejectedValue(new Error('ENOENT'));

      await expect(service.deleteDataset('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw on invalid slug', async () => {
      await expect(service.deleteDataset('$bad slug!')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
