import {
  JOB_PRIORITY,
  JOB_TYPES,
  QUEUE_NAMES,
} from '@files/queues/queue.constants';
import { YoutubeQueueService } from '@files/queues/youtube-queue.service';
import type { YoutubeJobData } from '@files/shared/interfaces/job.interface';
import { getQueueToken } from '@nestjs/bullmq';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Mock } from 'vitest';

describe('YoutubeQueueService', () => {
  let service: YoutubeQueueService;
  let mockQueue: {
    add: Mock;
    getJob: Mock;
    getJobCounts: Mock;
    clean: Mock;
  };

  const mockJobData: YoutubeJobData = {
    credentialId: 'cred-def',
    description: 'Test description',
    ingredientId: 'ingredient-456',
    organizationId: 'org-789',
    postId: 'post-123',
    status: 'public',
    tags: ['test', 'video'],
    title: 'Test Video',
    userId: 'user-abc',
  };

  const mockJob = {
    data: mockJobData,
    id: 'job-001',
    name: JOB_TYPES.UPLOAD_YOUTUBE,
  };

  beforeEach(async () => {
    mockQueue = {
      add: vi.fn().mockResolvedValue(mockJob),
      clean: vi.fn().mockResolvedValue(undefined),
      getJob: vi.fn().mockResolvedValue(mockJob),
      getJobCounts: vi.fn().mockResolvedValue({
        active: 2,
        completed: 100,
        failed: 3,
        waiting: 5,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        YoutubeQueueService,
        {
          provide: getQueueToken(QUEUE_NAMES.YOUTUBE_PROCESSING),
          useValue: mockQueue,
        },
      ],
    }).compile();

    service = module.get<YoutubeQueueService>(YoutubeQueueService);

    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('addUploadUnlistedJob', () => {
    it('should add unlisted upload job with high priority', async () => {
      const result = await service.addUploadUnlistedJob(mockJobData);

      expect(result).toEqual(mockJob);
      expect(mockQueue.add).toHaveBeenCalledWith(
        JOB_TYPES.UPLOAD_YOUTUBE_UNLISTED,
        mockJobData,
        {
          attempts: 3,
          backoff: {
            delay: 2000,
            type: 'exponential',
          },
          priority: JOB_PRIORITY.HIGH,
        },
      );
    });

    it('should use custom priority when provided', async () => {
      const dataWithPriority = {
        ...mockJobData,
        priority: JOB_PRIORITY.CRITICAL,
      };

      await service.addUploadUnlistedJob(dataWithPriority);

      expect(mockQueue.add).toHaveBeenCalledWith(
        JOB_TYPES.UPLOAD_YOUTUBE_UNLISTED,
        dataWithPriority,
        {
          attempts: 3,
          backoff: {
            delay: 2000,
            type: 'exponential',
          },
          priority: JOB_PRIORITY.CRITICAL,
        },
      );
    });

    it('should configure exponential backoff with 2000ms delay', async () => {
      await service.addUploadUnlistedJob(mockJobData);

      expect(mockQueue.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          backoff: {
            delay: 2000,
            type: 'exponential',
          },
        }),
      );
    });

    it('should configure 3 retry attempts', async () => {
      await service.addUploadUnlistedJob(mockJobData);

      expect(mockQueue.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          attempts: 3,
        }),
      );
    });

    it('should return the created job', async () => {
      const result = await service.addUploadUnlistedJob(mockJobData);

      expect(result.id).toBe('job-001');
      expect(result.data).toEqual(mockJobData);
    });
  });

  describe('addUploadJob', () => {
    it('should add upload job with high priority', async () => {
      const result = await service.addUploadJob(mockJobData);

      expect(result).toEqual(mockJob);
      expect(mockQueue.add).toHaveBeenCalledWith(
        JOB_TYPES.UPLOAD_YOUTUBE,
        mockJobData,
        {
          attempts: 3,
          backoff: {
            delay: 2000,
            type: 'exponential',
          },
          priority: JOB_PRIORITY.HIGH,
        },
      );
    });

    it('should use custom priority when provided', async () => {
      const dataWithPriority = {
        ...mockJobData,
        priority: JOB_PRIORITY.LOW,
      };

      await service.addUploadJob(dataWithPriority);

      expect(mockQueue.add).toHaveBeenCalledWith(
        JOB_TYPES.UPLOAD_YOUTUBE,
        dataWithPriority,
        expect.objectContaining({
          priority: JOB_PRIORITY.LOW,
        }),
      );
    });

    it('should configure same retry settings as unlisted', async () => {
      await service.addUploadJob(mockJobData);

      expect(mockQueue.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          attempts: 3,
          backoff: {
            delay: 2000,
            type: 'exponential',
          },
        }),
      );
    });
  });

  describe('getJob', () => {
    it('should retrieve job by ID', async () => {
      const result = await service.getJob('job-001');

      expect(result).toEqual(mockJob);
      expect(mockQueue.getJob).toHaveBeenCalledWith('job-001');
    });

    it('should return undefined for non-existent job', async () => {
      mockQueue.getJob.mockResolvedValue(undefined);

      const result = await service.getJob('non-existent');

      expect(result).toBeUndefined();
    });
  });

  describe('getJobCounts', () => {
    it('should return job counts', async () => {
      const result = await service.getJobCounts();

      expect(result).toEqual({
        active: 2,
        completed: 100,
        failed: 3,
        waiting: 5,
      });
      expect(mockQueue.getJobCounts).toHaveBeenCalled();
    });
  });

  describe('clean', () => {
    it('should clean completed and failed jobs with default grace period', async () => {
      await service.clean();

      // Default grace is 3600000 (1 hour)
      expect(mockQueue.clean).toHaveBeenCalledWith(3600000, 0, 'completed');
      expect(mockQueue.clean).toHaveBeenCalledWith(7200000, 0, 'failed');
    });

    it('should clean with custom grace period', async () => {
      const customGrace = 1800000; // 30 minutes

      await service.clean(customGrace);

      expect(mockQueue.clean).toHaveBeenCalledWith(1800000, 0, 'completed');
      expect(mockQueue.clean).toHaveBeenCalledWith(3600000, 0, 'failed');
    });

    it('should clean failed jobs with double the grace period', async () => {
      await service.clean(1000);

      expect(mockQueue.clean).toHaveBeenNthCalledWith(1, 1000, 0, 'completed');
      expect(mockQueue.clean).toHaveBeenNthCalledWith(2, 2000, 0, 'failed');
    });
  });
});
