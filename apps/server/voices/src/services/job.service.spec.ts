import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { JobService } from '@voices/services/job.service';

describe('JobService', () => {
  let service: JobService;
  let loggerService: {
    log: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    loggerService = {
      error: vi.fn(),
      log: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobService,
        { provide: LoggerService, useValue: loggerService },
      ],
    }).compile();

    service = module.get<JobService>(JobService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createJob', () => {
    it('should create a job with queued status', async () => {
      const job = await service.createJob({ params: {}, type: 'tts' });

      expect(job.status).toBe('queued');
    });

    it('should assign a unique jobId', async () => {
      const job1 = await service.createJob({ params: {}, type: 'tts' });
      const job2 = await service.createJob({ params: {}, type: 'tts' });

      expect(job1.jobId).toBeDefined();
      expect(job2.jobId).toBeDefined();
      expect(job1.jobId).not.toBe(job2.jobId);
    });

    it('should set the job type from params', async () => {
      const job = await service.createJob({ params: {}, type: 'synthesis' });

      expect(job.type).toBe('synthesis');
    });

    it('should store provided params on the job', async () => {
      const params = { text: 'Hello world', voiceId: 'voice-1' };
      const job = await service.createJob({ params, type: 'tts' });

      expect(job.params).toEqual(params);
    });

    it('should set createdAt timestamp', async () => {
      const before = new Date().toISOString();
      const job = await service.createJob({ params: {}, type: 'tts' });
      const after = new Date().toISOString();

      expect(job.createdAt).toBeGreaterThanOrEqual(before);
      expect(job.createdAt).toBeLessThanOrEqual(after);
    });

    it('should log job creation', async () => {
      await service.createJob({ params: {}, type: 'tts' });

      expect(loggerService.log).toHaveBeenCalledTimes(1);
    });
  });

  describe('getJob', () => {
    it('should return an existing job by id', async () => {
      const created = await service.createJob({ params: {}, type: 'tts' });
      const found = await service.getJob(created.jobId);

      expect(found).not.toBeNull();
      expect(found?.jobId).toBe(created.jobId);
    });

    it('should return null for a non-existent job id', async () => {
      const result = await service.getJob('does-not-exist');

      expect(result).toBeNull();
    });
  });

  describe('updateJob', () => {
    it('should update a job status', async () => {
      const created = await service.createJob({ params: {}, type: 'tts' });
      const updated = await service.updateJob(created.jobId, {
        status: 'processing',
      });

      expect(updated?.status).toBe('processing');
    });

    it('should merge partial updates and preserve existing fields', async () => {
      const params = { voiceId: 'voice-1' };
      const created = await service.createJob({ params, type: 'tts' });
      await service.updateJob(created.jobId, { status: 'completed' });
      const job = await service.getJob(created.jobId);

      expect(job?.params).toEqual(params);
      expect(job?.type).toBe('tts');
      expect(job?.status).toBe('completed');
    });

    it('should return null when updating a non-existent job', async () => {
      const result = await service.updateJob('ghost-id', {
        status: 'completed',
      });

      expect(result).toBeNull();
    });

    it('should allow setting videoUrl or audioUrl on the job', async () => {
      const created = await service.createJob({ params: {}, type: 'tts' });
      const updated = await service.updateJob(created.jobId, {
        audioUrl: 'https://cdn.example.com/audio.mp3',
        status: 'completed',
      });

      expect(updated?.audioUrl).toBe('https://cdn.example.com/audio.mp3');
    });
  });

  describe('getStats', () => {
    it('should return zeroes when no jobs exist', () => {
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
      await service.createJob({ params: {}, type: 'tts' });
      await service.createJob({ params: {}, type: 'tts' });

      const stats = service.getStats();

      expect(stats.queued).toBe(2);
      expect(stats.total).toBe(2);
    });

    it('should count processing jobs as active', async () => {
      const job = await service.createJob({ params: {}, type: 'tts' });
      await service.updateJob(job.jobId, { status: 'processing' });

      const stats = service.getStats();

      expect(stats.active).toBe(1);
      expect(stats.queued).toBe(0);
    });

    it('should count completed and failed jobs correctly', async () => {
      const j1 = await service.createJob({ params: {}, type: 'tts' });
      const j2 = await service.createJob({ params: {}, type: 'tts' });
      const j3 = await service.createJob({ params: {}, type: 'tts' });

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
