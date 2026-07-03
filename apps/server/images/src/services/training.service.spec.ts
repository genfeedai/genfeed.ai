import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { ConfigService } from '@images/config/config.service';
import { TrainingService } from '@images/services/training.service';
import { LoggerService } from '@libs/logger/logger.service';
import type { RedisService } from '@libs/redis/redis.service';
import { S3Service } from '@libs/s3/s3.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

// Mock child_process.spawn
const mockSpawn = vi.fn();
vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

/** In-memory fake of the ioredis publisher surface used by the store. */
function createMockPublisher() {
  const store = new Map<string, string>();

  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    scan: vi.fn(
      async (
        _cursor: string,
        _match: string,
        pattern: string,
        _count: string,
        _countValue: number,
      ) => {
        const prefix = pattern.slice(0, -1);
        const foundKeys = Array.from(store.keys()).filter((key) =>
          key.startsWith(prefix),
        );
        return ['0', foundKeys] as [string, string[]];
      },
    ),
    setex: vi.fn(async (key: string, _ttl: number, value: string) => {
      store.set(key, value);
    }),
    store,
    unlink: vi.fn(async (key: string) => {
      store.delete(key);
    }),
  };
}

type MockPublisher = ReturnType<typeof createMockPublisher>;

function createMockRedisService(publisher: MockPublisher | null): RedisService {
  return {
    getPublisher: vi.fn(() => publisher),
  } as unknown as RedisService;
}

