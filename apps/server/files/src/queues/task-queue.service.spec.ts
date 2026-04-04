import { QUEUE_NAMES } from '@files/queues/queue.constants';
import {
  type TaskJobData,
  TaskQueueService,
} from '@files/queues/task-queue.service';
import { getQueueToken } from '@nestjs/bullmq';
import { Test, type TestingModule } from '@nestjs/testing';

describe('TaskQueueService', () => {
  let service: TaskQueueService;
  let mockQueue: any;

  beforeEach(async () => {
    mockQueue = {
      add: vi.fn().mockResolvedValue({ id: 'test-job-id' }),
      clean: vi.fn(),
      getJob: vi.fn(),
      getJobCounts: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskQueueService,
        {
          provide: getQueueToken(QUEUE_NAMES.TASK_PROCESSING),
          useValue: mockQueue,
        },
      ],
    }).compile();

    service = module.get<TaskQueueService>(TaskQueueService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('addTransformJob', () => {
    it('should queue a transform job with correct params', async () => {
      const jobData: TaskJobData = {
        assetId: 'asset-abc',
        config: { aspectRatio: '9:16', orientation: 'portrait' },
        organizationId: 'org-789',
        taskId: 'task-123',
        userId: 'user-456',
      };

      const result = await service.addTransformJob(jobData);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'transform-media',
        jobData,
        expect.objectContaining({
          attempts: 3,
          backoff: {
            delay: 2000,
            type: 'exponential',
          },
          priority: 5,
        }),
      );
      expect(result.id).toBe('test-job-id');
    });
  });

  describe('addUpscaleJob', () => {
    it('should queue an upscale job with correct params', async () => {
      const jobData: TaskJobData = {
        assetId: 'asset-abc',
        config: { quality: 'high', resolution: '4k' },
        organizationId: 'org-789',
        taskId: 'task-123',
        userId: 'user-456',
      };

      const result = await service.addUpscaleJob(jobData);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'upscale-media',
        jobData,
        expect.objectContaining({
          attempts: 3,
          priority: 5,
        }),
      );
      expect(result.id).toBe('test-job-id');
    });
  });

  describe('addCaptionJob', () => {
    it('should queue a caption job with correct params', async () => {
      const jobData: TaskJobData = {
        assetId: 'asset-abc',
        config: { position: 'bottom', style: 'minimal' },
        organizationId: 'org-789',
        taskId: 'task-123',
        userId: 'user-456',
      };

      const result = await service.addCaptionJob(jobData);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'caption-media',
        jobData,
        expect.objectContaining({
          attempts: 3,
          priority: 5,
        }),
      );
      expect(result.id).toBe('test-job-id');
    });
  });

  describe('addResizeJob', () => {
    it('should queue a resize job with correct params', async () => {
      const jobData: TaskJobData = {
        assetId: 'asset-abc',
        config: { height: 1080, width: 1920 },
        organizationId: 'org-789',
        taskId: 'task-123',
        userId: 'user-456',
      };

      const result = await service.addResizeJob(jobData);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'resize-media',
        jobData,
        expect.objectContaining({
          attempts: 3,
          priority: 5,
        }),
      );
      expect(result.id).toBe('test-job-id');
    });
  });

  describe('addClipJob', () => {
    it('should queue a clip job with correct params', async () => {
      const jobData: TaskJobData = {
        assetId: 'asset-abc',
        config: { count: 3, duration: 10 },
        organizationId: 'org-789',
        taskId: 'task-123',
        userId: 'user-456',
      };

      const result = await service.addClipJob(jobData);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'clip-media',
        jobData,
        expect.objectContaining({
          attempts: 3,
          priority: 5,
        }),
      );
      expect(result.id).toBe('test-job-id');
    });
  });

  describe('getJob', () => {
    it('should retrieve a job by ID', async () => {
      const mockJob = { data: {}, id: 'test-job-id' };
      mockQueue.getJob.mockResolvedValue(mockJob);

      const result = await service.getJob('test-job-id');

      expect(mockQueue.getJob).toHaveBeenCalledWith('test-job-id');
      expect(result).toEqual(mockJob);
    });
  });

  describe('getJobCounts', () => {
    it('should retrieve job counts', async () => {
      const mockCounts = {
        active: 2,
        completed: 100,
        failed: 3,
        waiting: 5,
      };
      mockQueue.getJobCounts.mockResolvedValue(mockCounts);

      const result = await service.getJobCounts();

      expect(mockQueue.getJobCounts).toHaveBeenCalled();
      expect(result).toEqual(mockCounts);
    });
  });

  describe('clean', () => {
    it('should clean completed and failed jobs', async () => {
      await service.clean(3600000);

      expect(mockQueue.clean).toHaveBeenCalledWith(3600000, 'completed');
      expect(mockQueue.clean).toHaveBeenCalledWith(7200000, 'failed');
    });
  });
});
