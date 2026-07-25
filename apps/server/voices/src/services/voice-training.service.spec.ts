import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { LoggerService } from '@libs/logger/logger.service';
import type { RedisService } from '@libs/redis/redis.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@voices/config/config.service';
import { VoiceTrainingService } from '@voices/services/voice-training.service';

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

describe('VoiceTrainingService', () => {
  let service: VoiceTrainingService;
  let mockLoggerService: {
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  const mockConfigService = {
    DATASETS_PATH: '/datasets',
    VOICE_MODELS_PATH: '/models/voices',
    VOICE_TRAINING_BINARY_PATH: '/usr/local/bin/voice-train',
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
        VoiceTrainingService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile();

    service = module.get<VoiceTrainingService>(VoiceTrainingService);
  });

  describe('startTraining', () => {
    it('should create a training job and return jobId with queued status', async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const result = await service.startTraining({
        voiceId: 'test-voice',
      });

      expect(result.jobId).toBeDefined();
      expect(typeof result.jobId).toBe('string');
      expect(result.status).toBe('queued');
      expect(mockSpawn).toHaveBeenCalledTimes(1);
    });

    it('should use default values for optional params', async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const result = await service.startTraining({
        voiceId: 'test-voice',
      });

      const job = await service.getJob(result.jobId);
      expect(job.params.sampleRate).toBe(22050);
      expect(job.params.epochs).toBe(100);
      expect(job.params.batchSize).toBe(8);
    });

    it('should use custom values when provided', async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const result = await service.startTraining({
        batchSize: 16,
        epochs: 200,
        sampleRate: 44100,
        voiceId: 'test-voice',
      });

      const job = await service.getJob(result.jobId);
      expect(job.params.sampleRate).toBe(44100);
      expect(job.params.epochs).toBe(200);
      expect(job.params.batchSize).toBe(16);
    });

    it('should throw if voiceId is missing', async () => {
      await expect(
        service.startTraining({
          voiceId: '',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('argument and path guards', () => {
    // `voiceId` lands in argv and in two filesystem paths. `spawn` runs without
    // a shell, so the hazards are traversal (`../`) and a value the trainer
    // re-reads as a flag because it starts with `-`.
    it.each([
      '../evil',
      '../../etc/passwd',
      'nested/name',
      '/absolute/voice',
      '-o',
      '--config_file=/etc/shadow',
      '.hidden',
      'name with space',
      '$(whoami)',
      'a;b',
    ])('rejects the voiceId %s without spawning', async (voiceId) => {
      await expect(service.startTraining({ voiceId })).rejects.toThrow(
        BadRequestException,
      );

      expect(mockSpawn).not.toHaveBeenCalled();
    });

    // Fields typed `number` in TypeScript are still arbitrary JSON at runtime.
    it.each([
      ['epochs', { epochs: 0 }],
      ['epochs', { epochs: 1.5 }],
      ['epochs', { epochs: 1_000_000 }],
      ['epochs', { epochs: '1e999' as unknown as number }],
      ['sampleRate', { sampleRate: 1 }],
      ['sampleRate', { sampleRate: Number.NaN }],
      ['sampleRate', { sampleRate: '44100' as unknown as number }],
      ['batchSize', { batchSize: 0 }],
      ['batchSize', { batchSize: 99_999 }],
      ['batchSize', { batchSize: Number.POSITIVE_INFINITY }],
    ])('rejects an out-of-contract %s without spawning', async (_field, overrides) => {
      await expect(
        service.startTraining({ voiceId: 'test-voice', ...overrides }),
      ).rejects.toThrow(BadRequestException);

      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('does not record a job when a request is rejected', async () => {
      await expect(
        service.startTraining({ voiceId: '../evil' }),
      ).rejects.toThrow(BadRequestException);

      expect(await service.listJobs()).toEqual([]);
    });

    // `buildTrainingCommand` is public, so it re-asserts rather than trusting
    // that `startTraining` already validated the params it was handed.
    it('re-validates params handed straight to buildTrainingCommand', () => {
      expect(() =>
        service.buildTrainingCommand({
          batchSize: 8,
          epochs: 100,
          sampleRate: 22050,
          voiceId: '../../etc',
        }),
      ).toThrow(BadRequestException);
    });
  });

  describe('getJob', () => {
    it('should return a training job by jobId', async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const { jobId } = await service.startTraining({
        voiceId: 'test-voice',
      });

      const job = await service.getJob(jobId);

      expect(job.jobId).toBe(jobId);
      expect(job.voiceId).toBe('test-voice');
    });

    it('should throw NotFoundException for unknown jobId', async () => {
      await expect(service.getJob('nonexistent-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('listJobs', () => {
    it('should return empty list when no jobs exist', async () => {
      const result = await service.listJobs();
      expect(result).toEqual([]);
    });

    it('should list all training jobs', async () => {
      const mockChild1 = createMockChildProcess();
      const mockChild2 = createMockChildProcess();
      mockSpawn.mockReturnValueOnce(mockChild1).mockReturnValueOnce(mockChild2);

      await service.startTraining({ voiceId: 'voice-1' });
      await service.startTraining({ voiceId: 'voice-2' });

      const jobs = await service.listJobs();

      expect(jobs).toHaveLength(2);
      expect(jobs[0].voiceId).toBe('voice-1');
      expect(jobs[1].voiceId).toBe('voice-2');
    });
  });

  describe('training lifecycle', () => {
    it('should mark job as completed when process exits with code 0', async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const { jobId } = await service.startTraining({
        voiceId: 'test-voice',
      });

      mockChild.emit('close', 0);
      await new Promise((resolve) => setTimeout(resolve, 10));

      const job = await service.getJob(jobId);
      expect(job.status).toBe('completed');
      expect(job.stage).toBe('completed');
      expect(job.progress).toBe(100);
      expect(job.completedAt).toBeDefined();
    });

    it('should mark job as failed when process exits with non-zero code', async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const { jobId } = await service.startTraining({
        voiceId: 'test-voice',
      });

      mockChild.emit('close', 1);
      await new Promise((resolve) => setTimeout(resolve, 10));

      const job = await service.getJob(jobId);
      expect(job.status).toBe('failed');
      expect(job.stage).toBe('failed');
      expect(job.error).toContain('exited with code 1');
    });

    it('should mark job as failed when process emits error', async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const { jobId } = await service.startTraining({
        voiceId: 'test-voice',
      });

      mockChild.emit('error', new Error('spawn ENOENT'));
      await new Promise((resolve) => setTimeout(resolve, 10));

      const job = await service.getJob(jobId);
      expect(job.status).toBe('failed');
      expect(job.stage).toBe('failed');
      expect(job.error).toContain('spawn ENOENT');
    });

    it('should handle spawn failure gracefully', async () => {
      mockSpawn.mockImplementation(() => {
        throw new Error('Command not found');
      });

      const { jobId } = await service.startTraining({
        voiceId: 'test-voice',
      });

      const job = await service.getJob(jobId);
      expect(job.status).toBe('failed');
      expect(job.stage).toBe('failed');
      expect(job.error).toContain('Command not found');
    });
  });

  describe('buildTrainingCommand', () => {
    it('should build correct command with all parameters', () => {
      const result = service.buildTrainingCommand({
        batchSize: 16,
        epochs: 200,
        sampleRate: 44100,
        voiceId: 'test-voice',
      });

      expect(result.command).toBe('/usr/local/bin/voice-train');
      expect(result.args).toContain('--dataset_path');
      expect(result.args).toContain('/datasets/voices/test-voice');
      expect(result.args).toContain('--output_path');
      expect(result.args).toContain('/models/voices/test-voice');
      expect(result.args).toContain('--sample_rate');
      expect(result.args).toContain('44100');
      expect(result.args).toContain('--epochs');
      expect(result.args).toContain('200');
      expect(result.args).toContain('--batch_size');
      expect(result.args).toContain('16');
    });
  });

  describe('Redis persistence', () => {
    let publisher: MockPublisher;
    let redisBackedService: VoiceTrainingService;

    function createService(
      targetPublisher: MockPublisher | null,
    ): VoiceTrainingService {
      return new VoiceTrainingService(
        mockConfigService as unknown as ConfigService,
        mockLoggerService as unknown as LoggerService,
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
        voiceId: 'test-voice',
      });
      await new Promise((resolve) => setTimeout(resolve, 10));

      const rawJob = publisher.store.get(`training:voices:job:${jobId}`);
      expect(rawJob).toBeDefined();
      expect(JSON.parse(rawJob as string)).toMatchObject({
        jobId,
        voiceId: 'test-voice',
      });

      const rawRecord = publisher.store.get(`training:voices:process:${jobId}`);
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
        voiceId: 'test-voice',
      });
      await new Promise((resolve) => setTimeout(resolve, 10));

      mockChild.emit('close', 0);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(publisher.store.has(`training:voices:process:${jobId}`)).toBe(
        false,
      );
      const rawJob = publisher.store.get(`training:voices:job:${jobId}`);
      expect(JSON.parse(rawJob as string)).toMatchObject({
        status: 'completed',
      });
    });

    it('removes the process record when the process emits an error', async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const { jobId } = await redisBackedService.startTraining({
        voiceId: 'test-voice',
      });
      await new Promise((resolve) => setTimeout(resolve, 10));

      mockChild.emit('error', new Error('spawn ENOENT'));
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(publisher.store.has(`training:voices:process:${jobId}`)).toBe(
        false,
      );
      const rawJob = publisher.store.get(`training:voices:job:${jobId}`);
      expect(JSON.parse(rawJob as string)).toMatchObject({
        status: 'failed',
      });
    });

    it('recovers orphaned jobs and process records on module init', async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const { jobId } = await redisBackedService.startTraining({
        voiceId: 'test-voice',
      });
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Simulate a service restart while the process record is still present.
      const restarted = createService(publisher);
      await restarted.onModuleInit();

      expect(mockLoggerService.warn).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          jobId,
          message: 'Orphaned voice training process detected on startup',
          pid: 12345,
        }),
      );

      const job = await restarted.getJob(jobId);
      expect(job.status).toBe('failed');
      expect(job.stage).toBe('failed');
      expect(job.error).toContain('orphaned by service restart');
      expect(publisher.store.has(`training:voices:process:${jobId}`)).toBe(
        false,
      );

      const persistedJob = publisher.store.get(`training:voices:job:${jobId}`);
      expect(JSON.parse(persistedJob as string)).toMatchObject({
        stage: 'failed',
        status: 'failed',
      });
    });

    it('loads a job from Redis on getJob after a restart without init', async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const { jobId } = await redisBackedService.startTraining({
        voiceId: 'test-voice',
      });
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Fresh instance, same Redis store, onModuleInit not run.
      const restarted = createService(publisher);
      const job = await restarted.getJob(jobId);

      expect(job.jobId).toBe(jobId);
      expect(job.voiceId).toBe('test-voice');
    });

    it('starts cleanly when Redis is unavailable', async () => {
      const offlineService = createService(null);
      await offlineService.onModuleInit();

      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const { jobId } = await offlineService.startTraining({
        voiceId: 'test-voice',
      });

      const job = await offlineService.getJob(jobId);
      expect(job.jobId).toBe(jobId);
    });
  });
});
