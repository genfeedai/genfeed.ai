import { ContentOptimizationQueueService } from '@api/services/content-optimization/content-optimization-queue.service';
import { LoggerService } from '@libs/logger/logger.service';
import { getQueueToken } from '@nestjs/bullmq';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('ContentOptimizationQueueService', () => {
  let service: ContentOptimizationQueueService;
  let mockQueue: {
    add: ReturnType<typeof vi.fn>;
    getJob: ReturnType<typeof vi.fn>;
  };
  let mockLogger: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockQueue = {
      add: vi.fn(),
      getJob: vi.fn(),
    };

    mockLogger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentOptimizationQueueService,
        {
          provide: getQueueToken('content-optimization'),
          useValue: mockQueue,
        },
        {
          provide: LoggerService,
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get<ContentOptimizationQueueService>(
      ContentOptimizationQueueService,
    );
  });

  describe('queueAnalysis', () => {
    it('should queue an analysis job', async () => {
      mockQueue.add.mockResolvedValue({ id: 'job-123' });

      const jobId = await service.queueAnalysis('org-1', 'brand-1');

      expect(jobId).toBe('job-123');
      expect(mockQueue.add).toHaveBeenCalledWith('analyze', {
        brandId: 'brand-1',
        organizationId: 'org-1',
        type: 'analyze',
      });
      expect(mockLogger.log).toHaveBeenCalledWith(
        'Queued content-optimization analyze job',
        expect.objectContaining({
          brandId: 'brand-1',
          jobId: 'job-123',
        }),
      );
    });
  });

  describe('queuePromptOptimization', () => {
    it('should queue a prompt optimization job', async () => {
      mockQueue.add.mockResolvedValue({ id: 'job-456' });

      const jobId = await service.queuePromptOptimization(
        'org-1',
        'brand-1',
        'Original prompt',
      );

      expect(jobId).toBe('job-456');
      expect(mockQueue.add).toHaveBeenCalledWith('optimize-prompt', {
        brandId: 'brand-1',
        organizationId: 'org-1',
        prompt: 'Original prompt',
        type: 'optimize-prompt',
      });
      expect(mockLogger.log).toHaveBeenCalledWith(
        'Queued content-optimization prompt job',
        expect.objectContaining({
          brandId: 'brand-1',
          jobId: 'job-456',
        }),
      );
    });
  });

  describe('getJobStatus', () => {
    it('should return job status when job exists', async () => {
      const mockJob = {
        getState: vi.fn().mockResolvedValue('completed'),
        id: 'job-789',
        returnvalue: { result: 'success' },
      };

      mockQueue.getJob.mockResolvedValue(mockJob);

      const status = await service.getJobStatus('job-789');

      expect(status).toEqual({
        id: 'job-789',
        result: { result: 'success' },
        status: 'completed',
      });
      expect(mockQueue.getJob).toHaveBeenCalledWith('job-789');
    });

    it('should return not_found when job does not exist', async () => {
      mockQueue.getJob.mockResolvedValue(null);

      const status = await service.getJobStatus('nonexistent');

      expect(status).toEqual({
        id: 'nonexistent',
        status: 'not_found',
      });
    });

    it('should return undefined result when job has no return value', async () => {
      const mockJob = {
        getState: vi.fn().mockResolvedValue('waiting'),
        id: 'job-pending',
        returnvalue: undefined,
      };

      mockQueue.getJob.mockResolvedValue(mockJob);

      const status = await service.getJobStatus('job-pending');

      expect(status).toEqual({
        id: 'job-pending',
        result: undefined,
        status: 'waiting',
      });
    });

    it('should handle null returnvalue', async () => {
      const mockJob = {
        getState: vi.fn().mockResolvedValue('failed'),
        id: 'job-null',
        returnvalue: null,
      };

      mockQueue.getJob.mockResolvedValue(mockJob);

      const status = await service.getJobStatus('job-null');

      expect(status).toEqual({
        id: 'job-null',
        result: undefined,
        status: 'failed',
      });
    });
  });
});
