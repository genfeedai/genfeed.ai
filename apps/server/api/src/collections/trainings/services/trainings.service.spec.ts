import fs from 'node:fs';
import { TrainingsService } from '@api/collections/trainings/services/trainings.service';
import { ConfigService } from '@api/config/config.service';
import { MemoryMonitorService } from '@api/helpers/memory/monitor/memory-monitor.service';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { IngredientStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import archiver from 'archiver';

vi.mock('archiver');
vi.mock('fs');

describe('TrainingsService', () => {
  let service: TrainingsService;
  let mockPrismaService: Partial<PrismaService>;
  let mockConfigService: vi.Mocked<ConfigService>;
  let mockLoggerService: vi.Mocked<LoggerService>;
  let mockFilesClientService: vi.Mocked<FilesClientService>;
  let mockFileQueueService: vi.Mocked<FileQueueService>;
  let mockMemoryMonitorService: vi.Mocked<MemoryMonitorService>;
  let mockReplicateService: vi.Mocked<ReplicateService>;
  let mockNotificationsPublisherService: vi.Mocked<NotificationsPublisherService>;

  beforeEach(async () => {
    mockPrismaService = {
      training: {
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn().mockResolvedValue({ id: 'new-id' }),
        delete: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue(null),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    } as unknown as Partial<PrismaService>;

    mockConfigService = {
      get: vi.fn((key: string) => {
        switch (key) {
          case 'REPLICATE_OWNER':
            return 'test-owner';
          case 'REPLICATE_MODELS_TRAINER':
            return 'test-trainer-model';
          default:
            return null;
        }
      }),
      ingredientsEndpoint: 'https://api.test.com/ingredients',
    } as unknown as vi.Mocked<ConfigService>;

    mockLoggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      verbose: vi.fn(),
      warn: vi.fn(),
    };

    mockFilesClientService = {
      uploadToS3: vi.fn().mockResolvedValue({ publicUrl: 's3-url' }),
    };

    mockFileQueueService = {
      processFile: vi.fn().mockResolvedValue({ jobId: 'job-1' }),
      waitForJob: vi.fn().mockResolvedValue({
        outputPath: `${process.cwd()}/test/image.jpg`,
      }),
    };

    mockMemoryMonitorService = {
      checkMemory: vi.fn(),
    };

    mockReplicateService = {
      runTraining: vi.fn().mockResolvedValue('training-123'),
    };

    mockNotificationsPublisherService = {
      publishTrainingStatus: vi.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrainingsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: FilesClientService, useValue: mockFilesClientService },
        { provide: FileQueueService, useValue: mockFileQueueService },
        { provide: MemoryMonitorService, useValue: mockMemoryMonitorService },
        { provide: ReplicateService, useValue: mockReplicateService },
        {
          provide: NotificationsPublisherService,
          useValue: mockNotificationsPublisherService,
        },
      ],
    }).compile();

    service = module.get<TrainingsService>(TrainingsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createTrainingZip', () => {
    let mockArchive: {
      append: ReturnType<typeof vi.fn>;
      finalize: ReturnType<typeof vi.fn>;
    };
    let mockOutput: Record<string, ReturnType<typeof vi.fn>>;

    beforeEach(() => {
      mockArchive = {
        append: vi.fn(),
        finalize: vi.fn(),
        pipe: vi.fn(),
      };

      mockOutput = {
        on: vi.fn((event: string, callback: () => void) => {
          if (event === 'close') {
            setTimeout(() => callback(), 0);
          }
        }),
      };

      (archiver as vi.Mock).mockReturnValue(mockArchive);
      (fs.createWriteStream as vi.Mock).mockReturnValue(mockOutput);
      (fs.createReadStream as vi.Mock).mockReturnValue(
        Buffer.from('test-image'),
      );
      (fs.existsSync as vi.Mock).mockReturnValue(true);
      (fs.statSync as vi.Mock).mockReturnValue({ size: 123 });
      (fs.unlinkSync as vi.Mock).mockReturnValue(undefined);
    });

    it('should create a zip file from source images', async () => {
      const trainingId = 'training-123';
      const sourceImages = [
        { id: 'img1', metadata: { extension: 'jpg' } },
        { id: 'img2', metadata: { extension: 'png' } },
        { id: 'img3', metadata: { extension: 'jpeg' } },
        { id: 'img4', metadata: { extension: 'webp' } },
        { id: 'img5', metadata: { extension: 'jpg' } },
        { id: 'img6', metadata: { extension: 'png' } },
        { id: 'img7', metadata: { extension: 'jpeg' } },
        { id: 'img8', metadata: { extension: 'jpg' } },
        { id: 'img9', metadata: { extension: 'png' } },
        { id: 'img10', metadata: { extension: 'jpg' } },
      ];

      const result = await service.createTrainingZip(trainingId, sourceImages);

      expect(mockFileQueueService.processFile).toHaveBeenCalledTimes(10);
      expect(mockFileQueueService.waitForJob).toHaveBeenCalledTimes(10);
      expect(mockArchive.append).toHaveBeenCalledTimes(10);
      expect(mockArchive.finalize).toHaveBeenCalled();
      expect(mockFilesClientService.uploadToS3).toHaveBeenCalled();
      expect(fs.unlinkSync).toHaveBeenCalled();
      expect(result).toContain('https://api.test.com/ingredients/trainings/');
    });

    it('should skip unsupported image formats', async () => {
      const trainingId = 'training-123';
      const sourceImages = [
        { id: 'img1', metadata: { extension: 'gif' } },
        { id: 'img2', metadata: { extension: 'bmp' } },
        { id: 'img3', metadata: { extension: 'jpg' } },
        { id: 'img4', metadata: { extension: 'jpg' } },
        { id: 'img5', metadata: { extension: 'jpg' } },
        { id: 'img6', metadata: { extension: 'jpg' } },
        { id: 'img7', metadata: { extension: 'jpg' } },
        { id: 'img8', metadata: { extension: 'jpg' } },
        { id: 'img9', metadata: { extension: 'jpg' } },
        { id: 'img10', metadata: { extension: 'jpg' } },
        { id: 'img11', metadata: { extension: 'jpg' } },
        { id: 'img12', metadata: { extension: 'jpg' } },
      ];

      await service.createTrainingZip(trainingId, sourceImages);

      expect(mockLoggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('unsupported format: gif'),
      );
      expect(mockLoggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('unsupported format: bmp'),
      );
      expect(mockFileQueueService.processFile).toHaveBeenCalledTimes(10);
    });

    it('should throw error when less than 10 images are available', async () => {
      const trainingId = 'training-123';
      const sourceImages = [
        { id: 'img1', metadata: { extension: 'jpg' } },
        { id: 'img2', metadata: { extension: 'jpg' } },
        { id: 'img3', metadata: { extension: 'jpg' } },
      ];

      await expect(
        service.createTrainingZip(trainingId, sourceImages),
      ).rejects.toThrow('Failed to download minimum required images');
    });

    it('should handle download failures gracefully', async () => {
      const trainingId = 'training-123';
      const sourceImages = Array(15)
        .fill(null)
        .map((_, i) => ({
          id: `img${i}`,
          metadata: { extension: 'jpg' },
        }));

      mockFileQueueService.waitForJob.mockRejectedValueOnce(
        new Error('Download failed'),
      );
      mockFileQueueService.waitForJob.mockRejectedValueOnce(
        new Error('Download failed'),
      );

      const result = await service.createTrainingZip(trainingId, sourceImages);

      expect(mockLoggerService.error).toHaveBeenCalledTimes(2);
      expect(mockArchive.append).toHaveBeenCalledTimes(13);
      expect(result).toContain('https://api.test.com/ingredients/trainings/');
    });

    it('should skip images without id', async () => {
      const trainingId = 'training-123';
      const sourceImages = [
        { metadata: { extension: 'jpg' } },
        { id: null, metadata: { extension: 'jpg' } },
        { id: '', metadata: { extension: 'jpg' } },
        ...Array(10)
          .fill(null)
          .map((_, i) => ({
            id: `img${i}`,
            metadata: { extension: 'jpg' },
          })),
      ];

      await service.createTrainingZip(trainingId, sourceImages);

      expect(mockFileQueueService.processFile).toHaveBeenCalledTimes(10);
    });

    it('should skip empty image files', async () => {
      const trainingId = 'training-123';
      const sourceImages = Array(15)
        .fill(null)
        .map((_, i) => ({
          id: `img${i}`,
          metadata: { extension: 'jpg' },
        }));

      (fs.statSync as vi.Mock)
        .mockReturnValueOnce({ size: 0 })
        .mockReturnValueOnce({ size: 0 })
        .mockReturnValue({ size: 123 });

      await service.createTrainingZip(trainingId, sourceImages);

      expect(mockLoggerService.warn).toHaveBeenCalledTimes(2);
      expect(mockArchive.append).toHaveBeenCalledTimes(13);
    });
  });

  describe('launchTraining', () => {
    it('should launch training on Replicate', async () => {
      const training = {
        _id: 'training-123',
        seed: 42,
        steps: 1000,
        trigger: 'TOK',
        type: 'flux',
      };
      const uploadedUrl = 'https://test.com/training.zip';

      const result = await service.launchTraining(training, uploadedUrl);

      expect(mockReplicateService.runTraining).toHaveBeenCalledWith(
        'test-owner/training-123',
        {
          input_images: uploadedUrl,
          lora_type: 'flux',
          seed: 42,
          training_steps: 1000,
          trigger_word: 'TOK',
        },
        'test-trainer-model',
      );
      expect(result).toBe('training-123');
    });

    it('should use default seed when not provided', async () => {
      const training = {
        _id: 'training-456',
        steps: 500,
        trigger: 'TRIG',
        type: 'flux',
      };
      const uploadedUrl = 'https://test.com/training2.zip';

      await service.launchTraining(training, uploadedUrl);

      expect(mockReplicateService.runTraining).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          seed: -1,
        }),
        expect.any(String),
      );
    });

    it('should update training with externalId', async () => {
      const training = {
        _id: 'training-789',
        steps: 2000,
        trigger: 'TEST',
        type: 'flux',
      };
      const uploadedUrl = 'https://test.com/training3.zip';

      mockModel.findByIdAndUpdate.mockReturnValue({
        exec: vi.fn().mockResolvedValue({
          _id: 'training-789',
          externalId: 'training-123',
        }),
        populate: vi.fn().mockReturnThis(),
      });

      await service.launchTraining(training, uploadedUrl);

      // launchTraining calls this.patch() which uses findByIdAndUpdate with $set wrapper
      expect(mockModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'training-789',
        { $set: { externalId: 'training-123' } },
        { returnDocument: 'after' },
      );
    });

    it('should publish websocket event', async () => {
      const training = {
        _id: 'training-999',
        steps: 1500,
        trigger: 'WS',
        type: 'flux',
        user: 'user-123',
      };
      const uploadedUrl = 'https://test.com/training4.zip';

      await service.launchTraining(training, uploadedUrl);

      expect(
        mockNotificationsPublisherService.publishTrainingStatus,
      ).toHaveBeenCalledWith(
        String(training._id),
        IngredientStatus.PROCESSING,
        training.user,
        expect.objectContaining({
          externalId: 'training-123',
          training,
        }),
      );
    });

    it('should handle replicate service errors', async () => {
      const training = {
        _id: 'training-error',
        steps: 1000,
        trigger: 'ERR',
        type: 'flux',
      };
      const uploadedUrl = 'https://test.com/training-error.zip';

      mockReplicateService.runTraining.mockRejectedValueOnce(
        new Error('Replicate API error'),
      );

      await expect(
        service.launchTraining(training, uploadedUrl),
      ).rejects.toThrow('Replicate API error');
    });
  });

  describe('inherited methods from BaseService', () => {
    it('should find all trainings with aggregation', async () => {
      const aggregate = [{ $match: { isDeleted: false } }];
      const options = { limit: 10, page: 1 };
      const mockResult = {
        docs: [{ _id: '1' }, { _id: '2' }],
        limit: 10,
        page: 1,
        totalDocs: 2,
      };

      mockModel.aggregate = vi.fn().mockReturnValue('agg');
      mockModel.aggregatePaginate = vi.fn().mockResolvedValue(mockResult);

      const result = await service.findAll(aggregate, options);

      expect(mockModel.aggregate).toHaveBeenCalledWith(aggregate);
      expect(mockModel.aggregatePaginate).toHaveBeenCalledWith('agg', options);
      expect(result).toEqual(mockResult);
    });

    it('should find one training by filter', async () => {
      const mockTraining = { _id: '1', name: 'Training 1' };
      mockModel.findOne = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockTraining),
      });

      const result = await service.findOne({ _id: '1' });

      expect(mockModel.findOne).toHaveBeenCalledWith({ _id: '1' });
      expect(result).toEqual(mockTraining);
    });

    it('should create a new training', async () => {
      const createDto = { name: 'New Training', trigger: 'NEW' };
      const mockCreated = { _id: 'new-id', ...createDto };
      mockModel.mockImplementation(function () {
        return { save: vi.fn().mockResolvedValue(mockCreated) };
      });

      const result = await service.create(createDto);

      expect(result).toEqual(mockCreated);
    });

    it('should update a training', async () => {
      const updateDto = { name: 'Updated Training' };
      mockModel.findByIdAndUpdate = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue({ _id: '1', ...updateDto }),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.patch('1', updateDto);

      expect(mockModel.findByIdAndUpdate).toHaveBeenCalledWith(
        '1',
        { $set: updateDto },
        { returnDocument: 'after' },
      );
      expect(result).toEqual({ _id: '1', ...updateDto });
    });

    it('should delete a training', async () => {
      mockModel.findByIdAndUpdate = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue({ _id: '1', isDeleted: true }),
      });

      const result = await service.remove('1');

      expect(mockModel.findByIdAndUpdate).toHaveBeenCalledWith(
        '1',
        { isDeleted: true },
        { returnDocument: 'after' },
      );
      expect(result).toEqual({ _id: '1', isDeleted: true });
    });

    it('should handle non-paginated results', async () => {
      const aggregate = [{ $match: { isDeleted: false } }];
      mockModel.aggregate = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue([{ _id: '1' }]),
      });

      const result = await service.findAll(aggregate, { pagination: false });

      expect(result.docs).toHaveLength(1);
    });
  });
});
