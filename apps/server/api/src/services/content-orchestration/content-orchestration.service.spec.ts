import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import { ContentOrchestrationService } from '@api/services/content-orchestration/content-orchestration.service';
import type { PipelineStep } from '@api/services/content-orchestration/pipeline.interfaces';
import { StepExecutorService } from '@api/services/content-orchestration/step-executor.service';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { PersonaPublisherService } from '@api/services/persona-content/persona-publisher.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import {
  ImageTaskModel,
  IngredientStatus,
  VideoTaskModel,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

vi.mock('@sentry/nestjs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sentry/nestjs')>();
  return {
    ...actual,
    SentryTraced:
      () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
        descriptor,
    startSpan: vi.fn(async (_opts: unknown, fn: (span: unknown) => unknown) =>
      fn(undefined),
    ),
  };
});

describe('ContentOrchestrationService', () => {
  let service: ContentOrchestrationService;
  let mockLogger: Record<string, ReturnType<typeof vi.fn>>;
  let mockPersonasService: Record<string, ReturnType<typeof vi.fn>>;
  let mockPublisherService: Record<string, ReturnType<typeof vi.fn>>;
  let mockSharedService: Record<string, ReturnType<typeof vi.fn>>;
  let mockFilesClientService: Record<string, ReturnType<typeof vi.fn>>;
  let mockIngredientsService: Record<string, ReturnType<typeof vi.fn>>;
  let mockMetadataService: Record<string, ReturnType<typeof vi.fn>>;
  let mockStepExecutorService: Record<string, ReturnType<typeof vi.fn>>;

  const ingredientId = 'test-object-id';
  const metadataId = 'test-object-id';

  const steps: PipelineStep[] = [
    { model: ImageTaskModel.FAL, type: 'text-to-image' },
    {
      duration: 5,
      model: VideoTaskModel.HIGGSFIELD,
      type: 'image-to-video',
    },
  ];

  const baseConfig = {
    brandId: 'test-object-id',
    organizationId: 'test-object-id',
    personaId: 'test-object-id',
    prompt: 'Test prompt',
    steps,
    userId: 'test-object-id',
  };

  const mockPersona = {
    _id: baseConfig.personaId,
    credentials: [{ platform: 'tiktok' }],
    name: 'Test Persona',
  };

  beforeEach(async () => {
    mockLogger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    mockPersonasService = {
      findOne: vi.fn().mockResolvedValue(mockPersona),
    };

    mockStepExecutorService = {
      execute: vi.fn().mockResolvedValue({
        contentType: 'video/mp4',
        url: 'https://example.com/video.mp4',
      }),
    };

    mockPublisherService = {
      publishToAll: vi.fn().mockResolvedValue({
        failedCredentials: [],
        postIds: ['post-1', 'post-2'],
        totalCreated: 2,
      }),
    };

    mockSharedService = {
      saveDocumentsInternal: vi.fn().mockResolvedValue({
        ingredientData: { _id: ingredientId },
        metadataData: { _id: metadataId },
      }),
    };

    mockFilesClientService = {
      uploadToS3: vi.fn().mockResolvedValue({
        duration: 5,
        height: 1920,
        size: 1024000,
        width: 1080,
      }),
    };

    mockIngredientsService = {
      patch: vi.fn().mockResolvedValue({}),
    };

    mockMetadataService = {
      patch: vi.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentOrchestrationService,
        { provide: LoggerService, useValue: mockLogger },
        { provide: PersonasService, useValue: mockPersonasService },
        { provide: PersonaPublisherService, useValue: mockPublisherService },
        { provide: SharedService, useValue: mockSharedService },
        { provide: FilesClientService, useValue: mockFilesClientService },
        { provide: IngredientsService, useValue: mockIngredientsService },
        { provide: MetadataService, useValue: mockMetadataService },
        { provide: StepExecutorService, useValue: mockStepExecutorService },
      ],
    }).compile();

    service = module.get<ContentOrchestrationService>(
      ContentOrchestrationService,
    );
  });

  describe('generateAndPublish', () => {
    it('should complete pipeline successfully', async () => {
      const result = await service.generateAndPublish(baseConfig);

      expect(result.status).toBe('completed');
      expect(result.steps).toHaveLength(2);
      expect(result.postIds).toEqual(['post-1', 'post-2']);
      expect(result.timings).toBeDefined();
      expect(mockStepExecutorService.execute).toHaveBeenCalledTimes(2);
    });

    it('should create ingredient for each step result', async () => {
      await service.generateAndPublish(baseConfig);

      expect(mockSharedService.saveDocumentsInternal).toHaveBeenCalledWith(
        expect.objectContaining({
          status: IngredientStatus.PROCESSING,
        }),
      );
    });

    it('should upload output to S3', async () => {
      await service.generateAndPublish(baseConfig);

      expect(mockFilesClientService.uploadToS3).toHaveBeenCalled();
    });

    it('should update metadata with S3 result', async () => {
      await service.generateAndPublish(baseConfig);

      expect(mockMetadataService.patch).toHaveBeenCalledWith(
        metadataId,
        expect.objectContaining({
          duration: 5,
          height: 1920,
          size: 1024000,
          width: 1080,
        }),
      );
    });

    it('should update ingredient status to UPLOADED', async () => {
      await service.generateAndPublish(baseConfig);

      expect(mockIngredientsService.patch).toHaveBeenCalledWith(ingredientId, {
        status: IngredientStatus.UPLOADED,
      });
    });

    it('should pass ingredientIds in publish input', async () => {
      await service.generateAndPublish(baseConfig);

      expect(mockPublisherService.publishToAll).toHaveBeenCalledWith(
        expect.objectContaining({
          ingredientIds: expect.arrayContaining([ingredientId]),
        }),
      );
    });

    it('should pass platform filters into publisher', async () => {
      await service.generateAndPublish({
        ...baseConfig,
        platforms: ['tiktok'],
      });

      expect(mockPublisherService.publishToAll).toHaveBeenCalledWith(
        expect.objectContaining({
          platforms: ['tiktok'],
        }),
      );
    });

    it('should handle step execution errors', async () => {
      const error = new Error('Step execution failed');
      mockStepExecutorService.execute.mockRejectedValue(error);

      const result = await service.generateAndPublish(baseConfig);

      expect(result.status).toBe('failed');
      expect(result.steps[0].error).toBeDefined();
    });

    it('should throw NotFoundException when persona not found', async () => {
      mockPersonasService.findOne.mockResolvedValue(null);

      await expect(service.generateAndPublish(baseConfig)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should skip publishing when persona has no credentials', async () => {
      mockPersonasService.findOne.mockResolvedValue({
        ...mockPersona,
        credentials: [],
      });

      const result = await service.generateAndPublish(baseConfig);

      expect(result.status).toBe('completed');
      expect(result.postIds).toEqual([]);
      expect(mockPublisherService.publishToAll).not.toHaveBeenCalled();
    });

    it('should handle S3 upload returning partial metadata', async () => {
      mockFilesClientService.uploadToS3.mockResolvedValue({
        size: 500000,
      });

      await service.generateAndPublish(baseConfig);

      expect(mockMetadataService.patch).toHaveBeenCalledWith(metadataId, {
        size: 500000,
      });
    });
  });

  describe('runBatchForPersona', () => {
    it('should process all items and return summary', async () => {
      const batchConfig = {
        brandId: baseConfig.brandId,
        count: 2,
        items: [
          { prompt: 'Prompt 1', steps },
          { prompt: 'Prompt 2', steps },
        ],
        organizationId: baseConfig.organizationId,
        personaId: baseConfig.personaId,
        userId: baseConfig.userId,
      };

      const result = await service.runBatchForPersona(batchConfig);

      expect(result.results).toHaveLength(2);
      expect(result.summary.completed).toBe(2);
      expect(result.summary.failed).toBe(0);
      expect(result.summary.total).toBe(2);
    });

    it('should count failures in batch', async () => {
      mockStepExecutorService.execute.mockRejectedValueOnce(new Error('fail'));

      const batchConfig = {
        brandId: baseConfig.brandId,
        count: 2,
        items: [
          { prompt: 'Prompt 1', steps },
          { prompt: 'Prompt 2', steps },
        ],
        organizationId: baseConfig.organizationId,
        personaId: baseConfig.personaId,
        userId: baseConfig.userId,
      };

      const result = await service.runBatchForPersona(batchConfig);

      expect(result.summary.failed).toBeGreaterThanOrEqual(1);
    });
  });

  describe('validateSteps', () => {
    it('should throw when steps array is empty', () => {
      expect(() => service.validateSteps([])).toThrow(
        'Pipeline must have at least one step',
      );
    });

    it('should throw when text-to-image is not the first step', () => {
      const invalidSteps: PipelineStep[] = [
        {
          duration: 5,
          imageUrl: 'https://example.com/img.jpg',
          model: VideoTaskModel.HIGGSFIELD,
          type: 'image-to-video',
        },
        { model: ImageTaskModel.FAL, type: 'text-to-image' },
      ];

      expect(() => service.validateSteps(invalidSteps)).toThrow(
        'text-to-image step must be the first step',
      );
    });

    it('should throw when image-to-video is first without imageUrl', () => {
      const invalidSteps: PipelineStep[] = [
        {
          duration: 5,
          model: VideoTaskModel.HIGGSFIELD,
          type: 'image-to-video',
        },
      ];

      expect(() => service.validateSteps(invalidSteps)).toThrow(
        'image-to-video as first step requires an explicit imageUrl',
      );
    });

    it('should allow image-to-video as first step with explicit imageUrl', () => {
      const validSteps: PipelineStep[] = [
        {
          duration: 5,
          imageUrl: 'https://example.com/image.jpg',
          model: VideoTaskModel.HIGGSFIELD,
          type: 'image-to-video',
        },
      ];

      expect(() => service.validateSteps(validSteps)).not.toThrow();
    });

    it('should throw when image-to-video follows non-image step without imageUrl', () => {
      const invalidSteps: PipelineStep[] = [
        { model: ImageTaskModel.FAL, type: 'text-to-image' },
        { model: 'elevenlabs' as any, text: 'Hello', type: 'text-to-speech' },
        {
          duration: 5,
          model: VideoTaskModel.HIGGSFIELD,
          type: 'image-to-video',
        },
      ];

      expect(() => service.validateSteps(invalidSteps)).toThrow(
        'image-to-video at step 2 requires a preceding text-to-image step',
      );
    });

    it('should not throw for valid steps', () => {
      expect(() => service.validateSteps(steps)).not.toThrow();
    });
  });

  describe('parseFrequencyToMs', () => {
    it('should parse hourly frequency', () => {
      expect(ContentOrchestrationService.parseFrequencyToMs('hourly')).toBe(
        3_600_000,
      );
    });

    it('should parse twice-daily frequency', () => {
      expect(
        ContentOrchestrationService.parseFrequencyToMs('twice-daily'),
      ).toBe(43_200_000);
    });

    it('should parse daily frequency', () => {
      expect(ContentOrchestrationService.parseFrequencyToMs('daily')).toBe(
        86_400_000,
      );
    });

    it('should parse weekly frequency', () => {
      expect(ContentOrchestrationService.parseFrequencyToMs('weekly')).toBe(
        604_800_000,
      );
    });

    it('should default to daily for unknown frequency', () => {
      expect(ContentOrchestrationService.parseFrequencyToMs('unknown')).toBe(
        86_400_000,
      );
    });

    it('should default to daily when frequency is undefined', () => {
      expect(ContentOrchestrationService.parseFrequencyToMs(undefined)).toBe(
        86_400_000,
      );
    });
  });

  describe('generateAndPublish - publishMode variations', () => {
    it('should publish only final ingredient when publishMode is final', async () => {
      const result = await service.generateAndPublish({
        ...baseConfig,
        publishMode: 'final',
      });

      expect(mockPublisherService.publishToAll).toHaveBeenCalledWith(
        expect.objectContaining({
          ingredientIds: expect.arrayContaining([ingredientId]),
        }),
      );
      expect(mockPublisherService.publishToAll).toHaveBeenCalledTimes(1);
    });

    it('should not publish when publishMode is none', async () => {
      const result = await service.generateAndPublish({
        ...baseConfig,
        publishMode: 'none',
      });

      expect(mockPublisherService.publishToAll).not.toHaveBeenCalled();
      expect(result.postIds).toEqual([]);
    });

    it('should publish all ingredients when publishMode is all', async () => {
      const result = await service.generateAndPublish({
        ...baseConfig,
        publishMode: 'all',
      });

      expect(mockPublisherService.publishToAll).toHaveBeenCalled();
    });

    it('should handle publishing errors gracefully', async () => {
      mockPublisherService.publishToAll.mockRejectedValueOnce(
        new Error('Publishing failed'),
      );

      const result = await service.generateAndPublish(baseConfig);

      expect(result.status).toBe('completed');
      expect(result.postIds).toEqual([]);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('publishing failed'),
        expect.any(Object),
      );
    });
  });

  describe('generateAndPublish - partial completion', () => {
    it('should return partial status when some steps fail', async () => {
      mockStepExecutorService.execute
        .mockResolvedValueOnce({
          contentType: 'image/png',
          url: 'https://example.com/image.png',
        })
        .mockRejectedValueOnce(new Error('Video generation failed'));

      const result = await service.generateAndPublish(baseConfig);

      expect(result.status).toBe('partial');
      expect(result.steps).toHaveLength(2);
      expect(result.steps[0]).not.toHaveProperty('error');
      expect(result.steps[1]).toHaveProperty('error');
    });
  });

  describe('runBatchForPersona - error handling', () => {
    it('should handle pipeline execution errors', async () => {
      mockPersonasService.findOne.mockRejectedValueOnce(
        new Error('Persona service error'),
      );

      const batchConfig = {
        brandId: baseConfig.brandId,
        count: 1,
        items: [{ prompt: 'Prompt 1', steps }],
        organizationId: baseConfig.organizationId,
        personaId: baseConfig.personaId,
        userId: baseConfig.userId,
      };

      const result = await service.runBatchForPersona(batchConfig);

      expect(result.summary.failed).toBe(1);
      expect(result.results[0].status).toBe('failed');
    });
  });

  // ── Sentry Performance Tracing ─────────────────────────────────────────────

  describe('Sentry performance tracing', () => {
    it('generateAndPublish should invoke Sentry.startSpan for each step', async () => {
      const Sentry = await import('@sentry/nestjs');
      const startSpan = Sentry.startSpan as ReturnType<typeof vi.fn>;
      startSpan.mockClear();

      const singleStepConfig = {
        brandId: 'test-object-id',
        organizationId: 'test-object-id',
        personaId: 'test-object-id',
        prompt: 'Sentry tracing test',
        steps: [{ model: 'fal', type: 'text-to-image' as const }],
        userId: 'test-object-id',
      };

      await service.generateAndPublish(singleStepConfig);

      const spanNames = startSpan.mock.calls.map(
        (c: [{ name: string }, unknown]) => c[0].name,
      );
      expect(spanNames).toContain('content.pipeline.step.text-to-image');
    });

    it('generateAndPublish should include publish span when credentials exist', async () => {
      const Sentry = await import('@sentry/nestjs');
      const startSpan = Sentry.startSpan as ReturnType<typeof vi.fn>;
      startSpan.mockClear();

      await service.generateAndPublish({
        brandId: 'test-object-id',
        organizationId: 'test-object-id',
        personaId: 'test-object-id',
        prompt: 'Sentry publish tracing',
        publishMode: 'final',
        steps: [{ model: 'fal', type: 'text-to-image' as const }],
        userId: 'test-object-id',
      });

      const spanNames = startSpan.mock.calls.map(
        (c: [{ name: string }, unknown]) => c[0].name,
      );
      expect(spanNames).toContain('content.pipeline.step.text-to-image');
      expect(spanNames).toContain('content.pipeline.publish');
    });

    it('step span should include pipeline attributes', async () => {
      const Sentry = await import('@sentry/nestjs');
      const startSpan = Sentry.startSpan as ReturnType<typeof vi.fn>;
      startSpan.mockClear();

      await service.generateAndPublish({
        brandId: 'test-object-id',
        organizationId: 'test-object-id',
        personaId: 'test-object-id',
        prompt: 'Attributes test',
        steps: [{ model: 'fal', type: 'text-to-image' as const }],
        userId: 'test-object-id',
      });

      const stepCall = startSpan.mock.calls.find(
        (c: [{ name: string }, unknown]) =>
          c[0].name === 'content.pipeline.step.text-to-image',
      );
      expect(stepCall).toBeDefined();
      expect(stepCall[0].attributes).toMatchObject({
        'pipeline.step.index': 0,
        'pipeline.step.type': 'text-to-image',
      });
    });
  });
});
