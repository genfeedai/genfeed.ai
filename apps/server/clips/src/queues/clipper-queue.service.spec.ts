import {
  CLIPPER_JOB_TYPES,
  CLIPPER_QUEUE_NAME,
} from '@clips/queues/clipper-queue.constants';
import { ClipperQueueService } from '@clips/queues/clipper-queue.service';
import { LoggerService } from '@libs/logger/logger.service';
import { getQueueToken } from '@nestjs/bullmq';
import { Test, type TestingModule } from '@nestjs/testing';

describe('ClipperQueueService', () => {
  let service: ClipperQueueService;

  const mockQueue = {
    add: vi.fn(),
  };

  const mockLogger = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClipperQueueService,
        {
          provide: getQueueToken(CLIPPER_QUEUE_NAME),
          useValue: mockQueue,
        },
        {
          provide: LoggerService,
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get<ClipperQueueService>(ClipperQueueService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('addProcessJob', () => {
    it('should add a process job with correct type', async () => {
      mockQueue.add.mockResolvedValue({ id: 'job-123' });

      await service.addProcessJob('proj-1', 'user-1', 'org-1');

      expect(mockQueue.add).toHaveBeenCalledWith(
        CLIPPER_JOB_TYPES.PROCESS_PROJECT,
        expect.objectContaining({
          organizationId: 'org-1',
          projectId: 'proj-1',
          userId: 'user-1',
        }),
        expect.any(Object),
      );
    });

    it('should return job id', async () => {
      mockQueue.add.mockResolvedValue({ id: 'job-abc' });

      const result = await service.addProcessJob('proj-1', 'user-1', 'org-1');

      expect(result).toBe('job-abc');
    });

    it('should set removeOnComplete and removeOnFail options', async () => {
      mockQueue.add.mockResolvedValue({ id: 'job-1' });

      await service.addProcessJob('proj-x', 'user-x', 'org-x');

      expect(mockQueue.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          removeOnComplete: 50,
          removeOnFail: 25,
        }),
      );
    });

    it('should use a jobId prefixed with clipper-', async () => {
      mockQueue.add.mockResolvedValue({ id: 'job-1' });

      await service.addProcessJob('proj-42', 'user-1', 'org-1');

      const callArgs = mockQueue.add.mock.calls[0][2] as { jobId: string };
      expect(callArgs.jobId).toMatch(/^clipper-proj-42-\d+$/);
    });

    it('should log before adding job', async () => {
      mockQueue.add.mockResolvedValue({ id: 'job-1' });

      await service.addProcessJob('proj-log', 'user-1', 'org-1');

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('proj-log'),
      );
    });
  });

  describe('addRetryJob', () => {
    it('should add a retry job with correct type', async () => {
      mockQueue.add.mockResolvedValue({ id: 'retry-123' });

      await service.addRetryJob('proj-1', 'user-1', 'org-1');

      expect(mockQueue.add).toHaveBeenCalledWith(
        CLIPPER_JOB_TYPES.RETRY_PROJECT,
        expect.objectContaining({
          organizationId: 'org-1',
          projectId: 'proj-1',
          userId: 'user-1',
        }),
        expect.any(Object),
      );
    });

    it('should return job id for retry', async () => {
      mockQueue.add.mockResolvedValue({ id: 'retry-abc' });

      const result = await service.addRetryJob('proj-1', 'user-1', 'org-1');

      expect(result).toBe('retry-abc');
    });

    it('should use a jobId prefixed with clipper-retry-', async () => {
      mockQueue.add.mockResolvedValue({ id: 'retry-1' });

      await service.addRetryJob('proj-99', 'user-1', 'org-1');

      const callArgs = mockQueue.add.mock.calls[0][2] as { jobId: string };
      expect(callArgs.jobId).toMatch(/^clipper-retry-proj-99-\d+$/);
    });

    it('should log before adding retry job', async () => {
      mockQueue.add.mockResolvedValue({ id: 'retry-1' });

      await service.addRetryJob('proj-retry', 'user-1', 'org-1');

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('proj-retry'),
      );
    });

    it('should set removeOnComplete and removeOnFail for retry jobs', async () => {
      mockQueue.add.mockResolvedValue({ id: 'retry-1' });

      await service.addRetryJob('proj-x', 'user-x', 'org-x');

      expect(mockQueue.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          removeOnComplete: 50,
          removeOnFail: 25,
        }),
      );
    });
  });
});
