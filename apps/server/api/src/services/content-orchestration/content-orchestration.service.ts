import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { PersonaDocument } from '@api/collections/personas/schemas/persona.schema';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import type {
  PipelineConfigV2,
  PipelineError,
  PipelineResultV2,
  PipelineRunStatus,
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
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable, NotFoundException } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { SentryTraced } from '@sentry/nestjs';
import { Types } from 'mongoose';

/** Config passed to the queue / processor. Exported as the canonical alias type. */
export type PipelineConfig = PipelineConfigV2;

export interface BatchPipelineConfig {
  personaId: string;
  organizationId: string;
  userId: string;
  brandId: string;
  count: number;
  items: Array<{
    steps: PipelineStep[];
    prompt?: string;
    publishMode?: PublishMode;
    scheduledDate?: Date;
  }>;
  platforms?: string[];
}

@Injectable()
export class ContentOrchestrationService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    private readonly personasService: PersonasService,
    private readonly personaPublisherService: PersonaPublisherService,
    private readonly sharedService: SharedService,
    private readonly filesClientService: FilesClientService,
    private readonly ingredientsService: IngredientsService,
    private readonly metadataService: MetadataService,
    private readonly stepExecutorService: StepExecutorService,
  ) {}

  /**
   * Convert contentStrategy.frequency string to milliseconds.
   */
  static parseFrequencyToMs(frequency?: string): number {
    switch (frequency?.toLowerCase()) {
      case 'hourly':
        return 3_600_000;
      case 'twice-daily':
        return 43_200_000;
      case 'daily':
        return 86_400_000;
      case 'weekly':
        return 604_800_000;
      default:
        return 86_400_000; // default daily
    }
  }

  /**
   * Validate step sequences before execution.
   */
  validateSteps(steps: PipelineStep[]): void {
    if (!steps || steps.length === 0) {
      throw new Error('Pipeline must have at least one step');
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
   * Execute a multi-step content generation pipeline.
   * Each step's output feeds into the next. All generated assets become ingredients.
   */
  @SentryTraced()
  async generateAndPublish(config: PipelineConfig): Promise<PipelineResultV2> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const startTime = Date.now();
    const publishMode: PublishMode = config.publishMode ?? 'final';

    this.loggerService.log(`${caller} starting`, {
      personaId: config.personaId,
      publishMode,
      stepCount: config.steps.length,
    });

    this.validateSteps(config.steps);

    const persona = await this.getPersonaOrFail(
      config.personaId,
      config.organizationId,
    );

    let status: PipelineRunStatus = 'running';
    const stepOutcomes: StepOutcome[] = [];
    const stepTimingsMs: number[] = [];
    let previousResult: StepResult | undefined;
    const allIngredientIds: Types.ObjectId[] = [];

    for (let i = 0; i < config.steps.length; i++) {
      const step = config.steps[i];
      const stepStart = Date.now();

      try {
        const result = await Sentry.startSpan(
          {
            attributes: {
              'pipeline.persona_id': config.personaId,
              'pipeline.step.index': i,
              'pipeline.step.model': step.model ?? 'unknown',
              'pipeline.step.type': step.type,
            },
            name: `content.pipeline.step.${step.type}`,
          },
          () =>
            this.stepExecutorService.execute(step, {
              globalPrompt: config.prompt,
              organizationId: config.organizationId,
              previousResult,
            }),
        );

        stepTimingsMs.push(Date.now() - stepStart);

        const category = this.contentTypeToCategory(result.contentType);
        const extension = this.contentTypeToExtension(result.contentType);

        const { ingredientData, metadataData } =
          await this.sharedService.saveDocumentsInternal({
            brand: new Types.ObjectId(config.brandId),
            category,
            extension,
            organization: new Types.ObjectId(config.organizationId),
            status: IngredientStatus.PROCESSING,
            user: new Types.ObjectId(config.userId),
          });

        const s3Meta = await this.filesClientService.uploadToS3(
          ingredientData._id,
          category === IngredientCategory.VIDEO
            ? 'videos'
            : category === IngredientCategory.IMAGE
              ? 'images'
              : 'audio',
          {
            type: FileInputType.URL,
            url: result.url,
          },
        );

        await this.metadataService.patch(metadataData._id, {
          ...(s3Meta.duration != null ? { duration: s3Meta.duration } : {}),
          ...(s3Meta.height != null ? { height: s3Meta.height } : {}),
          ...(s3Meta.size != null ? { size: s3Meta.size } : {}),
          ...(s3Meta.width != null ? { width: s3Meta.width } : {}),
        });

        await this.ingredientsService.patch(ingredientData._id, {
          status: IngredientStatus.UPLOADED,
        });

        allIngredientIds.push(new Types.ObjectId(ingredientData._id));

        stepOutcomes.push({
          ingredientId: ingredientData._id.toString(),
          result,
          step,
          stepIndex: i,
        });

        previousResult = result;
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : 'Step execution failed';

        stepTimingsMs.push(Date.now() - stepStart);

        const pipelineError: PipelineError = {
          code: 'STEP_EXECUTION_FAILED',
          message: errorMessage,
          provider: step.model,
          retryable: true,
          stage: `step-${i}-${step.type}`,
        };

        stepOutcomes.push({
          error: pipelineError,
          step,
          stepIndex: i,
        });

        status = i > 0 ? 'partial' : 'failed';

        this.loggerService.error(`${caller} step ${i} failed`, {
          error: errorMessage,
          personaId: config.personaId,
          stepType: step.type,
        });

        break;
      }
    }

    if (status === 'running') {
      status = 'completed';
    }

    let postIds: string[] = [];
    if (
      publishMode !== 'none' &&
      allIngredientIds.length > 0 &&
      persona.credentials &&
      persona.credentials.length > 0
    ) {
      try {
        const ingredientIdsToPublish =
          publishMode === 'final'
            ? [allIngredientIds[allIngredientIds.length - 1]]
            : allIngredientIds;

        const publishResult = await Sentry.startSpan(
          {
            attributes: {
              'pipeline.ingredient_count': ingredientIdsToPublish.length,
              'pipeline.persona_id': config.personaId,
              'pipeline.publish_mode': publishMode,
            },
            name: 'content.pipeline.publish',
          },
          () =>
            this.personaPublisherService.publishToAll({
              brand: new Types.ObjectId(config.brandId),
              category: PostCategory.POST,
              description: config.prompt ?? '',
              ingredientIds: ingredientIdsToPublish,
              organization: new Types.ObjectId(config.organizationId),
              personaId: new Types.ObjectId(config.personaId),
              platforms: config.platforms,
              scheduledDate: config.scheduledDate,
              user: new Types.ObjectId(config.userId),
            }),
        );
        postIds = publishResult.postIds;
      } catch (error: unknown) {
        this.loggerService.error(`${caller} publishing failed`, { error });
      }
    }

    const totalMs = Date.now() - startTime;

    this.loggerService.log(`${caller} completed`, {
      personaId: config.personaId,
      postCount: postIds.length,
      status,
      totalMs,
    });

    return {
      postIds,
      status,
      steps: stepOutcomes,
      timings: { stepTimingsMs, totalMs },
    };
  }

  /**
   * Run batch pipeline for a persona — generates N content pieces.
   */
  @SentryTraced()
  async runBatchForPersona(config: BatchPipelineConfig): Promise<{
    results: PipelineResultV2[];
    summary: { total: number; completed: number; failed: number };
  }> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    this.loggerService.log(`${caller} starting batch of ${config.count}`, {
      personaId: config.personaId,
    });

    const results: PipelineResultV2[] = [];
    let completed = 0;
    let failed = 0;

    for (const item of config.items) {
      try {
        const result = await this.generateAndPublish({
          brandId: config.brandId,
          organizationId: config.organizationId,
          personaId: config.personaId,
          platforms: config.platforms,
          prompt: item.prompt,
          publishMode: item.publishMode,
          scheduledDate: item.scheduledDate,
          steps: item.steps,
          userId: config.userId,
        });

        results.push(result);

        if (result.status === 'completed') {
          completed++;
        } else {
          failed++;
        }
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : 'Pipeline execution failed';

        this.loggerService.error(
          `${caller} batch item failed: ${errorMessage}`,
          { personaId: config.personaId },
        );

        results.push({
          postIds: [],
          status: 'failed',
          steps: [
            {
              error: {
                code: 'PIPELINE_EXECUTION_FAILED',
                message: errorMessage,
                retryable: true,
                stage: 'pipeline',
              },
              step: item.steps[0],
              stepIndex: 0,
            },
          ],
          timings: { stepTimingsMs: [], totalMs: 0 },
        });

        failed++;
      }
    }

    this.loggerService.log(`${caller} batch completed`, {
      completed,
      failed,
      personaId: config.personaId,
      total: config.count,
    });

    return {
      results,
      summary: { completed, failed, total: config.count },
    };
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
      _id: new Types.ObjectId(personaId),
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    });

    if (!persona) {
      throw new NotFoundException('Persona not found');
    }

    return persona;
  }
}
