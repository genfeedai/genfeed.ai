import { BrandsService } from '@api/collections/brands/services/brands.service';
import { toBrandGenerationReferences } from '@api/collections/brands/utils/brand-kit-generation-references.util';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { type PersonaDocument } from '@api/collections/personas/schemas/persona.schema';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import type {
  SystemWorkflowActionRequest,
  SystemWorkflowRunnerService,
} from '@api/collections/workflows/system-workflow-runner.service';
import { SYSTEM_WORKFLOW_RUNNER } from '@api/collections/workflows/workflows.tokens';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { buildContentPipelineWorkflowDefinition } from '@api/services/content-orchestration/content-pipeline-workflow-definition';
import type {
  PipelineConfigV2,
  PipelineResultV2,
  PipelineStep,
  PublishMode,
  StepOutcome,
  StepResult,
} from '@api/services/content-orchestration/pipeline.interfaces';
import { StepExecutorService } from '@api/services/content-orchestration/step-executor.service';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { PersonaPublisherService } from '@api/services/persona-content/persona-publisher.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import {
  FileInputType,
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
  PostCategory,
} from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { SentryTraced } from '@sentry/nestjs';

/** Input compiled into an immutable workflow graph. */
export type PipelineConfig = PipelineConfigV2;

type WorkflowStepOutcome = StepOutcome & { timingMs: number };

