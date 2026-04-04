import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { JobService } from '@videos/services/job.service';

vi.mock('@libs/utils/caller/caller.util', () => ({
  CallerUtil: {
    getCallerName: vi.fn().mockReturnValue('testCaller'),
  },
}));

describe('JobService (videos)', () => {
  let service: JobService;

  const mockLoggerService = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobService,
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    }).compile();

    service = module.get<JobService>(JobService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createJob', () => {
    it('should create a job and return it', async () => {
      const job = await service.createJob({
        params: { url: 'https://example.com/video.mp4' },
        type: 'render',
      });

      expect(job).toBeDefined();
      expect(job.jobId).toBeDefined();
      expect(job.type).toBe('render');
      expect(job.status).toBe('queued');
    });

    it('should assign a unique uuid for each job', async () => {
      const job1 = await service.createJob({ params: {}, type: 'render' });
      const job2 = await service.createJob({ params: {}, type: 'render' });

      expect(job1.jobId).not.toBe(job2.jobId);
    });

    it('should set createdAt as ISO string', async () => {
      const job = await service.createJob({ params: {}, type: 'render' });

      expect(() => new Date(job.createdAt)).not.toThrow();
      expect(new Date(job.createdAt).toISOString()).toBe(job.createdAt);
    });

    it('should store the params', async () => {
      const params = { bitrate: 1080, format: 'mp4' };
      const job = await service.createJob({ params, type: 'encode' });

      expect(job.params).toEqual(params);
    });

    it('should log job creation', async () => {
      await service.createJob({ params: {}, type: 'render' });

      expect(mockLoggerService.log).toHaveBeenCalled();
    });
  });

  describe('getJob', () => {
    it('should return null for unknown job id', async () => {
      const result = await service.getJob('nonexistent-id');
      expect(result).toBeNull();
    });

    it('should return created job by id', async () => {
      const job = await service.createJob({ params: {}, type: 'render' });

      const fetched = await service.getJob(job.jobId);

      expect(fetched).toEqual(job);
    });
  });

  describe('updateJob', () => {
    it('should return null when job does not exist', async () => {
      const result = await service.updateJob('bad-id', {
        status: 'processing',
      });
      expect(result).toBeNull();
    });

    it('should update status of an existing job', async () => {
      const job = await service.createJob({ params: {}, type: 'render' });

      const updated = await service.updateJob(job.jobId, {
        status: 'processing',
      });

      expect(updated?.status).toBe('processing');
    });

    it('should merge updates without losing existing fields', async () => {
      const job = await service.createJob({
        params: { url: 'test.mp4' },
        type: 'render',
      });

      const updated = await service.updateJob(job.jobId, {
        completedAt: '2026-01-01T00:00:00.000Z',
        status: 'completed',
      });

      expect(updated?.type).toBe('render');
      expect(updated?.params).toEqual({ url: 'test.mp4' });
      expect(updated?.status).toBe('completed');
      expect(updated?.completedAt).toBe('2026-01-01T00:00:00.000Z');
    });
  });

  describe('getStats', () => {
    it('should return zeroed stats when no jobs exist', () => {
      const stats = service.getStats();

      expect(stats).toEqual({
        active: 0,
        completed: 0,
        failed: 0,
        queued: 0,
        total: 0,
      });
    });

    it('should count queued jobs', async () => {
      await service.createJob({ params: {}, type: 'render' });
      await service.createJob({ params: {}, type: 'encode' });

      const stats = service.getStats();

      expect(stats.queued).toBe(2);
      expect(stats.total).toBe(2);
    });

    it('should count active (processing) jobs', async () => {
      const job = await service.createJob({ params: {}, type: 'render' });
      await service.updateJob(job.jobId, { status: 'processing' });

      const stats = service.getStats();

      expect(stats.active).toBe(1);
      expect(stats.queued).toBe(0);
    });

    it('should count completed and failed jobs separately', async () => {
      const j1 = await service.createJob({ params: {}, type: 'render' });
      const j2 = await service.createJob({ params: {}, type: 'render' });
      const j3 = await service.createJob({ params: {}, type: 'render' });

      await service.updateJob(j1.jobId, { status: 'completed' });
      await service.updateJob(j2.jobId, { status: 'failed' });

      const stats = service.getStats();

      expect(stats.completed).toBe(1);
      expect(stats.failed).toBe(1);
      expect(stats.queued).toBe(1);
      expect(stats.total).toBe(3);
    });
  });
});
