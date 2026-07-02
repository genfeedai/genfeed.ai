import { LoggerService } from '@libs/logger/logger.service';
import { S3Service } from '@libs/s3/s3.service';
import { Test, type TestingModule } from '@nestjs/testing';

const mockProvider = {
  delete: vi.fn(),
  download: vi.fn().mockResolvedValue(undefined),
  exists: vi.fn(),
  getUrl: vi.fn(),
  list: vi.fn(),
  listObjects: vi.fn().mockResolvedValue([]),
  upload: vi.fn(),
  uploadFromFile: vi.fn().mockResolvedValue(''),
};

const mockCreateStorageProvider = vi.fn().mockReturnValue(mockProvider);

vi.mock('@genfeedai/storage', () => ({
  createStorageProvider: (options?: Record<string, unknown>) =>
    mockCreateStorageProvider(options),
}));

vi.mock('node:fs/promises', () => ({
  stat: vi.fn().mockResolvedValue({ size: 9 }),
}));

vi.mock('@libs/utils/caller/caller.util', () => ({
  CallerUtil: { getCallerName: vi.fn().mockReturnValue('test-caller') },
}));

const mockConfigService = {
  AWS_ACCESS_KEY_ID: 'test-key',
  AWS_REGION: 'us-east-1',
  AWS_SECRET_ACCESS_KEY: 'test-secret',
};

describe('S3Service (shared @libs/s3, thin wrapper over @genfeedai/storage)', () => {
  let service: S3Service;
  let mockLoggerService: {
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockCreateStorageProvider.mockReturnValue(mockProvider);

    mockLoggerService = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        S3Service,
        { provide: 'ConfigService', useValue: mockConfigService },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile();

    service = module.get<S3Service>(S3Service);
  });

  describe('provider resolution', () => {
    it('creates the provider lazily with config credentials and the bucket', async () => {
      expect(mockCreateStorageProvider).not.toHaveBeenCalled();

      await service.downloadFile('bucket-a', 'k.png', '/tmp/k.png');

      expect(mockCreateStorageProvider).toHaveBeenCalledTimes(1);
      expect(mockCreateStorageProvider).toHaveBeenCalledWith({
        accessKeyId: 'test-key',
        bucket: 'bucket-a',
        region: 'us-east-1',
        secretAccessKey: 'test-secret',
      });
    });

    it('caches one provider per bucket', async () => {
      await service.downloadFile('bucket-a', 'k1.png', '/tmp/k1.png');
      await service.downloadFile('bucket-a', 'k2.png', '/tmp/k2.png');
      await service.downloadFile('bucket-b', 'k3.png', '/tmp/k3.png');

      expect(mockCreateStorageProvider).toHaveBeenCalledTimes(2);
    });
  });

  describe('downloadFile', () => {
    it('delegates to provider.download', async () => {
      await service.downloadFile(
        'test-bucket',
        'images/photo.jpg',
        '/tmp/photo.jpg',
      );

      expect(mockProvider.download).toHaveBeenCalledWith(
        'images/photo.jpg',
        '/tmp/photo.jpg',
      );
      expect(mockLoggerService.log).toHaveBeenCalledTimes(2);
    });

    it('propagates provider errors', async () => {
      mockProvider.download.mockRejectedValueOnce(
        new Error('Empty response body'),
      );

      await expect(
        service.downloadFile('test-bucket', 'images/photo.jpg', '/tmp/p.jpg'),
      ).rejects.toThrow('Empty response body');
    });
  });

  describe('uploadFile', () => {
    it('delegates to provider.uploadFromFile with explicit content type', async () => {
      await service.uploadFile(
        'test-bucket',
        'videos/job123/video.mp4',
        '/tmp/video.mp4',
        'video/mp4',
      );

      expect(mockProvider.uploadFromFile).toHaveBeenCalledWith(
        'videos/job123/video.mp4',
        '/tmp/video.mp4',
        'video/mp4',
      );
      expect(mockLoggerService.log).toHaveBeenCalledTimes(2);
    });

    it('passes undefined content type through for provider-side inference', async () => {
      await service.uploadFile('test-bucket', 'images/photo.jpg', '/tmp/p.jpg');

      expect(mockProvider.uploadFromFile).toHaveBeenCalledWith(
        'images/photo.jpg',
        '/tmp/p.jpg',
        undefined,
      );
    });
  });

  describe('uploadSafetensors', () => {
    it('uploads with the canonical S3 key and octet-stream content type', async () => {
      const result = await service.uploadSafetensors(
        'test-bucket',
        'my-lora',
        '/tmp/my-lora.safetensors',
      );

      expect(result.s3Key).toBe(
        'ingredients/trainings/loras/my-lora.safetensors',
      );
      expect(result.sizeBytes).toBe(9);
      expect(mockProvider.uploadFromFile).toHaveBeenCalledWith(
        'ingredients/trainings/loras/my-lora.safetensors',
        '/tmp/my-lora.safetensors',
        'application/octet-stream',
      );
      expect(mockLoggerService.log).toHaveBeenCalledTimes(2);
    });
  });

  describe('listObjects', () => {
    it('maps StorageObject entries to S3Object with ISO lastModified', async () => {
      mockProvider.listObjects.mockResolvedValueOnce([
        {
          key: 'ingredients/trainings/loras/model-a.safetensors',
          lastModified: new Date('2024-01-01T00:00:00.000Z'),
          size: 1024,
        },
        {
          key: 'ingredients/trainings/loras/model-b.safetensors',
          lastModified: new Date('2024-01-02T00:00:00.000Z'),
          size: 2048,
        },
      ]);

      const result = await service.listObjects(
        'test-bucket',
        'ingredients/trainings/loras/',
      );

      expect(mockProvider.listObjects).toHaveBeenCalledWith(
        'ingredients/trainings/loras/',
      );
      expect(result).toEqual([
        {
          key: 'ingredients/trainings/loras/model-a.safetensors',
          lastModified: '2024-01-01T00:00:00.000Z',
          size: 1024,
        },
        {
          key: 'ingredients/trainings/loras/model-b.safetensors',
          lastModified: '2024-01-02T00:00:00.000Z',
          size: 2048,
        },
      ]);
    });

    it('returns empty array when provider has no objects', async () => {
      mockProvider.listObjects.mockResolvedValueOnce([]);

      const result = await service.listObjects('test-bucket', 'empty/');

      expect(result).toHaveLength(0);
    });
  });
});
