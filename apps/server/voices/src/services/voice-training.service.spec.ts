import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@voices/config/config.service';
import { VoiceTrainingService } from '@voices/services/voice-training.service';

// Mock child_process.spawn
const mockSpawn = vi.fn();
vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

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
});
