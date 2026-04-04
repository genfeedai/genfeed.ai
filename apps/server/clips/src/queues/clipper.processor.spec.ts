import { ClipperPipelineService } from '@clips/services/clipper-pipeline.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Job } from 'bullmq';
import { ClipperProcessor } from './clipper.processor';
import { CLIPPER_JOB_TYPES } from './clipper-queue.constants';

vi.mock('@clips/services/clipper-pipeline.service');
vi.mock('@libs/logger/logger.service');

describe('ClipperProcessor', () => {
  let processor: ClipperProcessor;
  let clipperPipeline: {
    startPipeline: ReturnType<typeof vi.fn>;
    retryPipeline: ReturnType<typeof vi.fn>;
  };
  let logger: {
    log: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  const makeJob = (
    name: string,
    data = { organizationId: 'org-1', projectId: 'proj-1', userId: 'user-1' },
  ): Job =>
    ({
      data,
      id: 'job-123',
      name,
    }) as unknown as Job;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClipperProcessor,
        {
          provide: ClipperPipelineService,
          useValue: {
            retryPipeline: vi.fn().mockResolvedValue(undefined),
            startPipeline: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    }).compile();

    processor = module.get(ClipperProcessor);
    clipperPipeline = module.get(ClipperPipelineService);
    logger = module.get(LoggerService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('process()', () => {
    it('calls startPipeline for PROCESS_PROJECT job type', async () => {
      const job = makeJob(CLIPPER_JOB_TYPES.PROCESS_PROJECT);
      await processor.process(job);
      expect(clipperPipeline.startPipeline).toHaveBeenCalledWith('proj-1');
      expect(clipperPipeline.retryPipeline).not.toHaveBeenCalled();
    });

    it('calls retryPipeline for RETRY_PROJECT job type', async () => {
      const job = makeJob(CLIPPER_JOB_TYPES.RETRY_PROJECT);
      await processor.process(job);
      expect(clipperPipeline.retryPipeline).toHaveBeenCalledWith('proj-1');
      expect(clipperPipeline.startPipeline).not.toHaveBeenCalled();
    });

    it('logs start of job processing', async () => {
      const job = makeJob(CLIPPER_JOB_TYPES.PROCESS_PROJECT);
      await processor.process(job);
      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('Processing job job-123'),
      );
    });

    it('logs successful completion', async () => {
      const job = makeJob(CLIPPER_JOB_TYPES.PROCESS_PROJECT);
      await processor.process(job);
      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('completed successfully'),
      );
    });

    it('throws and logs error for unknown job type', async () => {
      const job = makeJob('unknown-type');
      await expect(processor.process(job)).rejects.toThrow(
        'Unknown clipper job type: unknown-type',
      );
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('failed'),
        expect.any(Error),
      );
    });

    it('rethrows pipeline errors', async () => {
      const pipelineError = new Error('ffmpeg failed');
      clipperPipeline.startPipeline.mockRejectedValue(pipelineError);
      const job = makeJob(CLIPPER_JOB_TYPES.PROCESS_PROJECT);
      await expect(processor.process(job)).rejects.toThrow('ffmpeg failed');
    });

    it('logs error details on failure', async () => {
      const pipelineError = new Error('disk full');
      clipperPipeline.retryPipeline.mockRejectedValue(pipelineError);
      const job = makeJob(CLIPPER_JOB_TYPES.RETRY_PROJECT);
      await expect(processor.process(job)).rejects.toThrow();
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('job-123'),
        pipelineError,
      );
    });

    it('passes projectId from job data to pipeline', async () => {
      const job = makeJob(CLIPPER_JOB_TYPES.PROCESS_PROJECT, {
        organizationId: 'org-def',
        projectId: 'project-xyz',
        userId: 'user-abc',
      });
      await processor.process(job);
      expect(clipperPipeline.startPipeline).toHaveBeenCalledWith('project-xyz');
    });
  });
});