describe('TrainingService', () => {
  let service: TrainingService;
  let mockLoggerService: {
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  const mockConfigService = {
    COMFYUI_LORAS_PATH: '/comfyui/models/loras',
    DATASETS_PATH: '/datasets',
    TRAINING_BINARY_PATH: '/usr/local/bin/accelerate',
  };

  const mockS3Service = {
    uploadSafetensors: vi.fn().mockResolvedValue({
      s3Key: 'loras/test-lora.safetensors',
      sizeBytes: 1024,
    }),
  };

  function createMockChildProcess(): ChildProcess & EventEmitter {
    const child = new EventEmitter() as ChildProcess & EventEmitter;
    child.stdout = new Readable({ read() {} }) as ChildProcess['stdout'];
    child.stderr = new Readable({ read() {} }) as ChildProcess['stderr'];
    child.pid = 12345;
    child.kill = vi.fn().mockReturnValue(true);
    return child;
  }

  beforeEach(async () => {
    vi.clearAllMocks();

    mockLoggerService = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrainingService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: S3Service, useValue: mockS3Service },
      ],
    }).compile();

    service = module.get<TrainingService>(TrainingService);
  });

  describe('startTraining', () => {
    it('should create a training job and return jobId', async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const result = await service.startTraining({
        loraName: 'test-lora',
        personaSlug: 'test-persona',
        triggerWord: 'ohwx',
      });

      expect(result.jobId).toBeDefined();
      expect(typeof result.jobId).toBe('string');
      expect(mockSpawn).toHaveBeenCalledTimes(1);
    });

    it('should use default values for optional params', async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const result = await service.startTraining({
        loraName: 'test-lora',
        personaSlug: 'test-persona',
        triggerWord: 'ohwx',
      });

      const job = await service.getTrainingJob(result.jobId);
      expect(job.params.loraRank).toBe(16);
      expect(job.params.steps).toBe(1500);
      expect(job.params.learningRate).toBe(1e-4);
    });

    it('should throw if required fields are missing', async () => {
      await expect(
        service.startTraining({
          loraName: 'test',
          personaSlug: '',
          triggerWord: 'ohwx',
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.startTraining({
          loraName: 'test',
          personaSlug: 'test',
          triggerWord: '',
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.startTraining({
          loraName: '',
          personaSlug: 'test',
          triggerWord: 'ohwx',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getTrainingJob', () => {
    it('should return a training job by jobId', async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const { jobId } = await service.startTraining({
        loraName: 'test-lora',
        personaSlug: 'test-persona',
        triggerWord: 'ohwx',
      });

      const job = await service.getTrainingJob(jobId);

      expect(job.jobId).toBe(jobId);
      expect(job.status).toBe('running');
      expect(job.personaSlug).toBe('test-persona');
      expect(job.loraName).toBe('test-lora');
      expect(job.triggerWord).toBe('ohwx');
    });

    it('should throw NotFoundException for unknown jobId', async () => {
      await expect(service.getTrainingJob('nonexistent-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('listTrainingJobs', () => {
    it('should return empty list when no jobs exist', async () => {
      const result = await service.listTrainingJobs();
      expect(result).toEqual([]);
    });

    it('should list all training jobs', async () => {
      const mockChild1 = createMockChildProcess();
      const mockChild2 = createMockChildProcess();
      mockSpawn.mockReturnValueOnce(mockChild1).mockReturnValueOnce(mockChild2);

      await service.startTraining({
        loraName: 'lora-1',
        personaSlug: 'persona-1',
        triggerWord: 'ohwx',
      });

      await service.startTraining({
        loraName: 'lora-2',
        personaSlug: 'persona-2',
        triggerWord: 'sks',
      });

      const jobs = await service.listTrainingJobs();

      expect(jobs).toHaveLength(2);
      expect(jobs[0].personaSlug).toBe('persona-1');
      expect(jobs[1].personaSlug).toBe('persona-2');
    });
  });

  describe('training lifecycle', () => {
    it('should mark job as completed when process exits with code 0', async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const { jobId } = await service.startTraining({
        loraName: 'test-lora',
        personaSlug: 'test-persona',
        triggerWord: 'ohwx',
      });

      // Simulate process completion
      mockChild.emit('close', 0);

      // Wait for event loop to process
      await new Promise((resolve) => setTimeout(resolve, 10));

      const job = await service.getTrainingJob(jobId);
      expect(job.status).toBe('completed');
      expect(job.stage).toBe('completed');
      expect(job.progress).toBe(100);
      expect(job.completedAt).toBeDefined();
    });

    it('should mark job as failed when process exits with non-zero code', async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const { jobId } = await service.startTraining({
        loraName: 'test-lora',
        personaSlug: 'test-persona',
        triggerWord: 'ohwx',
      });

      // Simulate process failure
      mockChild.emit('close', 1);

      await new Promise((resolve) => setTimeout(resolve, 10));

      const job = await service.getTrainingJob(jobId);
      expect(job.status).toBe('failed');
      expect(job.stage).toBe('failed');
      expect(job.error).toContain('exited with code 1');
    });

    it('should mark job as failed when process emits error', async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const { jobId } = await service.startTraining({
        loraName: 'test-lora',
        personaSlug: 'test-persona',
        triggerWord: 'ohwx',
      });

      // Simulate process error
      mockChild.emit('error', new Error('spawn ENOENT'));

      await new Promise((resolve) => setTimeout(resolve, 10));

      const job = await service.getTrainingJob(jobId);
      expect(job.status).toBe('failed');
      expect(job.stage).toBe('failed');
      expect(job.error).toContain('spawn ENOENT');
    });

    it('should handle spawn failure gracefully', async () => {
      mockSpawn.mockImplementation(() => {
        throw new Error('Command not found');
      });

      const { jobId } = await service.startTraining({
        loraName: 'test-lora',
        personaSlug: 'test-persona',
        triggerWord: 'ohwx',
      });

      const job = await service.getTrainingJob(jobId);
      expect(job.status).toBe('failed');
      expect(job.stage).toBe('failed');
      expect(job.error).toContain('Command not found');
    });
  });

  describe('buildTrainingCommand', () => {
    it('should build correct command with all parameters', () => {
      const result = service.buildTrainingCommand({
        learningRate: 5e-5,
        loraName: 'my-lora',
        loraRank: 32,
        personaSlug: 'test-persona',
        steps: 2000,
        triggerWord: 'ohwx',
      });

      expect(result.command).toBe('/usr/local/bin/accelerate');
      expect(result.args).toContain('--train_data_dir');
      expect(result.args).toContain('/datasets/test-persona');
      expect(result.args).toContain('--output_name');
      expect(result.args).toContain('my-lora');
      expect(result.args).toContain('--max_train_steps');
      expect(result.args).toContain('2000');
      expect(result.args).toContain('--network_dim');
      expect(result.args).toContain('32');
      expect(result.args).toContain('--learning_rate');
      expect(result.args).toContain('0.00005');
    });
  });

  describe('Redis persistence', () => {
    let publisher: MockPublisher;
    let redisBackedService: TrainingService;

    function createService(
      targetPublisher: MockPublisher | null,
    ): TrainingService {
      return new TrainingService(
        mockConfigService as unknown as ConfigService,
        mockLoggerService as unknown as LoggerService,
        mockS3Service as unknown as S3Service,
        createMockRedisService(targetPublisher),
      );
    }

    beforeEach(() => {
      publisher = createMockPublisher();
      redisBackedService = createService(publisher);
    });

    it('persists the job and process record when training starts', async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const { jobId } = await redisBackedService.startTraining({
        loraName: 'test-lora',
        personaSlug: 'test-persona',
        triggerWord: 'ohwx',
      });
      await new Promise((resolve) => setTimeout(resolve, 10));

      const rawJob = publisher.store.get(`training:images:job:${jobId}`);
      expect(rawJob).toBeDefined();
      expect(JSON.parse(rawJob as string)).toMatchObject({
        jobId,
        personaSlug: 'test-persona',
      });

      const rawRecord = publisher.store.get(`training:images:process:${jobId}`);
      expect(rawRecord).toBeDefined();
      expect(JSON.parse(rawRecord as string)).toMatchObject({
        jobId,
        pid: 12345,
      });
    });

    it('removes the process record when the process exits', async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const { jobId } = await redisBackedService.startTraining({
        loraName: 'test-lora',
        personaSlug: 'test-persona',
        triggerWord: 'ohwx',
      });
      await new Promise((resolve) => setTimeout(resolve, 10));

      mockChild.emit('close', 0);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(publisher.store.has(`training:images:process:${jobId}`)).toBe(
        false,
      );
      const rawJob = publisher.store.get(`training:images:job:${jobId}`);
      expect(JSON.parse(rawJob as string)).toMatchObject({
        status: 'completed',
      });
    });

    it('removes the process record when the process emits an error', async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const { jobId } = await redisBackedService.startTraining({
        loraName: 'test-lora',
        personaSlug: 'test-persona',
        triggerWord: 'ohwx',
      });
      await new Promise((resolve) => setTimeout(resolve, 10));

      mockChild.emit('error', new Error('spawn ENOENT'));
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(publisher.store.has(`training:images:process:${jobId}`)).toBe(
        false,
      );
      const rawJob = publisher.store.get(`training:images:job:${jobId}`);
      expect(JSON.parse(rawJob as string)).toMatchObject({
        status: 'failed',
      });
    });

    it('recovers orphaned jobs and process records on module init', async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const { jobId } = await redisBackedService.startTraining({
        loraName: 'test-lora',
        personaSlug: 'test-persona',
        triggerWord: 'ohwx',
      });
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Simulate a service restart while the process record is still present.
      const restarted = createService(publisher);
      await restarted.onModuleInit();

      expect(mockLoggerService.warn).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          jobId,
          message: 'Orphaned training process detected on startup',
          pid: 12345,
        }),
      );

      const job = await restarted.getTrainingJob(jobId);
      expect(job.status).toBe('failed');
      expect(job.stage).toBe('failed');
      expect(job.error).toContain('orphaned by service restart');
      expect(publisher.store.has(`training:images:process:${jobId}`)).toBe(
        false,
      );

      const persistedJob = publisher.store.get(`training:images:job:${jobId}`);
      expect(JSON.parse(persistedJob as string)).toMatchObject({
        stage: 'failed',
        status: 'failed',
      });
    });

    it('loads a job from Redis on getTrainingJob after a restart without init', async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const { jobId } = await redisBackedService.startTraining({
        loraName: 'test-lora',
        personaSlug: 'test-persona',
        triggerWord: 'ohwx',
      });
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Fresh instance, same Redis store, onModuleInit not run.
      const restarted = createService(publisher);
      const job = await restarted.getTrainingJob(jobId);

      expect(job.jobId).toBe(jobId);
      expect(job.personaSlug).toBe('test-persona');
    });

    it('starts cleanly when Redis is unavailable', async () => {
      const offlineService = createService(null);
      await offlineService.onModuleInit();

      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const { jobId } = await offlineService.startTraining({
        loraName: 'test-lora',
        personaSlug: 'test-persona',
        triggerWord: 'ohwx',
      });

      const job = await offlineService.getTrainingJob(jobId);
      expect(job.jobId).toBe(jobId);
    });
  });
});
