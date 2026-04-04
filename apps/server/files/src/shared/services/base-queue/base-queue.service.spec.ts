import { JOB_PRIORITY, JOB_TYPES } from '@files/queues/queue.constants';
import {
  type BaseJobDataWithPriority,
  BaseQueueService,
  DEFAULT_JOB_CONFIG,
} from '@files/shared/services/base-queue/base-queue.service';
import type { Job, Queue } from 'bullmq';

interface TestJobData extends BaseJobDataWithPriority {
  fileId: string;
  ingredientId?: string;
}

class TestQueueService extends BaseQueueService<TestJobData> {
  protected override readonly jobConfigs = {
    [JOB_TYPES.DOWNLOAD_FILE]: {
      attempts: 5,
      defaultPriority: JOB_PRIORITY.HIGH,
      delay: 1000,
    },
  };

  async addDownload(data: TestJobData): Promise<Job<TestJobData>> {
    return this.addJob(JOB_TYPES.DOWNLOAD_FILE, data, 'download', data.fileId);
  }

  async addDelayedDownload(
    data: TestJobData,
    delayMs: number,
  ): Promise<Job<TestJobData>> {
    return this.addJobWithDelay(
      JOB_TYPES.DOWNLOAD_FILE,
      data,
      delayMs,
      'delayed-download',
      data.fileId,
    );
  }
}

describe('BaseQueueService', () => {
  let service: TestQueueService;

  const mockJob = { id: 'job-1' } as unknown as Job<TestJobData>;

  const mockQueue = {
    add: vi.fn().mockResolvedValue(mockJob),
    clean: vi.fn().mockResolvedValue(undefined),
    getJob: vi.fn(),
    getJobCounts: vi.fn(),
    pause: vi.fn().mockResolvedValue(undefined),
    resume: vi.fn().mockResolvedValue(undefined),
  } as unknown as Queue<TestJobData>;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TestQueueService(mockQueue, TestQueueService.name);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('addJob', () => {
    it('should call queue.add with job type and data', async () => {
      await service.addDownload({ fileId: 'file-1' });

      expect(mockQueue.add).toHaveBeenCalledWith(
        JOB_TYPES.DOWNLOAD_FILE,
        expect.objectContaining({ fileId: 'file-1' }),
        expect.any(Object),
      );
    });

    it('should use configured attempts from jobConfigs', async () => {
      await service.addDownload({ fileId: 'file-1' });

      expect(mockQueue.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({ attempts: 5 }),
      );
    });

    it('should fall back to DEFAULT_JOB_CONFIG for unknown job types', async () => {
      // We call an unconfigured job type via a different subclass behaviour — simulate by calling with UPLOAD_TO_S3
      class MinimalService extends BaseQueueService<TestJobData> {
        async addUpload(data: TestJobData) {
          return this.addJob(JOB_TYPES.UPLOAD_TO_S3, data, 'upload');
        }
      }

      const minimal = new MinimalService(mockQueue, 'Minimal');
      await minimal.addUpload({ fileId: 'f-2' });

      expect(mockQueue.add).toHaveBeenCalledWith(
        JOB_TYPES.UPLOAD_TO_S3,
        expect.any(Object),
        expect.objectContaining({ attempts: DEFAULT_JOB_CONFIG.attempts }),
      );
    });

    it('should use data.priority when provided', async () => {
      await service.addDownload({ fileId: 'hi', priority: JOB_PRIORITY.LOW });

      expect(mockQueue.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({ priority: JOB_PRIORITY.LOW }),
      );
    });

    it('should return the created job', async () => {
      const result = await service.addDownload({ fileId: 'ret-1' });
      expect(result).toBe(mockJob);
    });
  });

  describe('addJobWithDelay', () => {
    it('should pass delay to queue.add options', async () => {
      await service.addDelayedDownload({ fileId: 'delayed-1' }, 5000);

      expect(mockQueue.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({ delay: 5000 }),
      );
    });

    it('should still use configured attempts', async () => {
      await service.addDelayedDownload({ fileId: 'delayed-2' }, 3000);

      expect(mockQueue.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({ attempts: 5 }),
      );
    });
  });

  describe('getJob', () => {
    it('should call queue.getJob', async () => {
      mockQueue.getJob = vi.fn().mockResolvedValue(mockJob);

      const result = await service.getJob('job-1');

      expect(mockQueue.getJob).toHaveBeenCalledWith('job-1');
      expect(result).toBe(mockJob);
    });

    it('should return undefined when job not found', async () => {
      mockQueue.getJob = vi.fn().mockResolvedValue(undefined);

      const result = await service.getJob('unknown');
      expect(result).toBeUndefined();
    });
  });

  describe('getJobCounts', () => {
    it('should delegate to queue.getJobCounts', () => {
      const counts = { active: 1, completed: 5, failed: 0, waiting: 2 };
      mockQueue.getJobCounts = vi.fn().mockReturnValue(counts);

      const result = service.getJobCounts();

      expect(mockQueue.getJobCounts).toHaveBeenCalled();
      expect(result).toEqual(counts);
    });
  });

  describe('clean', () => {
    it('should clean completed and failed jobs', async () => {
      await service.clean();

      expect(mockQueue.clean).toHaveBeenCalledWith(
        expect.any(Number),
        0,
        'completed',
      );
      expect(mockQueue.clean).toHaveBeenCalledWith(
        expect.any(Number),
        0,
        'failed',
      );
    });

    it('should use default grace of 1 hour for completed jobs', async () => {
      await service.clean();

      const completedCall = (
        mockQueue.clean as ReturnType<typeof vi.fn>
      ).mock.calls.find((c: unknown[]) => c[2] === 'completed');
      expect(completedCall?.[0]).toBe(3_600_000);
    });
  });

  describe('pause and resume', () => {
    it('should call queue.pause', async () => {
      await service.pause();
      expect(mockQueue.pause).toHaveBeenCalled();
    });

    it('should call queue.resume', async () => {
      await service.resume();
      expect(mockQueue.resume).toHaveBeenCalled();
    });
  });
});
