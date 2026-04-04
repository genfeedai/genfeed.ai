import type { ClipAnalyzeJobData } from '@api/queues/clip-analyze/clip-analyze.constants';
import { CLIP_ANALYZE_QUEUE } from '@api/queues/clip-analyze/clip-analyze.constants';
import { ClipAnalyzeQueueService } from '@api/queues/clip-analyze/clip-analyze.queue.service';
import { LoggerService } from '@libs/logger/logger.service';
import { getQueueToken } from '@nestjs/bullmq';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const makeJobData = (
  overrides: Partial<ClipAnalyzeJobData> = {},
): ClipAnalyzeJobData => ({
  language: 'en',
  maxClips: 5,
  minViralityScore: 0.7,
  orgId: 'org-123',
  projectId: 'project-abc',
  userId: 'user-1',
  youtubeUrl: 'https://youtube.com/watch?v=test',
  ...overrides,
});

describe('ClipAnalyzeQueueService', () => {
  let service: ClipAnalyzeQueueService;
  let queue: {
    add: ReturnType<typeof vi.fn>;
  };
  let logger: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    queue = {
      add: vi.fn().mockResolvedValue({ id: 'clip-analyze-project-abc' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClipAnalyzeQueueService,
        {
          provide: getQueueToken(CLIP_ANALYZE_QUEUE),
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

    service = module.get<ClipAnalyzeQueueService>(ClipAnalyzeQueueService);
    logger = module.get(LoggerService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('enqueue', () => {
    it('should add job to queue with correct job name and data', async () => {
      const jobData = makeJobData();

      await service.enqueue(jobData);

      expect(queue.add).toHaveBeenCalledWith(
        'clip-analyze-run',
        jobData,
        expect.objectContaining({
          jobId: 'clip-analyze-project-abc',
        }),
      );
    });

    it('should return the job id', async () => {
      const jobData = makeJobData();
      const result = await service.enqueue(jobData);

      expect(result).toBe('clip-analyze-project-abc');
    });

    it('should return projectId as fallback when job.id is undefined', async () => {
      queue.add.mockResolvedValue({ id: undefined });

      const jobData = makeJobData({ projectId: 'fallback-project' });
      const result = await service.enqueue(jobData);

      expect(result).toBe('fallback-project');
    });

    it('should use projectId for deterministic jobId', async () => {
      const jobData = makeJobData({ projectId: 'custom-project-99' });
      queue.add.mockResolvedValue({ id: 'clip-analyze-custom-project-99' });

      await service.enqueue(jobData);

      expect(queue.add).toHaveBeenCalledWith(
        'clip-analyze-run',
        jobData,
        expect.objectContaining({
          jobId: 'clip-analyze-custom-project-99',
        }),
      );
    });

    it('should log enqueue details', async () => {
      const jobData = makeJobData();

      await service.enqueue(jobData);

      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('enqueued'),
        expect.objectContaining({
          projectId: 'project-abc',
          youtubeUrl: 'https://youtube.com/watch?v=test',
        }),
      );
    });

    it('should propagate queue errors', async () => {
      queue.add.mockRejectedValue(new Error('Redis down'));

      await expect(service.enqueue(makeJobData())).rejects.toThrow(
        'Redis down',
      );
    });
  });
});
