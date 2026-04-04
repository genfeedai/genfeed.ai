import { WorkflowQueueService } from '@api/queues/workflow/workflow-queue.service';
import { LoggerService } from '@libs/logger/logger.service';
import { getQueueToken } from '@nestjs/bullmq';
import { Test, type TestingModule } from '@nestjs/testing';

describe('WorkflowQueueService', () => {
  let service: WorkflowQueueService;
  let mockExecutionQueue: { add: ReturnType<typeof vi.fn> };
  let mockDelayQueue: {
    add: ReturnType<typeof vi.fn>;
    getJob: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockExecutionQueue = {
      add: vi.fn().mockResolvedValue({ id: 'job-1' }),
      getJob: vi.fn().mockResolvedValue(null),
      getJobCounts: vi
        .fn()
        .mockResolvedValue({ active: 0, delayed: 0, failed: 0, waiting: 0 }),
    };

    mockDelayQueue = {
      add: vi.fn().mockResolvedValue({ id: 'delay-job-1' }),
      getDelayed: vi.fn().mockResolvedValue([]),
      getJob: vi.fn().mockResolvedValue(null),
      getJobCounts: vi
        .fn()
        .mockResolvedValue({ active: 0, delayed: 0, failed: 0, waiting: 0 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowQueueService,
        {
          provide: getQueueToken('workflow-execution'),
          useValue: mockExecutionQueue,
        },
        {
          provide: getQueueToken('workflow-delay'),
          useValue: mockDelayQueue,
        },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<WorkflowQueueService>(WorkflowQueueService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('queueExecution', () => {
    it('should add job to execution queue', async () => {
      const data = {
        executionId: 'exec-1',
        organizationId: 'org-1',
        trigger: 'manual' as const,
        userId: 'user-1',
        workflowId: 'wf-1',
      };

      const jobId = await service.queueExecution(data);

      expect(jobId).toBe('job-1');
      expect(mockExecutionQueue.add).toHaveBeenCalledWith(
        'execute-workflow',
        data,
        expect.objectContaining({
          attempts: 3,
          jobId: 'wf-exec-exec-1',
        }),
      );
    });
  });

  describe('queueDelayedResume', () => {
    it('should add delayed job to delay queue', async () => {
      const data = {
        delayNodeId: 'delay-1',
        executionId: 'exec-1',
        organizationId: 'org-1',
        resumeAt: new Date(Date.now() + 60_000).toISOString(),
        scheduledAt: new Date().toISOString(),
        userId: 'user-1',
        workflowId: 'wf-1',
      };

      const jobId = await service.queueDelayedResume(data, 60_000);

      expect(jobId).toBe('delay-job-1');
      expect(mockDelayQueue.add).toHaveBeenCalledWith(
        'delay-resume',
        data,
        expect.objectContaining({
          delay: 60_000,
          jobId: 'wf-delay-exec-1-delay-1',
        }),
      );
    });
  });

  describe('cancelDelayedResume', () => {
    it('should remove job if found', async () => {
      const mockJob = { remove: vi.fn() };
      mockDelayQueue.getJob.mockResolvedValue(mockJob);

      const result = await service.cancelDelayedResume('exec-1', 'delay-1');

      expect(result).toBe(true);
      expect(mockJob.remove).toHaveBeenCalled();
    });

    it('should return false if job not found', async () => {
      const result = await service.cancelDelayedResume('exec-1', 'delay-1');
      expect(result).toBe(false);
    });
  });

  describe('getQueueStats', () => {
    it('should return combined stats', async () => {
      const stats = await service.getQueueStats();

      expect(stats.execution).toEqual({
        active: 0,
        delayed: 0,
        failed: 0,
        waiting: 0,
      });
      expect(stats.delay).toEqual({
        active: 0,
        delayed: 0,
        failed: 0,
        waiting: 0,
      });
    });
  });
});
