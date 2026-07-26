import { ConfigService } from '@images/config/config.service';
import { LoraService } from '@images/services/lora.service';
import { LoggerService } from '@libs/logger/logger.service';
import { S3Service } from '@libs/s3/s3.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

// Mock node:fs/promises
const mockReaddir = vi.fn();
const mockStat = vi.fn();

vi.mock('node:fs/promises', () => ({
  readdir: (...args: unknown[]) => mockReaddir(...args),
  stat: (...args: unknown[]) => mockStat(...args),
}));

describe('LoraService', () => {
  let service: LoraService;
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
    COMFYUI_LORAS_PATH: '/comfyui/models/loras',
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoraService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: S3Service, useValue: mockS3Service },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile();

    service = module.get<LoraService>(LoraService);
  });

  describe('uploadLora', () => {
    it('should upload a LoRA file to S3', async () => {
      mockStat.mockResolvedValue({ size: 12345 });

      const result = await service.uploadLora({
        localPath: '/comfyui/models/loras/my-lora.safetensors',
        loraName: 'my-lora',
      });

      expect(result.loraName).toBe('my-lora');
      expect(result.s3Key).toBe(
        'ingredients/trainings/loras/my-lora.safetensors',
      );
      expect(result.uploaded).toBe(true);
      expect(mockS3Service.uploadFile).toHaveBeenCalledWith(
        'test-bucket',
        'ingredients/trainings/loras/my-lora.safetensors',
        '/comfyui/models/loras/my-lora.safetensors',
        '/comfyui/models/loras',
      );
    });

    it('should throw if loraName is missing', async () => {
      await expect(
        service.uploadLora({
          localPath: '/tmp/test.safetensors',
          loraName: '',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if localPath is missing', async () => {
      await expect(
        service.uploadLora({
          localPath: '',
          loraName: 'test',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if localPath does not end with .safetensors', async () => {
      await expect(
        service.uploadLora({
          localPath: '/tmp/test.bin',
          loraName: 'test',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if local file does not exist', async () => {
      mockStat.mockRejectedValue(new Error('ENOENT'));

      await expect(
        service.uploadLora({
          localPath: '/comfyui/models/loras/nonexistent.safetensors',
          loraName: 'test',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it.each([
      '../evil',
      'nested/name',
      'a..b',
      '$(whoami)',
      '.hidden',
      'name with space',
    ])('should reject loraName %s before touching S3', async (loraName) => {
      mockStat.mockResolvedValue({ size: 12345 });

      await expect(
        service.uploadLora({
          localPath: '/comfyui/models/loras/my-lora.safetensors',
          loraName,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockS3Service.uploadFile).not.toHaveBeenCalled();
    });

    it.each([
      '/etc/shadow.safetensors',
      '../../root/.ssh/id_rsa.safetensors',
      '/comfyui/models/loras-sibling/evil.safetensors',
    ])('should reject localPath %s outside the configured LoRA directory', async (localPath) => {
      mockStat.mockResolvedValue({ size: 12345 });

      await expect(
        service.uploadLora({ localPath, loraName: 'my-lora' }),
      ).rejects.toThrow(BadRequestException);

      // The file is never read, so its bytes never reach a bucket the
      // caller can list.
      expect(mockStat).not.toHaveBeenCalled();
      expect(mockS3Service.uploadFile).not.toHaveBeenCalled();
    });

    it('should accept a path relative to the configured LoRA directory', async () => {
      mockStat.mockResolvedValue({ size: 12345 });

      await service.uploadLora({
        localPath: 'my-lora.safetensors',
        loraName: 'my-lora',
      });

      expect(mockS3Service.uploadFile).toHaveBeenCalledWith(
        'test-bucket',
        'ingredients/trainings/loras/my-lora.safetensors',
        '/comfyui/models/loras/my-lora.safetensors',
        '/comfyui/models/loras',
      );
    });

    it('should derive the S3 key from loraName, not from localPath', async () => {
      mockStat.mockResolvedValue({ size: 12345 });

      const result = await service.uploadLora({
        localPath: '/comfyui/models/loras/checkpoint-final.safetensors',
        loraName: 'alice_lora',
      });

      expect(result.s3Key).toBe(
        'ingredients/trainings/loras/alice_lora.safetensors',
      );
    });
  });

  describe('listLoras', () => {
    it('should list local LoRAs', async () => {
      mockReaddir.mockResolvedValue([
        'model-a.safetensors',
        'model-b.safetensors',
        'readme.txt',
      ]);
      mockStat.mockResolvedValue({
        mtime: new Date('2024-01-01'),
        size: 1024,
      });

      const result = await service.listLoras();

      expect(result.total).toBe(2);
      expect(result.loras[0].name).toBe('model-a');
      expect(result.loras[0].source).toBe('local');
      expect(result.loras[1].name).toBe('model-b');
    });

    it('should list S3 LoRAs when local directory is empty', async () => {
      mockReaddir.mockResolvedValue([]);
      mockS3Service.listObjects.mockResolvedValue([
        {
          key: 'ingredients/trainings/loras/s3-model.safetensors',
          lastModified: '2024-02-01T00:00:00.000Z',
          size: 2048,
        },
      ]);

      const result = await service.listLoras();

      expect(result.total).toBe(1);
      expect(result.loras[0].name).toBe('s3-model');
      expect(result.loras[0].source).toBe('s3');
      expect(result.loras[0].s3Key).toBe(
        'ingredients/trainings/loras/s3-model.safetensors',
      );
    });

    it('should prefer local LoRAs over S3 with same name', async () => {
      mockReaddir.mockResolvedValue(['shared-model.safetensors']);
      mockStat.mockResolvedValue({
        mtime: new Date('2024-01-01'),
        size: 1024,
      });
      mockS3Service.listObjects.mockResolvedValue([
        {
          key: 'ingredients/trainings/loras/shared-model.safetensors',
          lastModified: '2024-02-01T00:00:00.000Z',
          size: 2048,
        },
      ]);

      const result = await service.listLoras();

      expect(result.total).toBe(1);
      expect(result.loras[0].source).toBe('local');
    });

    it('should handle local directory read errors gracefully', async () => {
      mockReaddir.mockRejectedValue(new Error('ENOENT'));
      mockS3Service.listObjects.mockResolvedValue([
        {
          key: 'ingredients/trainings/loras/s3-model.safetensors',
          lastModified: '2024-02-01T00:00:00.000Z',
          size: 2048,
        },
      ]);

      const result = await service.listLoras();

      expect(result.total).toBe(1);
      expect(result.loras[0].source).toBe('s3');
      expect(mockLoggerService.warn).toHaveBeenCalled();
    });

    it('should handle S3 list errors gracefully', async () => {
      mockReaddir.mockResolvedValue(['local-model.safetensors']);
      mockStat.mockResolvedValue({
        mtime: new Date('2024-01-01'),
        size: 1024,
      });
      mockS3Service.listObjects.mockRejectedValue(new Error('S3 timeout'));

      const result = await service.listLoras();

      expect(result.total).toBe(1);
      expect(result.loras[0].source).toBe('local');
      expect(mockLoggerService.warn).toHaveBeenCalled();
    });

    it('should return empty list when both sources fail', async () => {
      mockReaddir.mockRejectedValue(new Error('ENOENT'));
      mockS3Service.listObjects.mockRejectedValue(new Error('S3 error'));

      const result = await service.listLoras();

      expect(result.total).toBe(0);
      expect(result.loras).toEqual([]);
    });
  });
});
