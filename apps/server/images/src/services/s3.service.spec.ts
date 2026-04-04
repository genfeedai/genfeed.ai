import { ConfigService } from '@images/config/config.service';
import { S3Service } from '@images/services/s3.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

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

describe('S3Service', () => {
  let service: S3Service;
  let mockLoggerService: {
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  const mockConfigService = {
    AWS_ACCESS_KEY_ID: 'test-key',
    AWS_REGION: 'us-east-1',
    AWS_S3_BUCKET: 'test-bucket',
    AWS_SECRET_ACCESS_KEY: 'test-secret',
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
        { provide: ConfigService, useValue: mockConfigService },
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
    it('should upload a file to S3', async () => {
      mockSend.mockResolvedValue({});

      await service.uploadFile(
        'test-bucket',
        'loras/test.safetensors',
        '/tmp/test.safetensors',
      );

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockLoggerService.log).toHaveBeenCalledTimes(2);
    });
  });

  describe('listObjects', () => {
    it('should list objects with the given prefix', async () => {
      mockSend.mockResolvedValue({
        Contents: [
          {
            Key: 'trainings/loras/model-a.safetensors',
            LastModified: new Date('2024-01-01'),
            Size: 1024,
          },
          {
            Key: 'trainings/loras/model-b.safetensors',
            LastModified: new Date('2024-01-02'),
            Size: 2048,
          },
        ],
        NextContinuationToken: undefined,
      });

      const result = await service.listObjects(
        'test-bucket',
        'trainings/loras/',
      );

      expect(result).toHaveLength(2);
      expect(result[0].key).toBe('trainings/loras/model-a.safetensors');
      expect(result[0].size).toBe(1024);
      expect(result[1].key).toBe('trainings/loras/model-b.safetensors');
    });

    it('should handle pagination', async () => {
      mockSend
        .mockResolvedValueOnce({
          Contents: [{ Key: 'file1.jpg', LastModified: new Date(), Size: 100 }],
          NextContinuationToken: 'token-123',
        })
        .mockResolvedValueOnce({
          Contents: [{ Key: 'file2.jpg', LastModified: new Date(), Size: 200 }],
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
  });
});