@Injectable()
export class ContentOrchestrationService implements OnModuleInit {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    private readonly brandsService: BrandsService,
    private readonly personasService: PersonasService,
    private readonly personaPublisherService: PersonaPublisherService,
    private readonly sharedService: SharedService,
    private readonly filesClientService: FilesClientService,
    private readonly ingredientsService: IngredientsService,
    private readonly metadataService: MetadataService,
    private readonly stepExecutorService: StepExecutorService,
    @Inject(SYSTEM_WORKFLOW_RUNNER)
    private readonly systemWorkflowRunner: SystemWorkflowRunnerService,
  ) {}

  /**
   * Register this service's workflow actions once the engine adapter exists.
   * Registration cannot run in the constructor: the runner resolves the
   * engine adapter lazily through `ModuleRef`, and during the provider
   * instantiation phase that lookup still returns `null`.
   */
  onModuleInit(): void {
    this.registerWorkflowActions();
  }

  /**
   * Validate step sequences before execution.
   */
  validateSteps(steps: PipelineStep[]): void {
    if (!steps || steps.length === 0) {
      throw new Error('query must have at least one step');
    }

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];

      if (step.type === 'text-to-image' && i > 0) {
        throw new Error(
          `text-to-image step must be the first step (found at index ${i})`,
        );
      }

      if (step.type === 'image-to-video') {
        const hasPrecedingImage =
          i > 0 && steps[i - 1].type === 'text-to-image';
        if (i === 0 && !step.imageUrl) {
          throw new Error(
            'image-to-video as first step requires an explicit imageUrl',
          );
        }
        if (i > 0 && !hasPrecedingImage && !step.imageUrl) {
          throw new Error(
            `image-to-video at step ${i} requires a preceding text-to-image step or an explicit imageUrl`,
          );
        }
      }
    }
  }

  /**
   * Compile and execute a persisted workflow graph. This service no longer
   * traverses product steps itself; each step resolves through one registered
   * action node in the shared workflow engine.
   */
  @SentryTraced()
  async generateAndPublish(config: PipelineConfig): Promise<PipelineResultV2> {
    this.loggerService.log(`${this.constructorName} starting workflow`, {
      personaId: config.personaId,
      publishMode: config.publishMode ?? 'final',
      stepCount: config.steps.length,
    });

    this.validateSteps(config.steps);
    const definition = buildContentPipelineWorkflowDefinition(config);
    const { result } =
      await this.systemWorkflowRunner.runDefinition<PipelineResultV2>(
        definition,
        {
          actionType: 'content-pipeline',
          canonicalId: definition.canonicalId,
          organizationId: config.organizationId,
          source: 'content-pipeline',
          userId: config.userId,
        },
      );
    return result;
  }

  private registerWorkflowActions(): void {
    const generationActions = [
      ['content.pipeline.generate-image', 'text-to-image'],
      ['content.pipeline.generate-music', 'text-to-music'],
      ['content.pipeline.generate-speech', 'text-to-speech'],
      ['content.pipeline.generate-video', 'image-to-video'],
    ] as const;

    for (const [actionId, stepType] of generationActions) {
      this.systemWorkflowRunner.registerAction(actionId, (request) =>
        this.executeGenerationAction(request, stepType),
      );
    }
    this.systemWorkflowRunner.registerAction(
      'content.pipeline.publish',
      (request) => this.executePublishAction(request),
    );
    this.systemWorkflowRunner.registerAction(
      'content.pipeline.resolve-context',
      (request) => this.executeContextAction(request),
    );
  }

  private async executeContextAction(
    request: SystemWorkflowActionRequest,
  ): Promise<{
    hasCredentials: boolean;
    runReferences: PipelineConfig['runReferences'];
  }> {
    const input = this.normalizeActionInput(request.input);
    const personaId = this.requireString(input.personaId, 'personaId');
    const brandId = this.requireString(input.brandId, 'brandId');
    const publishMode = this.readPublishMode(input.publishMode);
    const persona =
      publishMode === 'none'
        ? undefined
        : await this.getPersonaOrFail(
            personaId,
            request.context.organizationId,
          );
    const configuredReferences = Array.isArray(input.runReferences)
      ? (input.runReferences as PipelineConfig['runReferences'])
      : undefined;
    return {
      hasCredentials:
        Array.isArray(persona?.credentials) && persona.credentials.length > 0,
      runReferences:
        configuredReferences ??
        (await this.resolveRunReferences(
          brandId,
          request.context.organizationId,
        )),
    };
  }

  private async executeGenerationAction(
    request: SystemWorkflowActionRequest,
    expectedType: PipelineStep['type'],
  ): Promise<WorkflowStepOutcome> {
    const input = this.normalizeActionInput(request.input);
    const step = this.requirePipelineStep(input.step, expectedType);
    const stepIndex = this.requireNumber(input.stepIndex, 'stepIndex');
    const brandId = this.requireString(input.brandId, 'brandId');
    const startedAt = Date.now();
    const previousResult = this.readPreviousStepResult(input.previousOutcome);
    const pipelineContext = this.readRecord(input.pipelineContext);
    const runReferences = Array.isArray(pipelineContext.runReferences)
      ? (pipelineContext.runReferences as PipelineConfig['runReferences'])
      : undefined;
    const globalPrompt = this.optionalString(input.prompt);

    const result = await Sentry.startSpan(
      {
        attributes: {
          'pipeline.persona_id': this.requireString(
            input.personaId,
            'personaId',
          ),
          'pipeline.step.index': stepIndex,
          'pipeline.step.model': step.model,
          'pipeline.step.type': step.type,
        },
        name: `content.pipeline.step.${step.type}`,
      },
      () =>
        this.stepExecutorService.execute(step, {
          globalPrompt,
          organizationId: request.context.organizationId,
          previousResult,
          runReferences,
        }),
    );
    const ingredientId = await this.persistGeneratedResult(
      result,
      brandId,
      request.context.organizationId,
      request.context.userId,
    );

    return {
      ingredientId,
      result,
      step,
      stepIndex,
      timingMs: Date.now() - startedAt,
    };
  }

  private async persistGeneratedResult(
    result: StepResult,
    brandId: string,
    organizationId: string,
    userId: string,
  ): Promise<string> {
    const category = this.contentTypeToCategory(result.contentType);
    const extension = this.contentTypeToExtension(result.contentType);
    const { ingredientData, metadataData } =
      await this.sharedService.createMediaDocumentsInternal({
        brandId,
        category,
        extension,
        organizationId,
        status: IngredientStatus.PROCESSING,
        userId,
      });
    const s3Meta = await this.filesClientService.uploadToS3(
      ingredientData.id,
      category === IngredientCategory.VIDEO
        ? 'videos'
        : category === IngredientCategory.IMAGE
          ? 'images'
          : 'audio',
      { type: FileInputType.URL, url: result.url },
    );

    await this.metadataService.patch(metadataData.id, {
      ...(s3Meta.duration != null ? { duration: s3Meta.duration } : {}),
      ...(s3Meta.height != null ? { height: s3Meta.height } : {}),
      ...(s3Meta.size != null ? { size: s3Meta.size } : {}),
      ...(s3Meta.width != null ? { width: s3Meta.width } : {}),
    });
    await this.ingredientsService.patch(ingredientData.id, {
      status: IngredientStatus.UPLOADED,
    });
    return ingredientData.id.toString();
  }

  private async executePublishAction(
    request: SystemWorkflowActionRequest,
  ): Promise<PipelineResultV2> {
    const startedAt = Date.now();
    const input = this.normalizeActionInput(request.input);
    const outcomes = Object.entries(input)
      .filter(([key]) => key.startsWith('stepOutcome'))
      .sort(([left], [right]) =>
        left.localeCompare(right, undefined, {
          numeric: true,
        }),
      )
      .map(([, value]) => this.requireStepOutcome(value));
    if (outcomes.length === 0) {
      throw new Error('Content pipeline publish action requires step outcomes');
    }

    const publishMode = this.readPublishMode(input.publishMode);
    let postIds: string[] = [];
    if (publishMode !== 'none') {
      const personaId = this.requireString(input.personaId, 'personaId');
      const pipelineContext = this.readRecord(input.pipelineContext);
      if (pipelineContext.hasCredentials === true) {
        const allIngredientIds = outcomes.map((outcome) =>
          this.requireString(outcome.ingredientId, 'ingredientId'),
        );
        const ingredientIds =
          publishMode === 'final'
            ? [
                this.requireString(
                  allIngredientIds.at(-1),
                  'final ingredientId',
                ),
              ]
            : allIngredientIds;
        const scheduledDate = this.optionalString(input.scheduledDate);
        const publishResult = await Sentry.startSpan(
          {
            attributes: {
              'pipeline.ingredient_count': ingredientIds.length,
              'pipeline.persona_id': personaId,
              'pipeline.publish_mode': publishMode,
            },
            name: 'content.pipeline.publish',
          },
          () =>
            this.personaPublisherService.publishToAll({
              brandId: this.requireString(input.brandId, 'brandId'),
              category: PostCategory.POST,
              description: this.optionalString(input.prompt) ?? '',
              ingredientIds,
              organizationId: request.context.organizationId,
              personaId,
              platforms: this.readStringArray(input.platforms),
              scheduledDate: scheduledDate
                ? new Date(scheduledDate)
                : undefined,
              userId: request.context.userId,
            }),
        );
        postIds = publishResult.postIds;
      }
    }

    return {
      postIds,
      status: 'completed',
      steps: outcomes.map(({ timingMs: _timingMs, ...outcome }) => outcome),
      timings: {
        stepTimingsMs: outcomes.map((outcome) => outcome.timingMs),
        totalMs:
          outcomes.reduce((total, outcome) => total + outcome.timingMs, 0) +
          (Date.now() - startedAt),
      },
    };
  }

  private requirePipelineStep(
    value: unknown,
    expectedType: PipelineStep['type'],
  ): PipelineStep {
    const step = this.readRecord(value);
    if (step.type !== expectedType || typeof step.model !== 'string') {
      throw new Error(
        `Content pipeline action requires a ${expectedType} step`,
      );
    }
    return step as unknown as PipelineStep;
  }

  private requireStepOutcome(value: unknown): WorkflowStepOutcome {
    const outcome = this.readRecord(value);
    const result = this.readRecord(outcome.result);
    if (
      typeof outcome.ingredientId !== 'string' ||
      typeof outcome.stepIndex !== 'number' ||
      typeof outcome.timingMs !== 'number' ||
      typeof result.contentType !== 'string' ||
      typeof result.url !== 'string'
    ) {
      throw new Error(
        'Content pipeline publish action received invalid output',
      );
    }
    return outcome as unknown as WorkflowStepOutcome;
  }

  private readPreviousStepResult(value: unknown): StepResult | undefined {
    if (value === undefined) {
      return undefined;
    }
    return this.requireStepOutcome(value).result;
  }

  private readPublishMode(value: unknown): PublishMode {
    if (value === undefined || value === 'final') {
      return 'final';
    }
    if (value === 'all' || value === 'none') {
      return value;
    }
    throw new Error('Content pipeline publishMode must be all, final, or none');
  }

  private readRecord(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private normalizeActionInput(
    value: Record<string, unknown>,
  ): Record<string, unknown> {
    const request = this.readRecord(value.request);
    const { request: _request, ...direct } = value;
    return { ...request, ...direct };
  }

  private readStringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) {
      return undefined;
    }
    const values = value.filter(
      (entry): entry is string => typeof entry === 'string',
    );
    return values.length > 0 ? values : undefined;
  }

  private requireNumber(value: unknown, field: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`Content pipeline action requires ${field}`);
    }
    return value;
  }

  private requireString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`Content pipeline action requires ${field}`);
    }
    return value;
  }

  private optionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private contentTypeToCategory(contentType: string): IngredientCategory {
    if (contentType.startsWith('video/')) return IngredientCategory.VIDEO;
    if (contentType.startsWith('audio/')) return IngredientCategory.AUDIO;
    return IngredientCategory.IMAGE;
  }

  private contentTypeToExtension(contentType: string): MetadataExtension {
    switch (contentType) {
      case 'video/mp4':
        return MetadataExtension.MP4;
      case 'audio/mpeg':
        return MetadataExtension.MP3;
      case 'image/png':
        return MetadataExtension.PNG;
      case 'image/jpeg':
        return MetadataExtension.JPG;
      default:
        return MetadataExtension.PNG;
    }
  }

  private async getPersonaOrFail(
    personaId: string,
    organizationId: string,
  ): Promise<PersonaDocument> {
    const persona = await this.personasService.findOne({
      id: personaId,
      isDeleted: false,
      organizationId: organizationId,
    });

    if (!persona) {
      throw new NotFoundException('Persona');
    }

    return persona;
  }

  private async resolveRunReferences(
    brandId: string,
    organizationId: string,
  ): Promise<PipelineConfig['runReferences']> {
    const brandKit = await this.brandsService.resolveBrandKitAssets(
      brandId,
      organizationId,
    );
    return toBrandGenerationReferences(brandKit);
  }
}
