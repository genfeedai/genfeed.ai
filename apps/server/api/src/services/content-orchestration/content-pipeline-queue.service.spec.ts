import { ContentPipelineQueueService } from '@api/services/content-orchestration/content-pipeline-queue.service';
import { ImageTaskModel } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { getQueueToken } from '@nestjs/bullmq';
import { Test, TestingModule } from '@nestjs/testing';

describe('ContentPipelineQueueService', () => {
  let service: ContentPipelineQueueService;
  let mockQueue: Record<string, ReturnType<typeof vi.fn>>;
  let mockLogger: Record<string, ReturnType<typeof vi.fn>>;

  const orgId = new Types.ObjectId().toString();
  const personaId = new Types.ObjectId().toString();

  beforeEach(async () => {
    mockQueue = {
      add: vi.fn().mockResolvedValue({ id: 'job-123' }),
      getJobs: vi.fn().mockResolvedValue([]),
    };

    mockLogger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentPipelineQueueService,
        { provide: getQueueToken('content-pipeline'), useValue: mockQueue },
        { provide: LoggerService, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<ContentPipelineQueueService>(
      ContentPipelineQueueService,
    );
  });

  describe('queueGenerateAndPublish', () => {
    it('should add job to queue and return job id', async () => {
      const config = {
        brandId: new Types.ObjectId().toString(),
        organizationId: orgId,
        personaId,
        prompt: 'Test',
        steps: [{ model: ImageTaskModel.FAL, type: 'text-to-image' as const }],
        userId: new Types.ObjectId().toString(),
      };

      const result = await service.queueGenerateAndPublish(config);

      expect(result).toBe('job-123');
      expect(mockQueue.add).toHaveBeenCalledWith(
        'generate-and-publish',
        expect.objectContaining({
          personaId,
          type: 'generate-and-publish',
        }),
        {},
      );
    });

    it('should use idempotencyKey as jobId', async () => {
      const config = {
        brandId: new Types.ObjectId().toString(),
        idempotencyKey: 'dedup-123',
        organizationId: orgId,
        personaId,
        prompt: 'Test',
        steps: [{ model: ImageTaskModel.FAL, type: 'text-to-image' as const }],
        userId: new Types.ObjectId().toString(),
      };

      await service.queueGenerateAndPublish(config);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'generate-and-publish',
        expect.anything(),
        { jobId: 'dedup-123' },
      );
    });
  });

  describe('queueBatchGenerate', () => {
    it('should add batch job to queue', async () => {
      const config = {
        brandId: new Types.ObjectId().toString(),
        count: 2,
        items: [
          {
            prompt: 'P1',
            steps: [
              { model: ImageTaskModel.FAL, type: 'text-to-image' as const },
            ],
          },
          {
            prompt: 'P2',
            steps: [
              { model: ImageTaskModel.FAL, type: 'text-to-image' as const },
            ],
          },
        ],
        organizationId: orgId,
        personaId,
        userId: new Types.ObjectId().toString(),
      };

      const result = await service.queueBatchGenerate(config);

      expect(result).toBe('job-123');
      expect(mockQueue.add).toHaveBeenCalledWith(
        'batch-generate',
        expect.objectContaining({ type: 'batch-generate' }),
      );
    });
  });

  describe('getJobsByPersona', () => {
    it('should filter jobs by persona and organization', async () => {
      mockQueue.getJobs.mockResolvedValue([
        {
          data: {
            organizationId: orgId,
            personaId,
            type: 'generate-and-publish',
          },
          id: 'j1',
          returnvalue: { status: 'completed' },
          timestamp: Date.now(),
        },
        {
          data: {
            organizationId: 'other-org',
            personaId,
            type: 'generate-and-publish',
          },
          id: 'j2',
          returnvalue: null,
          timestamp: Date.now(),
        },
      ]);

      const result = await service.getJobsByPersona(personaId, orgId);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('j1');
    });
  });
});
