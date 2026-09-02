import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateTrainingDto } from '@api/collections/trainings/dto/create-training.dto';
import { TrainingsQueryDto } from '@api/collections/trainings/dto/trainings-query.dto';
import type { UpdateTrainingDto } from '@api/collections/trainings/dto/update-training.dto';
import type { TrainingEntity } from '@api/collections/trainings/entities/training.entity';
import type { TrainingDocument } from '@api/collections/trainings/schemas/training.schema';
import type { TrainingSourceImage } from '@api/collections/trainings/services/trainings.service';
import { TrainingsService } from '@api/collections/trainings/services/trainings.service';
import { Credits } from '@api/helpers/decorators/credits/credits.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { TrainingAccessGuard } from '@api/helpers/guards/training-access/training-access.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { customLabels } from '@api/helpers/utils/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import type { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import { MODEL_KEYS } from '@genfeedai/constants';
import {
  ActivitySource,
  IngredientStatus,
  TrainingStage,
} from '@genfeedai/enums';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/interfaces';
import { TrainingSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@AutoSwagger()
@ApiTags('trainings')
@ApiBearerAuth()
@Controller('trainings')
@UseGuards(RolesGuard)
@UseInterceptors(CreditsInterceptor)
export class TrainingsController extends BaseCRUDController<
  TrainingDocument,
  CreateTrainingDto,
  UpdateTrainingDto,
  TrainingsQueryDto
> {
  constructor(
    public readonly trainingsService: TrainingsService,
    public readonly loggerService: LoggerService,
    private readonly websocketService: NotificationsPublisherService,
  ) {
    super(loggerService, trainingsService, TrainingSerializer, 'Training');
  }

  /**
   * Maps studio/app-level status vocabulary to the Training `stage` enum.
   *
   * Training has NO `status` column — the schema uses `stage: TrainingStage`
   * with values PENDING | UPLOADING | TRAINING | READY | FAILED | CANCELLED.
   *
   * The studio sends lowercase app-vocab values (e.g. ?status=completed).
   * `completed` → READY and `processing` → TRAINING are confirmed product
   * semantics (2026-08-08): READY is the terminal success stage and
   * `processing` means the training stage specifically.
   */
  private static readonly STATUS_TO_STAGE: Record<string, TrainingStage> = {
    cancelled: TrainingStage.CANCELLED,
    completed: TrainingStage.READY,
    failed: TrainingStage.FAILED,
    pending: TrainingStage.PENDING,
    processing: TrainingStage.TRAINING,
    ready: TrainingStage.READY,
    training: TrainingStage.TRAINING,
    uploading: TrainingStage.UPLOADING,
  };

  /**
   * Override buildFindAllQuery to support both user and organization filtering
   */
  public buildFindAllQuery(user: User, query: TrainingsQueryDto) {
    const adminFilter = CollectionFilterUtil.buildAdminFilter(user, query);

    // Build ownership OR conditions (used when adminFilter is null)
    const ownershipOr = [
      { userId: user.userId ?? user.id },
      { brandId: user.brandId },
      {
        brandId: null,
        organizationId: user.organizationId,
      },
    ];

    const where: Record<string, unknown> = {
      ...(adminFilter ?? { OR: ownershipOr }),
      isDeleted: query.isDeleted ?? false,
    };

    // Map app-vocab status values to the TrainingStage enum; drop unknowns.
    if (query.status && query.status.length > 0) {
      const mappedStages = [
        ...new Set(
          query.status
            .map((s) => TrainingsController.STATUS_TO_STAGE[s.toLowerCase()])
            .filter(Boolean),
        ),
      ];

      if (mappedStages.length === 1) {
        where.stage = mappedStages[0];
      } else if (mappedStages.length > 1) {
        where.stage = { in: mappedStages };
      }
      // If all values were unknown, no stage filter is applied.
    }

    return {
      orderBy: handleQuerySort(query.sort),
      where,
    };
  }

  /**
   * Override findOne to add virtual fields (totalSources, totalGeneratedImages)
   */
  @Get(':trainingId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findOne(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('trainingId') trainingId: string,
  ): Promise<JsonApiSingleResponse> {
    if (!isEntityId(trainingId)) {
      throw new HttpException(
        {
          detail: `Training with ID ${trainingId} not found`,
          title: 'Not found',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    const data = await this.trainingsService.findOne({
      id: trainingId,
      organizationId: user.organizationId,
    });

    if (!data) {
      throw new HttpException(
        {
          detail: `Training with ID ${trainingId} not found`,
          title: 'Not found',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    return serializeSingle(request, this.serializer, data);
  }

  /**
   * Explicit findAll to bind TrainingsQueryDto at runtime and avoid validation issues
   */
  @Get()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: TrainingsQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const aggregate = this.buildFindAllQuery(user, query);

    const data: AggregatePaginateResult<TrainingDocument> =
      await this.trainingsService.findAll(aggregate, options);
    return serializeCollection(request, TrainingSerializer, data);
  }

  /**
   * Override canUserModifyEntity to check both user and organization ownership
   */
  public canUserModifyEntity(user: User, entity: unknown): boolean {
    const entityRecord = entity as {
      userId?: string | null;
      organizationId?: string | null;
    };

    const entityUserId = entityRecord.userId;
    if (entityUserId === (user.userId ?? user.id)) {
      return true;
    }

    const entityOrgId = entityRecord.organizationId;
    if (entityOrgId && entityOrgId === user.organizationId) {
      return true;
    }

    return false;
  }

  /**
   * Relaunch training with the same configuration
   */

  /**
   * Override create method to handle training creation, archive generation, and Replicate submission
   */
  @Post()
  @UseGuards(SubscriptionGuard, TrainingAccessGuard, CreditsGuard)
  @Credits({
    description: 'Model training',
    modelKey: MODEL_KEYS.REPLICATE_FAST_FLUX_TRAINER,
    source: ActivitySource.MODELS_TRAINING,
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createDto: CreateTrainingDto,
  ): Promise<JsonApiSingleResponse> {
    try {
      const { sourceImages, training } =
        await this.trainingsService.createTrainingWithSources(createDto, user);

      // Return training immediately to avoid timeout
      const response = serializeSingle(request, TrainingSerializer, training);

      // Process and launch training asynchronously in the background
      setImmediate(() => {
        this.processAndLaunchTrainingAsync(
          training as unknown as TrainingEntity,
          sourceImages,
        ).catch((error) => {
          this.loggerService.error(
            'Failed to process and launch training asynchronously',
            error,
          );
        });
      });

      return response;
    } catch (error: unknown) {
      throw new HttpException(
        {
          detail: (error as Error)?.message ?? 'Unknown error occurred',
          title: 'Failed to create training',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Prepare images, create training zip and trigger replicate asynchronously
   */
  private async processAndLaunchTrainingAsync(
    training: TrainingEntity,
    sourceImages: TrainingSourceImage[],
  ): Promise<void> {
    let uploadedUrl: string;
    try {
      const minimal = sourceImages.map((img) => ({
        id: img.id,
        metadata: { extension: img.metadata?.extension ?? '' },
      }));

      uploadedUrl = await this.trainingsService.createTrainingZip(
        training.id.toString(),
        minimal,
      );
    } catch (error: unknown) {
      await this.trainingsService.patch(training.id, {
        stage: TrainingStage.FAILED,
      });
      this.loggerService.error('Failed to create training zip', error);

      // Emit WebSocket event for training failure
      await this.websocketService.publishTrainingStatus(
        training.id.toString(),
        IngredientStatus.FAILED,
        training.userId,
        {
          error:
            error instanceof Error
              ? error.message
              : 'Failed to prepare training images',
          training,
        },
      );
      return;
    }

    try {
      await this.trainingsService.launchTraining(training, uploadedUrl);
    } catch (error: unknown) {
      await this.trainingsService.patch(training.id, {
        stage: TrainingStage.FAILED,
      });
      this.loggerService.error('Failed to launch training', error);

      // Emit WebSocket event for training failure
      await this.websocketService.publishTrainingStatus(
        training.id.toString(),
        IngredientStatus.FAILED,
        training.userId,
        {
          error:
            error instanceof Error
              ? error.message
              : 'Failed to launch training',
          training,
        },
      );
    }
  }
}
