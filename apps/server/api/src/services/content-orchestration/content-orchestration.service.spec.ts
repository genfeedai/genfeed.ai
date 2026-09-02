import { BrandsService } from '@api/collections/brands/services/brands.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import type {
  SystemWorkflowActionExecutor,
  SystemWorkflowGraphDefinition,
} from '@api/collections/workflows/system-workflow-runner.service';
import { SYSTEM_WORKFLOW_RUNNER } from '@api/collections/workflows/workflows.tokens';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { ContentOrchestrationService } from '@api/services/content-orchestration/content-orchestration.service';
import type { PipelineStep } from '@api/services/content-orchestration/pipeline.interfaces';
import { StepExecutorService } from '@api/services/content-orchestration/step-executor.service';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { PersonaPublisherService } from '@api/services/persona-content/persona-publisher.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import {
  ImageTaskModel,
  IngredientStatus,
  MusicTaskModel,
  VideoTaskModel,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

vi.mock('@sentry/nestjs', () => ({
  SentryTraced:
    () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
      descriptor,
  startSpan: vi.fn(async (_opts: unknown, fn: (span: unknown) => unknown) =>
    fn(undefined),
  ),
}));

describe('ContentOrchestrationService', () => {
  let service: ContentOrchestrationService;
  let mockLogger: Record<string, ReturnType<typeof vi.fn>>;
  let mockBrandsService: Record<string, ReturnType<typeof vi.fn>>;
  let mockPersonasService: Record<string, ReturnType<typeof vi.fn>>;
  let mockPublisherService: Record<string, ReturnType<typeof vi.fn>>;
  let mockSharedService: Record<string, ReturnType<typeof vi.fn>>;
  let mockFilesClientService: Record<string, ReturnType<typeof vi.fn>>;
  let mockIngredientsService: Record<string, ReturnType<typeof vi.fn>>;
  let mockMetadataService: Record<string, ReturnType<typeof vi.fn>>;
  let mockStepExecutorService: Record<string, ReturnType<typeof vi.fn>>;
  let mockSystemWorkflowRunner: Record<string, ReturnType<typeof vi.fn>>;
  let workflowActionExecutors: Map<string, SystemWorkflowActionExecutor>;

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
    id: baseConfig.personaId,
    credentials: [{ platform: 'tiktok' }],
    name: 'Test Persona',
  };

  beforeEach(async () => {
    workflowActionExecutors = new Map();
    mockSystemWorkflowRunner = {
      registerAction: vi.fn(
        (actionId: string, executor: SystemWorkflowActionExecutor) => {
          workflowActionExecutors.set(actionId, executor);
        },
      ),
      runDefinition: vi.fn(
        async (definition: SystemWorkflowGraphDefinition) => {
          const outputs = new Map<string, unknown>();
          for (const node of definition.definition.nodes ?? []) {
            const actionId = String(node.data.config.actionId);
            const executor = workflowActionExecutors.get(actionId);
            if (!executor) {
              throw new Error(`Missing test action executor ${actionId}`);
            }
            const { parameters } = node.data.config;
            const input: Record<string, unknown> =
              parameters && typeof parameters === 'object'
                ? { ...parameters }
                : {};
            for (const edge of definition.definition.edges ?? []) {
              if (edge.target === node.id) {
                input[edge.targetHandle ?? edge.source] = outputs.get(
                  edge.source,
                );
              }
            }
            outputs.set(
              node.id,
              await executor({
                context: {
                  organizationId: baseConfig.organizationId,
                  runId: 'run-1',
                  userId: baseConfig.userId,
                  workflowId: 'workflow-1',
                  workflowVersionId: 'workflow-version-1',
                },
                input,
                provenance: {
                  executionId: 'execution-1',
                  workflowId: 'workflow-1',
                  workflowLabel: definition.label,
                },
              }),
            );
          }
          return {
            provenance: {
              executionId: 'execution-1',
              workflowId: 'workflow-1',
              workflowLabel: definition.label,
            },
            result: outputs.get(definition.resultNodeId),
          };
        },
      ),
    };

    mockLogger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    mockBrandsService = {
      resolveBrandKitAssets: vi.fn().mockResolvedValue({
        references: [
          {
            id: 'product-reference',
            label: 'Matte black bottle with gold cap',
            referenceCategory: 'PRODUCT',
            role: 'reference',
            url: 'https://cdn.example.com/references/product-reference',
          },
        ],
      }),
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
      createMediaDocumentsInternal: vi.fn().mockResolvedValue({
        ingredientData: { id: ingredientId },
        metadataData: { id: metadataId },
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
        { provide: BrandsService, useValue: mockBrandsService },
        { provide: PersonasService, useValue: mockPersonasService },
        { provide: PersonaPublisherService, useValue: mockPublisherService },
        { provide: SharedService, useValue: mockSharedService },
        { provide: FilesClientService, useValue: mockFilesClientService },
        { provide: IngredientsService, useValue: mockIngredientsService },
        { provide: MetadataService, useValue: mockMetadataService },
        { provide: StepExecutorService, useValue: mockStepExecutorService },
        {
          provide: SYSTEM_WORKFLOW_RUNNER,
          useValue: mockSystemWorkflowRunner,
        },
      ],
    }).compile();

    service = module.get<ContentOrchestrationService>(
      ContentOrchestrationService,
    );
    service.onModuleInit();
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

    it('resolves semantic references once and threads the same set through every step', async () => {
      await service.generateAndPublish(baseConfig);

      expect(mockBrandsService.resolveBrandKitAssets).toHaveBeenCalledOnce();
      const firstReferences =
        mockStepExecutorService.execute.mock.calls[0]?.[1].runReferences;
      const secondReferences =
        mockStepExecutorService.execute.mock.calls[1]?.[1].runReferences;
      expect(firstReferences).toBe(secondReferences);
      expect(firstReferences).toEqual([
        {
          assetId: 'product-reference',
          description: 'Matte black bottle with gold cap',
          role: 'product',
        },
      ]);
    });

    it('should create ingredient for each step result', async () => {
      await service.generateAndPublish(baseConfig);

      expect(
        mockSharedService.createMediaDocumentsInternal,
      ).toHaveBeenCalledWith(
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
          brandId: baseConfig.brandId,
          ingredientIds: expect.arrayContaining([ingredientId]),
          organizationId: baseConfig.organizationId,
          userId: baseConfig.userId,
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

    it('fails the workflow when a step action fails', async () => {
      const error = new Error('Step execution failed');
      mockStepExecutorService.execute.mockRejectedValue(error);

      await expect(service.generateAndPublish(baseConfig)).rejects.toThrow(
        'Step execution failed',
      );
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

  describe('validateSteps', () => {
    it('should throw when steps array is empty', () => {
      expect(() => service.validateSteps([])).toThrow(
        'query must have at least one step',
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
        {
          model: MusicTaskModel.ELEVENLABS,
          text: 'Hello',
          type: 'text-to-speech',
          voiceId: 'voice-1',
        },
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

  describe('generateAndPublish - publishMode variations', () => {
    it('should publish only final ingredient when publishMode is final', async () => {
      await service.generateAndPublish({
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
      await service.generateAndPublish({
        ...baseConfig,
        publishMode: 'all',
      });

      expect(mockPublisherService.publishToAll).toHaveBeenCalled();
    });

    it('fails closed when the publish action fails', async () => {
      mockPublisherService.publishToAll.mockRejectedValueOnce(
        new Error('Publishing failed'),
      );

      await expect(service.generateAndPublish(baseConfig)).rejects.toThrow(
        'Publishing failed',
      );
    });
  });

  describe('generateAndPublish - partial completion', () => {
    it('does not execute downstream actions when a later step fails', async () => {
      mockStepExecutorService.execute
        .mockResolvedValueOnce({
          contentType: 'image/png',
          url: 'https://example.com/image.png',
        })
        .mockRejectedValueOnce(new Error('Video generation failed'));

      await expect(service.generateAndPublish(baseConfig)).rejects.toThrow(
        'Video generation failed',
      );
      expect(mockPublisherService.publishToAll).not.toHaveBeenCalled();
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
