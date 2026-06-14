import { LoggerService } from '@libs/logger/logger.service';
import { S3Service } from '@libs/s3/s3.service';
import { Test, type TestingModule } from '@nestjs/testing';

// Mock @aws-sdk/client-s3
const mockSend = vi.fn();
vi.mock('@aws-sdk/client-s3', () => {
  class MockS3Client {
    send = mockSend;
    constructor() {}
  }
  return {
    GetObjectCommand: class {
      constructor(public params: Record<string, unknown>) {}
    },
    ListObjectsV2Command: class {
      constructor(public params: Record<string, unknown>) {}
    },
    PutObjectCommand: class {
      constructor(public params: Record<string, unknown>) {}
    },
    S3Client: MockS3Client,
  };
});

// Mock node:fs/promises
vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue(Buffer.from('test-data')),
  stat: vi.fn().mockResolvedValue({ size: 9 }),
}));

// Mock node:fs
vi.mock('node:fs', () => ({
  createWriteStream: vi.fn().mockReturnValue({
    end: vi.fn(),
    on: vi.fn(),
    write: vi.fn(),
  }),
}));

// Mock node:stream/promises
vi.mock('node:stream/promises', () => ({
  pipeline: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@libs/utils/caller/caller.util', () => ({
  CallerUtil: { getCallerName: vi.fn().mockReturnValue('test-caller') },
}));

const mockConfigService = {
  AWS_ACCESS_KEY_ID: 'test-key',
  AWS_REGION: 'us-east-1',
  AWS_SECRET_ACCESS_KEY: 'test-secret',
};

describe('S3Service (shared @libs/s3)', () => {
  let service: S3Service;
  let mockLoggerService: {
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();

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

  describe('downloadFile', () => {
    it('should download a file from S3 to local path', async () => {
      const mockStream = { pipe: vi.fn() };
      mockSend.mockResolvedValue({ Body: mockStream });

      await service.downloadFile(
        'test-bucket',
        'images/photo.jpg',
        '/tmp/photo.jpg',
      );

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockLoggerService.log).toHaveBeenCalledTimes(2);
    });

    it('should throw if response body is empty', async () => {
      mockSend.mockResolvedValue({ Body: null });

      await expect(
        service.downloadFile(
          'test-bucket',
          'images/photo.jpg',
          '/tmp/photo.jpg',
        ),
      ).rejects.toThrow('Empty response body');
    });
  });

  describe('uploadFile', () => {
    it('should upload a file to S3 with explicit content type', async () => {
      mockSend.mockResolvedValue({});

      await service.uploadFile(
        'test-bucket',
        'videos/job123/video.mp4',
        '/tmp/video.mp4',
        'video/mp4',
      );

      expect(mockSend).toHaveBeenCalledTimes(1);
      // The mock PutObjectCommand stores params on .params
      const [cmdInstance] = mockSend.mock.calls[0] as [
        { params: Record<string, unknown> },
      ];
      expect(cmdInstance.params.ContentType).toBe('video/mp4');
      expect(mockLoggerService.log).toHaveBeenCalledTimes(2);
    });

    it('should infer content type from extension when not provided (jpg → image/jpeg)', async () => {
      mockSend.mockResolvedValue({});

      await service.uploadFile(
        'test-bucket',
        'images/photo.jpg',
        '/tmp/photo.jpg',
      );

      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should infer content type from extension when not provided (mp4 → video/mp4)', async () => {
      mockSend.mockResolvedValue({});

      await service.uploadFile(
        'test-bucket',
        'videos/clip.mp4',
        '/tmp/clip.mp4',
      );

      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should use application/octet-stream for unknown extensions', async () => {
      mockSend.mockResolvedValue({});

      await service.uploadFile(
        'test-bucket',
        'data/model.bin',
        '/tmp/model.bin',
      );

      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });

  describe('uploadSafetensors', () => {
    it('should upload with the canonical S3 key path', async () => {
      mockSend.mockResolvedValue({});

      const result = await service.uploadSafetensors(
        'test-bucket',
        'my-lora',
        '/tmp/my-lora.safetensors',
      );

      expect(result.s3Key).toBe(
        'ingredients/trainings/loras/my-lora.safetensors',
      );
      expect(result.sizeBytes).toBe(9);
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockLoggerService.log).toHaveBeenCalledTimes(2);
    });
  });

  describe('listObjects', () => {
    it('should list objects with the given prefix', async () => {
      mockSend.mockResolvedValue({
        Contents: [
          {
            Key: 'ingredients/trainings/loras/model-a.safetensors',
            LastModified: new Date('2024-01-01'),
            Size: 1024,
          },
          {
            Key: 'ingredients/trainings/loras/model-b.safetensors',
            LastModified: new Date('2024-01-02'),
            Size: 2048,
          },
        ],
        NextContinuationToken: undefined,
      });

      const result = await service.listObjects(
        'test-bucket',
        'ingredients/trainings/loras/',
      );

      expect(result).toHaveLength(2);
      expect(result[0].key).toBe(
        'ingredients/trainings/loras/model-a.safetensors',
      );
      expect(result[0].size).toBe(1024);
    });

    it('should handle pagination', async () => {
      mockSend
        .mockResolvedValueOnce({
          Contents: [{ Key: 'file1.jpg', LastModified: new Date(), Size: 100 }],
          NextContinuationToken: 'token-123',
        })
        .mockResolvedValueOnce({
          Contents: [{ Key: 'file2.mp4', LastModified: new Date(), Size: 200 }],
          NextContinuationToken: undefined,
        });

      const result = await service.listObjects('test-bucket', 'prefix/');

      expect(result).toHaveLength(2);
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('should return empty array when no contents', async () => {
      mockSend.mockResolvedValue({
        Contents: undefined,
        NextContinuationToken: undefined,
      });

      const result = await service.listObjects('test-bucket', 'empty/');

      expect(result).toHaveLength(0);
    });

    it('should skip items without Key or Size', async () => {
      mockSend.mockResolvedValue({
        Contents: [
          { Key: 'valid.mp4', LastModified: new Date(), Size: 500 },
          { Key: undefined, LastModified: new Date(), Size: 100 },
          { Key: 'no-size.mp4', LastModified: new Date(), Size: undefined },
        ],
        NextContinuationToken: undefined,
      });

      const result = await service.listObjects('test-bucket', 'prefix/');

      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('valid.mp4');
    });
  });
});
