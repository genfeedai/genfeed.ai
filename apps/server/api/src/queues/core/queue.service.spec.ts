import { QueueService } from '@api/queues/core/queue.service';
import { getQueueToken } from '@nestjs/bullmq';
import { Test, TestingModule } from '@nestjs/testing';
import { Job, Queue } from 'bullmq';

describe('QueueService', () => {
  let service: QueueService;
  let queue: vi.Mocked<Queue>;

  const mockJob = {
    data: { test: 'data' },
    id: 'job-123',
    name: 'test-job',
    opts: {},
  } as Job;

  beforeEach(async () => {
    const mockQueue = {
      add: vi.fn(),
      clean: vi.fn(),
      getActive: vi.fn(),
      getCompleted: vi.fn(),
      getDelayed: vi.fn(),
      getFailed: vi.fn(),
      getJob: vi.fn(),
      getJobCounts: vi.fn(),
      getJobs: vi.fn(),
      getWaiting: vi.fn(),
      isPaused: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueueService,
        { provide: getQueueToken('default'), useValue: mockQueue },
        { provide: getQueueToken('analytics-twitter'), useValue: mockQueue },
        { provide: getQueueToken('analytics-youtube'), useValue: mockQueue },
        { provide: getQueueToken('analytics-social'), useValue: mockQueue },
        { provide: getQueueToken('ad-sync-meta'), useValue: mockQueue },
        { provide: getQueueToken('ad-sync-google'), useValue: mockQueue },
        { provide: getQueueToken('ad-sync-tiktok'), useValue: mockQueue },
        {
          provide: getQueueToken('ad-insights-aggregation'),
          useValue: mockQueue,
        },
        { provide: getQueueToken('analytics-sync'), useValue: mockQueue },
        { provide: getQueueToken('email-digest'), useValue: mockQueue },
        { provide: getQueueToken('ad-bulk-upload'), useValue: mockQueue },
        { provide: getQueueToken('ad-optimization'), useValue: mockQueue },
        { provide: getQueueToken('telegram-distribute'), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<QueueService>(QueueService);
    queue = module.get(getQueueToken('default'));

    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('add', () => {
    it('should add a job to the queue', async () => {
      const jobName = 'process-video';
      const jobData = { userId: '456', videoId: '123' };
      const options = { priority: 1 };

      queue.add.mockResolvedValue(mockJob);

      const result = await service.add(jobName, jobData, options);

      expect(result).toBe(mockJob);
      expect(queue.add).toHaveBeenCalledWith(jobName, jobData, options);
    });

    it('should add a job without options', async () => {
      const jobName = 'process-image';
      const jobData = { imageId: '789' };

      queue.add.mockResolvedValue(mockJob);

      const result = await service.add(jobName, jobData);

      expect(result).toBe(mockJob);
      expect(queue.add).toHaveBeenCalledWith(jobName, jobData, undefined);
    });

    it('should handle errors when adding job', async () => {
      const error = new Error('Queue full');

      queue.add.mockRejectedValue(error);

      await expect(service.add('test-job', {})).rejects.toThrow(error);
    });
  });

  describe('getJob', () => {
    it('should retrieve a job by ID', async () => {
      const jobId = 'job-123';

      queue.getJob.mockResolvedValue(mockJob);

      const result = await service.getJob(jobId);

      expect(result).toBe(mockJob);
      expect(queue.getJob).toHaveBeenCalledWith(jobId);
    });

    it('should return undefined for non-existent job', async () => {
      const jobId = 'non-existent';

      queue.getJob.mockResolvedValue(undefined);

      const result = await service.getJob(jobId);

      expect(result).toBeUndefined();
    });
  });

  describe('getJobs', () => {
    it('should retrieve jobs by status', async () => {
      const mockJobs = [mockJob, { ...mockJob, id: 'job-124' } as Job];

      queue.getJobs.mockResolvedValue(mockJobs);

      const result = await service.getJobs('waiting');

      expect(result).toEqual(mockJobs);
      expect(queue.getJobs).toHaveBeenCalledWith(
        ['waiting'],
        undefined,
        undefined,
      );
    });

    it('should retrieve jobs with start and end range', async () => {
      const mockJobs = [mockJob];

      queue.getJobs.mockResolvedValue(mockJobs);

      const result = await service.getJobs('completed', 0, 10);

      expect(result).toEqual(mockJobs);
      expect(queue.getJobs).toHaveBeenCalledWith(['completed'], 0, 10);
    });

    it('should handle different job statuses', async () => {
      queue.getJobs.mockResolvedValue([mockJob]);

      await service.getJobs('active');
      expect(queue.getJobs).toHaveBeenCalledWith(
        ['active'],
        undefined,
        undefined,
      );

      await service.getJobs('failed');
      expect(queue.getJobs).toHaveBeenCalledWith(
        ['failed'],
        undefined,
        undefined,
      );

      await service.getJobs('delayed');
      expect(queue.getJobs).toHaveBeenCalledWith(
        ['delayed'],
        undefined,
        undefined,
      );
    });
  });

  describe('clean', () => {
    it('should clean completed jobs', async () => {
      const removedIds = ['job-1', 'job-2', 'job-3'];

      queue.clean.mockResolvedValue(removedIds);

      const result = await service.clean(1000, 'completed');

      expect(result).toEqual(removedIds);
      expect(queue.clean).toHaveBeenCalledWith(1000, 0, 'completed');
    });

    it('should clean failed jobs', async () => {
      const removedIds = ['job-4', 'job-5'];

      queue.clean.mockResolvedValue(removedIds);

      const result = await service.clean(5000, 'failed');

      expect(result).toEqual(removedIds);
      expect(queue.clean).toHaveBeenCalledWith(5000, 0, 'failed');
    });

    it('should return empty array when no jobs to clean', async () => {
      queue.clean.mockResolvedValue([]);

      const result = await service.clean(1000, 'completed');

      expect(result).toEqual([]);
    });
  });

  describe('pause', () => {
    it('should pause the queue', async () => {
      queue.pause.mockResolvedValue(undefined);

      await service.pause();

      expect(queue.pause).toHaveBeenCalled();
    });
  });

  describe('resume', () => {
    it('should resume the queue', async () => {
      queue.resume.mockResolvedValue(undefined);

      await service.resume();

      expect(queue.resume).toHaveBeenCalled();
    });
  });

  describe('isPaused', () => {
    it('should return true when queue is paused', async () => {
      queue.isPaused.mockResolvedValue(true);

      const result = await service.isPaused();

      expect(result).toBe(true);
      expect(queue.isPaused).toHaveBeenCalled();
    });

    it('should return false when queue is not paused', async () => {
      queue.isPaused.mockResolvedValue(false);

      const result = await service.isPaused();

      expect(result).toBe(false);
    });
  });

  describe('getWaiting', () => {
    it('should retrieve waiting jobs', async () => {
      const mockJobs = [mockJob, { ...mockJob, id: 'job-124' } as Job];

      queue.getWaiting.mockResolvedValue(mockJobs);

      const result = await service.getWaiting();

      expect(result).toEqual(mockJobs);
      expect(queue.getWaiting).toHaveBeenCalled();
    });
  });

  describe('getActive', () => {
    it('should retrieve active jobs', async () => {
      const mockJobs = [mockJob];

      queue.getActive.mockResolvedValue(mockJobs);

      const result = await service.getActive();

      expect(result).toEqual(mockJobs);
      expect(queue.getActive).toHaveBeenCalled();
    });
  });

  describe('getCompleted', () => {
    it('should retrieve completed jobs', async () => {
      const mockJobs = [mockJob, { ...mockJob, id: 'job-125' } as Job];

      queue.getCompleted.mockResolvedValue(mockJobs);

      const result = await service.getCompleted();

      expect(result).toEqual(mockJobs);
      expect(queue.getCompleted).toHaveBeenCalled();
    });
  });

  describe('getFailed', () => {
    it('should retrieve failed jobs', async () => {
      const mockJobs = [mockJob];

      queue.getFailed.mockResolvedValue(mockJobs);

      const result = await service.getFailed();

      expect(result).toEqual(mockJobs);
      expect(queue.getFailed).toHaveBeenCalled();
    });
  });

  describe('getDelayed', () => {
    it('should retrieve delayed jobs', async () => {
      const mockJobs = [mockJob];

      queue.getDelayed.mockResolvedValue(mockJobs);

      const result = await service.getDelayed();

      expect(result).toEqual(mockJobs);
      expect(queue.getDelayed).toHaveBeenCalled();
    });
  });

  describe('getCounts', () => {
    it('should retrieve job counts', async () => {
      const mockCounts = {
        active: 2,
        completed: 100,
        delayed: 1,
        failed: 3,
        paused: 0,
        waiting: 5,
      };

      queue.getJobCounts.mockResolvedValue(mockCounts);

      const result = await service.getCounts();

      expect(result).toEqual(mockCounts);
      expect(queue.getJobCounts).toHaveBeenCalled();
    });

    it('should handle zero counts', async () => {
      const mockCounts = {
        active: 0,
        completed: 0,
        delayed: 0,
        failed: 0,
        paused: 0,
        waiting: 0,
      };

      queue.getJobCounts.mockResolvedValue(mockCounts);

      const result = await service.getCounts();

      expect(result).toEqual(mockCounts);
    });
  });
});
