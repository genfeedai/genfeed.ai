import { type BaseJob, BaseJobService } from '@libs/jobs/base-job.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

vi.mock('@libs/utils/caller/caller.util', () => ({
  CallerUtil: { getCallerName: vi.fn().mockReturnValue('test-caller') },
}));

/** Minimal concrete subtype for testing. */
interface TestJob extends BaseJob {
  resultUrl?: string;
}

/** Concrete injectable subclass for DI in tests. */
@Injectable()
class TestJobService extends BaseJobService<TestJob> {}

describe('BaseJobService', () => {
  let service: TestJobService;
  let logger: {
    log: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [TestJobService, { provide: LoggerService, useValue: logger }],
    }).compile();

    service = module.get(TestJobService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createJob', () => {
    it('creates a job with queued status', async () => {
      const job = await service.createJob({
        params: { prompt: 'test' },
        type: 'gen',
      });
      expect(job.status).toBe('queued');
    });

    it('assigns a UUID to new jobs', async () => {
      const job = await service.createJob({ params: {}, type: 'gen' });
      expect(job.jobId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('assigns unique IDs across multiple jobs', async () => {
      const j1 = await service.createJob({ params: {}, type: 'gen' });
      const j2 = await service.createJob({ params: {}, type: 'gen' });
      expect(j1.jobId).not.toBe(j2.jobId);
    });

    it('stores provided params in the job', async () => {
      const params = { model: 'sdxl', steps: 30 };
      const job = await service.createJob({ params, type: 'gen' });
      expect(job.params).toEqual(params);
    });

    it('sets createdAt as a valid ISO timestamp', async () => {
      const job = await service.createJob({ params: {}, type: 'gen' });
      expect(() => new Date(job.createdAt)).not.toThrow();
      expect(new Date(job.createdAt).toISOString()).toBe(job.createdAt);
    });

    it('logs job creation', async () => {
      await service.createJob({ params: {}, type: 'gen' });
      expect(logger.log).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ message: 'Job created' }),
      );
    });
  });

  describe('getJob', () => {
    it('retrieves a job by its id', async () => {
      const created = await service.createJob({ params: {}, type: 'gen' });
      const retrieved = await service.getJob(created.jobId);
      expect(retrieved).toEqual(created);
    });

    it('returns null for unknown job id', async () => {
      const result = await service.getJob('non-existent-id');
      expect(result).toBeNull();
    });
  });

  describe('updateJob', () => {
    it('updates a job status to processing', async () => {
      const job = await service.createJob({ params: {}, type: 'gen' });
      const updated = await service.updateJob(job.jobId, {
        status: 'processing',
      });
      expect(updated?.status).toBe('processing');
    });

    it('returns null when updating a non-existent job', async () => {
      const result = await service.updateJob('missing-id', {
        status: 'completed',
      });
      expect(result).toBeNull();
    });

    it('merges partial updates without replacing unchanged fields', async () => {
      const params = { model: 'flux' };
      const job = await service.createJob({ params, type: 'gen' });
      const updated = await service.updateJob(job.jobId, {
        status: 'completed',
      });
      expect(updated?.params).toEqual(params);
      expect(updated?.type).toBe('gen');
    });

    it('allows setting domain-specific optional fields', async () => {
      const job = await service.createJob({ params: {}, type: 'gen' });
      const updated = await service.updateJob(job.jobId, {
        resultUrl: 'https://cdn.example.com/result.jpg',
        status: 'completed',
      });
      expect(updated?.resultUrl).toBe('https://cdn.example.com/result.jpg');
    });
  });

  describe('getStats', () => {
    it('returns zero counts when no jobs exist', () => {
      const stats = service.getStats();
      expect(stats).toEqual({
        active: 0,
        completed: 0,
        failed: 0,
        queued: 0,
        total: 0,
      });
    });

    it('counts queued jobs correctly', async () => {
      await service.createJob({ params: {}, type: 'gen' });
      await service.createJob({ params: {}, type: 'gen' });
      const stats = service.getStats();
      expect(stats.queued).toBe(2);
      expect(stats.total).toBe(2);
    });

    it('counts jobs across all statuses', async () => {
      const j1 = await service.createJob({ params: {}, type: 'gen' });
      const j2 = await service.createJob({ params: {}, type: 'gen' });
      const j3 = await service.createJob({ params: {}, type: 'gen' });
      const j4 = await service.createJob({ params: {}, type: 'gen' });
      await service.updateJob(j1.jobId, { status: 'processing' });
      await service.updateJob(j2.jobId, { status: 'completed' });
      await service.updateJob(j3.jobId, { status: 'failed' });
      const stats = service.getStats();
      expect(stats.active).toBe(1);
      expect(stats.completed).toBe(1);
      expect(stats.failed).toBe(1);
      expect(stats.queued).toBe(1);
      expect(stats.total).toBe(4);
    });
  });
});
