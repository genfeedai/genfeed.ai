import { ContentOrchestrationService } from '@api/services/content-orchestration/content-orchestration.service';
import { ContentPipelineProcessor } from '@api/services/content-orchestration/content-pipeline.processor';
import { ImageTaskModel } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';

// Mock the BullMQ decorators
vi.mock('@nestjs/bullmq', () => ({
  Processor: () => () => undefined,
  WorkerHost: class {},
}));

describe('ContentPipelineProcessor', () => {
  let processor: ContentPipelineProcessor;
  let mockOrchestrationService: Record<string, ReturnType<typeof vi.fn>>;
  let mockLogger: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    mockOrchestrationService = {
      generateAndPublish: vi.fn().mockResolvedValue({
        postIds: ['p1'],
        status: 'completed',
        steps: [
          {
            step: { model: ImageTaskModel.FAL, type: 'text-to-image' },
            stepIndex: 0,
          },
        ],
      }),
      runBatchForPersona: vi.fn().mockResolvedValue({
        results: [],
        summary: { completed: 1, failed: 0, total: 1 },
      }),
    };

    mockLogger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentPipelineProcessor,
        {
          provide: ContentOrchestrationService,
          useValue: mockOrchestrationService,
        },
        { provide: LoggerService, useValue: mockLogger },
      ],
    }).compile();

    processor = module.get<ContentPipelineProcessor>(ContentPipelineProcessor);
  });

  describe('process', () => {
    it('should handle generate-and-publish jobs', async () => {
      const job = {
        data: {
          config: {
            brandId: new Types.ObjectId().toString(),
            organizationId: new Types.ObjectId().toString(),
            personaId: new Types.ObjectId().toString(),
            prompt: 'Test',
            steps: [
              { model: ImageTaskModel.FAL, type: 'text-to-image' as const },
            ],
            userId: new Types.ObjectId().toString(),
          },
          organizationId: new Types.ObjectId().toString(),
          personaId: new Types.ObjectId().toString(),
          type: 'generate-and-publish' as const,
        },
        name: 'generate-and-publish',
      };

      const result = await processor.process(job as any);

      expect(result).toEqual(expect.objectContaining({ status: 'completed' }));
      expect(mockOrchestrationService.generateAndPublish).toHaveBeenCalledWith(
        job.data.config,
      );
    });

    it('should handle batch-generate jobs', async () => {
      const job = {
        data: {
          config: {
            brandId: new Types.ObjectId().toString(),
            count: 1,
            items: [
              {
                prompt: 'p',
                steps: [
                  { model: ImageTaskModel.FAL, type: 'text-to-image' as const },
                ],
              },
            ],
            organizationId: new Types.ObjectId().toString(),
            personaId: new Types.ObjectId().toString(),
            userId: new Types.ObjectId().toString(),
          },
          organizationId: new Types.ObjectId().toString(),
          personaId: new Types.ObjectId().toString(),
          type: 'batch-generate' as const,
        },
        name: 'batch-generate',
      };

      const result = await processor.process(job as any);

      expect(result).toEqual(
        expect.objectContaining({
          summary: expect.objectContaining({ completed: 1 }),
        }),
      );
    });

    it('should rethrow errors for BullMQ retry', async () => {
      const error = new Error('Processing failed');
      mockOrchestrationService.generateAndPublish.mockRejectedValue(error);

      const job = {
        data: {
          config: {
            steps: [
              { model: ImageTaskModel.FAL, type: 'text-to-image' as const },
            ],
          },
          organizationId: 'org-1',
          personaId: 'p-1',
          type: 'generate-and-publish' as const,
        },
        name: 'generate-and-publish',
      };

      await expect(processor.process(job as any)).rejects.toThrow(
        'Processing failed',
      );
    });

    it('should throw on unknown job type', async () => {
      const job = {
        data: {
          config: {},
          organizationId: 'org-1',
          personaId: 'p-1',
          type: 'unknown' as any,
        },
        name: 'unknown',
      };

      await expect(processor.process(job as any)).rejects.toThrow(
        'Unknown content pipeline job type',
      );
    });
  });
});
