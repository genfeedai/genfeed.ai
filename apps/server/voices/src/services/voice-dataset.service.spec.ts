import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@voices/config/config.service';
import { S3Service } from '@voices/services/s3.service';
import { VoiceDatasetService } from '@voices/services/voice-dataset.service';

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

describe('VoiceDatasetService', () => {
  let service: VoiceDatasetService;
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
        VoiceDatasetService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: S3Service, useValue: mockS3Service },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile();

    service = module.get<VoiceDatasetService>(VoiceDatasetService);
  });

  describe('syncFromS3', () => {
    it('should download audio samples from S3 to local dataset folder', async () => {
      const result = await service.syncFromS3('my-voice', {
        s3Keys: ['uploads/sample1.wav', 'uploads/sample2.mp3'],
      });

      expect(result.voiceId).toBe('my-voice');
      expect(result.downloaded).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.path).toBe('/datasets/voices/my-voice');
      expect(mockS3Service.downloadFile).toHaveBeenCalledTimes(2);
      expect(mockMkdir).toHaveBeenCalledWith('/datasets/voices/my-voice', {
        recursive: true,
      });
    });

    it('should use custom bucket when provided', async () => {
      await service.syncFromS3('test', {
        bucket: 'custom-bucket',
        s3Keys: ['sample.wav'],
      });

      expect(mockS3Service.downloadFile).toHaveBeenCalledWith(
        'custom-bucket',
        'sample.wav',
        '/datasets/voices/test/sample.wav',
      );
    });

    it('should skip non-audio files', async () => {
      const result = await service.syncFromS3('test', {
        s3Keys: ['sample.wav', 'document.pdf', 'script.sh'],
      });

      expect(result.downloaded).toBe(1);
      expect(result.failed).toBe(2);
      expect(result.errors).toHaveLength(2);
      expect(mockS3Service.downloadFile).toHaveBeenCalledTimes(1);
    });

    it('should throw on invalid voiceId', async () => {
      await expect(
        service.syncFromS3('../evil', { s3Keys: ['sample.wav'] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if s3Keys is empty', async () => {
      await expect(service.syncFromS3('test', { s3Keys: [] })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should continue on individual download failures', async () => {
      mockS3Service.downloadFile
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('S3 error'));

      const result = await service.syncFromS3('test', {
        s3Keys: ['good.wav', 'bad.wav'],
      });

      expect(result.downloaded).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('S3 error');
    });

    it('should accept all allowed audio extensions', async () => {
      const result = await service.syncFromS3('test', {
        s3Keys: [
          'a.wav',
          'b.mp3',
          'c.flac',
          'd.ogg',
          'e.m4a',
          'f.aac',
          'g.wma',
          'h.opus',
        ],
      });

      expect(result.downloaded).toBe(8);
      expect(result.failed).toBe(0);
    });
  });

  describe('getDatasetInfo', () => {
    it('should return dataset info with sample list', async () => {
      mockStat.mockResolvedValue({ isDirectory: () => true });
      mockReaddir.mockResolvedValue([
        'sample1.wav',
        'sample2.mp3',
        'sample3.flac',
        'metadata.json',
        'readme.md',
      ]);

      const result = await service.getDatasetInfo('my-voice');

      expect(result.voiceId).toBe('my-voice');
      expect(result.sampleCount).toBe(3);
      expect(result.samples).toEqual([
        'sample1.wav',
        'sample2.mp3',
        'sample3.flac',
      ]);
      expect(result.path).toBe('/datasets/voices/my-voice');
    });

    it('should throw NotFoundException for non-existent dataset', async () => {
      const error = new Error('ENOENT') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      mockStat.mockRejectedValue(error);

      await expect(service.getDatasetInfo('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw on invalid voiceId', async () => {
      await expect(service.getDatasetInfo('../../etc')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('deleteDataset', () => {
    it('should delete an existing dataset directory', async () => {
      mockStat.mockResolvedValue({ isDirectory: () => true });
      mockRm.mockResolvedValue(undefined);

      const result = await service.deleteDataset('my-voice');

      expect(result.voiceId).toBe('my-voice');
      expect(result.deleted).toBe(true);
      expect(mockRm).toHaveBeenCalledWith('/datasets/voices/my-voice', {
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

    it('should throw on invalid voiceId', async () => {
      await expect(service.deleteDataset('$bad slug!')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
