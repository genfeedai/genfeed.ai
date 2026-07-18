import { ClipFactoryQueueService } from '@api/queues/clip-factory/clip-factory-queue.service';
import {
  CLIP_FACTORY_QUEUE,
  ClipFactoryJobData,
} from '@genfeedai/queue-contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { getQueueToken } from '@nestjs/bullmq';
import { BadRequestException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const makeJobData = (
  overrides: Partial<ClipFactoryJobData> = {},
): ClipFactoryJobData => ({
  avatarId: 'avatar-1',
  avatarProvider: 'heygen' as never,
  language: 'en',
  maxClips: 3,
  minViralityScore: 0.8,
  mode: 'avatar',
  orgId: 'org-456',
  projectId: 'project-xyz',
  userId: 'user-2',
  voiceId: 'voice-1',
  youtubeUrl: 'https://youtube.com/watch?v=factory-test',
  ...overrides,
});

describe('ClipFactoryQueueService', () => {
  let service: ClipFactoryQueueService;
  let queue: {
    add: ReturnType<typeof vi.fn>;
  };
  let logger: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    queue = {
      add: vi.fn().mockResolvedValue({ id: 'clip-factory-project-xyz' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClipFactoryQueueService,
        {
          provide: getQueueToken(CLIP_FACTORY_QUEUE),
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

    service = module.get<ClipFactoryQueueService>(ClipFactoryQueueService);
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
        'clip-factory-run',
        jobData,
        expect.objectContaining({
          jobId: 'clip-factory-project-xyz',
        }),
      );
    });

    it('should return the job id', async () => {
      const jobData = makeJobData();
      const result = await service.enqueue(jobData);

      expect(result).toBe('clip-factory-project-xyz');
    });

    it('should return projectId as fallback when job.id is undefined', async () => {
      queue.add.mockResolvedValue({ id: undefined });

      const jobData = makeJobData({ projectId: 'fallback-project' });
      const result = await service.enqueue(jobData);

      expect(result).toBe('fallback-project');
    });

    it('should use projectId for deterministic jobId', async () => {
      const jobData = makeJobData({ projectId: 'custom-project-42' });
      queue.add.mockResolvedValue({ id: 'clip-factory-custom-project-42' });

      await service.enqueue(jobData);

      expect(queue.add).toHaveBeenCalledWith(
        'clip-factory-run',
        jobData,
        expect.objectContaining({
          jobId: 'clip-factory-custom-project-42',
        }),
      );
    });

    it('should log enqueue details including projectId and youtubeUrl', async () => {
      const jobData = makeJobData();

      await service.enqueue(jobData);

      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('enqueued'),
        expect.objectContaining({
          projectId: 'project-xyz',
          youtubeUrl: 'https://youtube.com/watch?v=factory-test',
        }),
      );
    });

    it('should propagate queue errors', async () => {
      queue.add.mockRejectedValue(new Error('Redis connection lost'));

      await expect(service.enqueue(makeJobData())).rejects.toThrow(
        'Redis connection lost',
      );
    });

    it('should pass all job data fields through to queue', async () => {
      const jobData = makeJobData({
        avatarId: 'custom-avatar',
        voiceId: 'custom-voice',
      });

      await service.enqueue(jobData);

      expect(queue.add).toHaveBeenCalledWith(
        'clip-factory-run',
        expect.objectContaining({
          avatarId: 'custom-avatar',
          voiceId: 'custom-voice',
        }),
        expect.any(Object),
      );
    });

    it('should queue raw-cut jobs without avatar credentials', async () => {
      const jobData = makeJobData({
        avatarId: undefined,
        avatarProvider: undefined,
        mode: 'raw-cut',
        voiceId: undefined,
      });

      await service.enqueue(jobData);

      expect(queue.add).toHaveBeenCalledWith(
        'clip-factory-run',
        jobData,
        expect.any(Object),
      );
    });

    it('should reject avatar jobs without avatar credentials', async () => {
      await expect(
        service.enqueue(
          makeJobData({
            avatarId: undefined,
            mode: 'avatar',
            voiceId: undefined,
          }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(queue.add).not.toHaveBeenCalled();
    });

    it('should reject unknown generation modes before queueing', async () => {
      await expect(
        service.enqueue(makeJobData({ mode: 'unknown' as never })),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(queue.add).not.toHaveBeenCalled();
    });

    it.each([
      'did',
      'tavus',
      'musetalk',
    ] as const)('should reject unsupported avatar provider %s before queueing', async (avatarProvider) => {
      await expect(
        service.enqueue(
          makeJobData({ avatarProvider: avatarProvider as never }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(queue.add).not.toHaveBeenCalled();
    });
  });
});
