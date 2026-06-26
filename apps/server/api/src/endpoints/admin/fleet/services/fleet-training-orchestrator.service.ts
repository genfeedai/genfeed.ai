import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import { type TrainingDocument } from '@api/collections/trainings/schemas/training.schema';
import { TrainingsService } from '@api/collections/trainings/services/trainings.service';
import { AdminFleetCharacterService } from '@api/endpoints/admin/fleet/services/fleet-character.service';
import { AdminFleetTrainingService } from '@api/endpoints/admin/fleet/services/fleet-training.service';
import { AdminFleetValueReader } from '@api/endpoints/admin/fleet/services/fleet-value-reader.util';
import { ObjectIdUtil } from '@api/helpers/utils/objectid/objectid.util';
import { MODEL_KEYS } from '@genfeedai/constants';
import {
  DarkroomReviewStatus as DarkroomReviewStatusEnum,
  LoraStatus,
  TrainingCategory,
  TrainingProvider,
  TrainingStage,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';

/**
 * Orchestrates fleet training lifecycle: training reads plus kicking off a
 * new LoRA training run. Delegates the GPU/HTTP pipeline mechanics to
 * AdminFleetTrainingService.
 */
@Injectable()
export class AdminFleetTrainingOrchestratorService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly characterService: AdminFleetCharacterService,
    private readonly ingredientsService: IngredientsService,
    private readonly trainingsService: TrainingsService,
    private readonly personasService: PersonasService,
    private readonly adminFleetTrainingService: AdminFleetTrainingService,
    private readonly loggerService: LoggerService,
  ) {}

  /**
   * Get trainings for a persona
   */
  getTrainings(
    organizationId: string,
    personaSlug?: string,
  ): Promise<TrainingDocument[]> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller, { organizationId, personaSlug });

    const filters: Record<string, unknown> = {};
    if (personaSlug) {
      filters.personaSlug = personaSlug;
    }

    return this.trainingsService.findAllByOrganization(organizationId, filters);
  }

  /**
   * Get a single training by ID
   */
  async getTraining(
    trainingId: string,
    organizationId: string,
  ): Promise<TrainingDocument> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller, { organizationId, trainingId });

    const training = await this.trainingsService.findOne({
      _id: trainingId,
      isDeleted: false,
      organization: organizationId,
    });

    if (!training) {
      throw new NotFoundException(`Training "${trainingId}" not found`);
    }

    return training;
  }

  /**
   * Start a new fleet training job.
   * Creates a training record and fires off the pipeline asynchronously.
   */
  @SentryTraced()
  async startTraining(
    organizationId: string,
    userId: string,
    data: {
      personaSlug: string;
      label: string;
      sourceIds: string[];
      steps?: number;
      learningRate?: number;
      loraRank?: number;
      loraName?: string;
      baseModel?: string;
    },
  ): Promise<TrainingDocument> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller, {
      organizationId,
      personaSlug: data.personaSlug,
    });

    // Resolve persona
    const persona = await this.characterService.requirePersonaBySlug(
      data.personaSlug,
      organizationId,
      `Character "${data.personaSlug}" not found`,
    );

    const dataset = await this.adminFleetTrainingService.getDatasetInfo(
      data.personaSlug,
    );
    if (dataset.imageCount === 0) {
      throw new BadRequestException(
        `Dataset for "${data.personaSlug}" is empty. Upload training images before starting LoRA training.`,
      );
    }

    // Auto-tune hyperparameters based on dataset size
    const imageCount =
      AdminFleetValueReader.readNumber(
        (persona as Record<string, unknown>).selectedImagesCount,
      ) ?? 20;
    const autoTuned =
      this.adminFleetTrainingService.autoTuneHyperparameters(imageCount);

    const steps = data.steps ?? autoTuned.steps;
    const loraRank = data.loraRank ?? autoTuned.rank;
    const learningRate = data.learningRate ?? autoTuned.learningRate;
    const baseModel = data.baseModel ?? MODEL_KEYS.GENFEED_AI_Z_IMAGE_TURBO;
    const triggerWord = persona.triggerWord ?? data.personaSlug;
    const loraName = data.loraName ?? `${triggerWord}_zimage`;

    // Create training record
    const sourceIds =
      data.sourceIds.length > 0
        ? data.sourceIds
        : (
            await this.ingredientsService.findAllByOrganization(
              organizationId,
              {
                isDeleted: false,
                persona: persona._id,
                reviewStatus: DarkroomReviewStatusEnum.APPROVED,
              },
            )
          ).map((ingredient) => ingredient._id.toString());

    const training = await this.trainingsService.create({
      baseModel,
      category: TrainingCategory.SUBJECT,
      label: data.label,
      learningRate,
      loraName,
      loraRank,
      model: baseModel,
      organization: ObjectIdUtil.toObjectId(organizationId)!,
      persona: persona._id,
      personaSlug: data.personaSlug,
      progress: 0,
      provider: TrainingProvider.GENFEED_AI,
      sources: sourceIds.map((id) => ObjectIdUtil.toObjectId(id)!),
      stage: TrainingStage.QUEUED,
      steps,
      trigger: triggerWord,
      user: ObjectIdUtil.toObjectId(userId)!,
    } as Parameters<TrainingsService['create']>[0]);

    await this.personasService.patch(persona._id.toString(), {
      loraModelPath: undefined,
      loraStatus: LoraStatus.TRAINING,
    });

    // Fire-and-forget: execute training pipeline asynchronously
    this.adminFleetTrainingService
      .executeTrainingquery({
        baseModel,
        learningRate,
        loraName,
        loraRank,
        organizationId,
        personaSlug: data.personaSlug,
        steps,
        trainingId: training._id.toString(),
        triggerWord,
      })
      .catch((error) => {
        this.loggerService.error(caller, {
          error: error instanceof Error ? error.message : String(error),
          message: 'Training pipeline failed',
          trainingId: training._id.toString(),
        });
      });

    return training;
  }
}
