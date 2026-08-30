import { LoggerService } from '@libs/logger/logger.service';
import { S3Service } from '@libs/s3/s3.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@voices/config/config.service';
import { VoiceCloneService } from '@voices/services/voice-clone.service';

// Mock node:fs/promises
const mockReaddir = vi.fn();
const mockStat = vi.fn();

vi.mock('node:fs/promises', () => ({
  readdir: (...args: unknown[]) => mockReaddir(...args),
  stat: (...args: unknown[]) => mockStat(...args),
}));

describe('VoiceCloneService', () => {
  let service: VoiceCloneService;
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
    VOICE_MODELS_PATH: '/models/voices',
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
        VoiceCloneService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: S3Service, useValue: mockS3Service },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile();

    service = module.get<VoiceCloneService>(VoiceCloneService);
  });

  describe('uploadClone', () => {
    it('should upload a voice clone model to S3', async () => {
      mockStat.mockResolvedValue({ size: 12345 });

      const result = await service.uploadClone({
        localPath: '/models/voices/my-voice/model.pth',
        voiceId: 'my-voice',
      });

      expect(result.voiceId).toBe('my-voice');
      expect(result.s3Key).toBe(
        'ingredients/trainings/voice-clones/my-voice/model.pth',
      );
      expect(result.uploaded).toBe(true);
      expect(mockS3Service.uploadFile).toHaveBeenCalledWith(
        'test-bucket',
        'ingredients/trainings/voice-clones/my-voice/model.pth',
        '/models/voices/my-voice/model.pth',
        '/models/voices',
      );
    });

    it('should throw if voiceId is missing', async () => {
      await expect(
        service.uploadClone({
          localPath: '/tmp/test.pth',
          voiceId: '',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if localPath is missing', async () => {
      await expect(
        service.uploadClone({
          localPath: '',
          voiceId: 'test',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if localPath has unsupported extension', async () => {
      await expect(
        service.uploadClone({
          localPath: '/tmp/test.txt',
          voiceId: 'test',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if localPath has no extension at all', async () => {
      // `extname` returns '' here. The previous hand-rolled slice returned the
      // whole path, which was then compared against the extension allow-list.
      await expect(
        service.uploadClone({
          localPath: '/models/voices/test/model',
          voiceId: 'test',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if local file does not exist', async () => {
      mockStat.mockRejectedValue(new Error('ENOENT'));

      await expect(
        service.uploadClone({
          localPath: '/models/voices/test/nonexistent.pth',
          voiceId: 'test',
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
    ])('should reject voiceId %s before touching S3', async (voiceId) => {
      mockStat.mockResolvedValue({ size: 12345 });

      await expect(
        service.uploadClone({
          localPath: '/models/voices/my-voice/model.pth',
          voiceId,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockS3Service.uploadFile).not.toHaveBeenCalled();
    });

    it.each([
      '/etc/shadow.pth',
      '../../root/.ssh/id_rsa.pth',
      '/models/voices-sibling/evil.pth',
    ])(
      'should reject localPath %s outside the configured model directory',
      async (localPath) => {
        mockStat.mockResolvedValue({ size: 12345 });

        await expect(
          service.uploadClone({ localPath, voiceId: 'my-voice' }),
        ).rejects.toThrow(BadRequestException);

        // The file is never read, so its bytes never reach a bucket the
        // caller can list.
        expect(mockStat).not.toHaveBeenCalled();
        expect(mockS3Service.uploadFile).not.toHaveBeenCalled();
      },
    );

    it('should accept a path relative to the configured model directory', async () => {
      mockStat.mockResolvedValue({ size: 12345 });

      await service.uploadClone({
        localPath: 'my-voice/model.pth',
        voiceId: 'my-voice',
      });

      expect(mockS3Service.uploadFile).toHaveBeenCalledWith(
        'test-bucket',
        'ingredients/trainings/voice-clones/my-voice/model.pth',
        '/models/voices/my-voice/model.pth',
        '/models/voices',
      );
    });
  });

  describe('downloadClone', () => {
    it('should download clone files from S3', async () => {
      mockS3Service.listObjects.mockResolvedValue([
        {
          key: 'ingredients/trainings/voice-clones/my-voice/model.pth',
          lastModified: '2024-01-01T00:00:00.000Z',
          size: 1024,
        },
      ]);

      const result = await service.downloadClone('my-voice');

      expect(result.voiceId).toBe('my-voice');
      expect(result.path).toBe('/models/voices/my-voice');
      expect(mockS3Service.downloadFile).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundException when no S3 objects found', async () => {
      mockS3Service.listObjects.mockResolvedValue([]);

      await expect(service.downloadClone('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when voiceId is empty', async () => {
      await expect(service.downloadClone('')).rejects.toThrow(
        BadRequestException,
      );
    });

    it.each(['../evil', 'nested/name', 'a..b', '$(whoami)'])(
      'should reject voiceId %s before listing S3',
      async (voiceId) => {
        await expect(service.downloadClone(voiceId)).rejects.toThrow(
          BadRequestException,
        );

        expect(mockS3Service.listObjects).not.toHaveBeenCalled();
      },
    );

    it('should refuse to write an S3 key that escapes the voice directory', async () => {
      // The key suffix is attacker-influenced if anything can write to the
      // bucket; without containment it lands anywhere the process can write.
      mockS3Service.listObjects.mockResolvedValue([
        {
          key: 'ingredients/trainings/voice-clones/my-voice/../../../../etc/cron.d/evil.pth',
          lastModified: '2024-01-01T00:00:00.000Z',
          size: 1024,
        },
      ]);

      await expect(service.downloadClone('my-voice')).rejects.toThrow(
        BadRequestException,
      );

      expect(mockS3Service.downloadFile).not.toHaveBeenCalled();
    });
  });

  describe('listClones', () => {
    it('should list local voice clones', async () => {
      mockReaddir
        .mockResolvedValueOnce(['voice-a', 'voice-b'])
        .mockResolvedValueOnce(['model.pth'])
        .mockResolvedValueOnce(['model.onnx']);
      mockStat
        .mockResolvedValueOnce({ isDirectory: () => true })
        .mockResolvedValueOnce({ mtime: new Date('2024-01-01'), size: 1024 })
        .mockResolvedValueOnce({ isDirectory: () => true })
        .mockResolvedValueOnce({ mtime: new Date('2024-01-02'), size: 2048 });

      const result = await service.listClones();

      expect(result.total).toBe(2);
      expect(result.clones[0].voiceId).toBe('voice-a');
      expect(result.clones[0].source).toBe('local');
      expect(result.clones[1].voiceId).toBe('voice-b');
    });

    it('should list S3 clones when local directory is empty', async () => {
      mockReaddir.mockResolvedValue([]);
      mockS3Service.listObjects.mockResolvedValue([
        {
          key: 'ingredients/trainings/voice-clones/s3-voice/model.pth',
          lastModified: '2024-02-01T00:00:00.000Z',
          size: 2048,
        },
      ]);

      const result = await service.listClones();

      expect(result.total).toBe(1);
      expect(result.clones[0].voiceId).toBe('s3-voice');
      expect(result.clones[0].source).toBe('s3');
    });

    it('should ignore local filenames without an extension while accepting dotted model names', async () => {
      mockReaddir
        .mockResolvedValueOnce([
          'voice-with-dotfile',
          'voice-with-dotted-model',
        ])
        .mockResolvedValueOnce(['model', '.pth'])
        .mockResolvedValueOnce(['model.release.v1.safetensors']);
      mockStat
        .mockResolvedValueOnce({ isDirectory: () => true })
        .mockResolvedValueOnce({ isDirectory: () => true })
        .mockResolvedValueOnce({ mtime: new Date('2024-03-01'), size: 4096 });

      const result = await service.listClones();

      expect(result.clones).toEqual([
        expect.objectContaining({
          filename: 'model.release.v1.safetensors',
          voiceId: 'voice-with-dotted-model',
        }),
      ]);
    });

    it('should ignore extensionless S3 keys under dotted paths while accepting dotted model names', async () => {
      mockReaddir.mockResolvedValue([]);
      mockS3Service.listObjects.mockResolvedValue([
        {
          key: 'ingredients/trainings/voice-clones/voice.with.dots/model',
          lastModified: '2024-03-01T00:00:00.000Z',
          size: 1024,
        },
        {
          key: 'ingredients/trainings/voice-clones/dotfile-voice/.onnx',
          lastModified: '2024-03-01T00:00:00.000Z',
          size: 2048,
        },
        {
          key: 'ingredients/trainings/voice-clones/voice.with.dots/model.release.v1.onnx',
          lastModified: '2024-03-01T00:00:00.000Z',
          size: 4096,
        },
      ]);

      const result = await service.listClones();

      expect(result.clones).toEqual([
        expect.objectContaining({
          filename: 'model.release.v1.onnx',
          voiceId: 'voice.with.dots',
        }),
      ]);
    });

    it('should prefer local clones over S3 with same voiceId', async () => {
      mockReaddir
        .mockResolvedValueOnce(['shared-voice'])
        .mockResolvedValueOnce(['model.pth']);
      mockStat
        .mockResolvedValueOnce({ isDirectory: () => true })
        .mockResolvedValueOnce({ mtime: new Date('2024-01-01'), size: 1024 });
      mockS3Service.listObjects.mockResolvedValue([
        {
          key: 'ingredients/trainings/voice-clones/shared-voice/model.pth',
          lastModified: '2024-02-01T00:00:00.000Z',
          size: 2048,
        },
      ]);

      const result = await service.listClones();

      expect(result.total).toBe(1);
      expect(result.clones[0].source).toBe('local');
    });

    it('should handle local directory read errors gracefully', async () => {
      mockReaddir.mockRejectedValue(new Error('ENOENT'));
      mockS3Service.listObjects.mockResolvedValue([
        {
          key: 'ingredients/trainings/voice-clones/s3-voice/model.pth',
          lastModified: '2024-02-01T00:00:00.000Z',
          size: 2048,
        },
      ]);

      const result = await service.listClones();

      expect(result.total).toBe(1);
      expect(result.clones[0].source).toBe('s3');
      expect(mockLoggerService.warn).toHaveBeenCalled();
    });

    it('should handle S3 list errors gracefully', async () => {
      mockReaddir
        .mockResolvedValueOnce(['local-voice'])
        .mockResolvedValueOnce(['model.pth']);
      mockStat
        .mockResolvedValueOnce({ isDirectory: () => true })
        .mockResolvedValueOnce({ mtime: new Date('2024-01-01'), size: 1024 });
      mockS3Service.listObjects.mockRejectedValue(new Error('S3 timeout'));

      const result = await service.listClones();

      expect(result.total).toBe(1);
      expect(result.clones[0].source).toBe('local');
      expect(mockLoggerService.warn).toHaveBeenCalled();
    });

    it('should return empty list when both sources fail', async () => {
      mockReaddir.mockRejectedValue(new Error('ENOENT'));
      mockS3Service.listObjects.mockRejectedValue(new Error('S3 error'));

      const result = await service.listClones();

      expect(result.total).toBe(0);
      expect(result.clones).toEqual([]);
    });
  });
});
