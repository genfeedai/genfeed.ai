import { LoggerService } from '@libs/logger/logger.service';
import { getQueueToken } from '@nestjs/bullmq';
import { Test, TestingModule } from '@nestjs/testing';

import {
  type AgentRunJobData,
  AgentRunQueueService,
} from './agent-run-queue.service';

const makeJobData = (
  overrides: Partial<AgentRunJobData> = {},
): AgentRunJobData => ({
  agentType: 'content',
  organizationId: 'org-xyz',
  runId: 'run-abc123',
  userId: 'user-1',
  ...overrides,
});

const makeJob = (state: string, id = 'agent-run-run-abc123') => ({
  getState: vi.fn().mockResolvedValue(state),
  id,
  moveToFailed: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn().mockResolvedValue(undefined),
});

describe('AgentRunQueueService', () => {
  let service: AgentRunQueueService;
  let queue: {
    getJob: ReturnType<typeof vi.fn>;
    add: ReturnType<typeof vi.fn>;
    getJobCounts: ReturnType<typeof vi.fn>;
  };
  let logger: vi.Mocked<LoggerService>;

  beforeEach(async () => {
    queue = {
      add: vi.fn(),
      getJob: vi.fn(),
      getJobCounts: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentRunQueueService,
        {
          provide: getQueueToken('agent-run'),
          useValue: queue,
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

    service = module.get<AgentRunQueueService>(AgentRunQueueService);
    logger = module.get(LoggerService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should log on module init', () => {
    service.onModuleInit();
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('initialized'),
    );
  });

  // ─── queueRun ─────────────────────────────────────────────────────────────

  describe('queueRun', () => {
    it('should add a new job when no existing job is found', async () => {
      queue.getJob.mockResolvedValue(null);
      queue.add.mockResolvedValue({ id: 'agent-run-run-abc123' });

      const jobId = await service.queueRun(makeJobData());

      expect(queue.add).toHaveBeenCalledWith(
        'execute-agent-run',
        expect.objectContaining({ runId: 'run-abc123' }),
        expect.objectContaining({ attempts: 3, jobId: 'agent-run-run-abc123' }),
      );
      expect(jobId).toBe('agent-run-run-abc123');
    });

    it('should return existing jobId without re-adding when job is active', async () => {
      queue.getJob.mockResolvedValue(makeJob('active'));

      const jobId = await service.queueRun(makeJobData());

      expect(queue.add).not.toHaveBeenCalled();
      expect(jobId).toBe('agent-run-run-abc123');
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should return existing jobId without re-adding when job is waiting', async () => {
      queue.getJob.mockResolvedValue(makeJob('waiting'));

      await service.queueRun(makeJobData());

      expect(queue.add).not.toHaveBeenCalled();
    });

    it('should remove completed job and re-add new one', async () => {
      const existingJob = makeJob('completed');
      queue.getJob.mockResolvedValue(existingJob);
      queue.add.mockResolvedValue({ id: 'agent-run-run-abc123' });

      await service.queueRun(makeJobData());

      expect(existingJob.remove).toHaveBeenCalled();
      expect(queue.add).toHaveBeenCalled();
    });

    it('should build deterministic jobId from runId', async () => {
      queue.getJob.mockResolvedValue(null);
      queue.add.mockResolvedValue({ id: 'agent-run-custom-run-99' });

      await service.queueRun(makeJobData({ runId: 'custom-run-99' }));

      expect(queue.getJob).toHaveBeenCalledWith('agent-run-custom-run-99');
      expect(queue.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({ jobId: 'agent-run-custom-run-99' }),
      );
    });
  });

  // ─── cancelRun ────────────────────────────────────────────────────────────

  describe('cancelRun', () => {
    it('should return false when job is not found', async () => {
      queue.getJob.mockResolvedValue(null);
      expect(await service.cancelRun('run-abc123')).toBe(false);
    });

    it('should remove and return true for waiting jobs', async () => {
      const job = makeJob('waiting');
      queue.getJob.mockResolvedValue(job);

      expect(await service.cancelRun('run-abc123')).toBe(true);
      expect(job.remove).toHaveBeenCalled();
    });

    it('should remove and return true for delayed jobs', async () => {
      const job = makeJob('delayed');
      queue.getJob.mockResolvedValue(job);

      expect(await service.cancelRun('run-abc123')).toBe(true);
      expect(job.remove).toHaveBeenCalled();
    });

    it('should move to failed and return true for active jobs', async () => {
      const job = makeJob('active');
      queue.getJob.mockResolvedValue(job);

      expect(await service.cancelRun('run-abc123')).toBe(true);
      expect(job.moveToFailed).toHaveBeenCalledWith(
        expect.any(Error),
        'agent-run-run-abc123',
      );
    });

    it('should return false for completed jobs (non-cancellable)', async () => {
      const job = makeJob('completed');
      queue.getJob.mockResolvedValue(job);

      expect(await service.cancelRun('run-abc123')).toBe(false);
      expect(job.remove).not.toHaveBeenCalled();
      expect(job.moveToFailed).not.toHaveBeenCalled();
    });
  });

  // ─── getQueueStats ────────────────────────────────────────────────────────

  describe('getQueueStats', () => {
    it('should return all queue counts', async () => {
      queue.getJobCounts.mockResolvedValue({
        active: 2,
        completed: 50,
        delayed: 1,
        failed: 3,
        waiting: 4,
      });

      const stats = await service.getQueueStats();

      expect(stats).toEqual({
        active: 2,
        completed: 50,
        delayed: 1,
        failed: 3,
        waiting: 4,
      });
    });

    it('should default missing counts to 0', async () => {
      queue.getJobCounts.mockResolvedValue({});

      const stats = await service.getQueueStats();

      expect(stats).toEqual({
        active: 0,
        completed: 0,
        delayed: 0,
        failed: 0,
        waiting: 0,
      });
    });
  });
});
