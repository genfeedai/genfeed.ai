import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { CreateTrainingDto } from '@api/collections/trainings/dto/create-training.dto';
import { TrainingsQueryDto } from '@api/collections/trainings/dto/trainings-query.dto';
import { UpdateTrainingDto } from '@api/collections/trainings/dto/update-training.dto';
import { TrainingEntity } from '@api/collections/trainings/entities/training.entity';
import {
  Training,
  type TrainingDocument,
} from '@api/collections/trainings/schemas/training.schema';
import { TrainingsService } from '@api/collections/trainings/services/trainings.service';
import { ConfigService } from '@api/config/config.service';
import { Credits } from '@api/helpers/decorators/credits/credits.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import type { User } from '@clerk/backend';
import { MODEL_KEYS } from '@genfeedai/constants';
import {
  ActivitySource,
  IngredientCategory,
  IngredientStatus,
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

interface TrainingSourceImage {
  _id: string;
  id: string;
  metadata: {
    extension?: string;
  };
}

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
    private readonly configService: ConfigService,

    public readonly trainingsService: TrainingsService,
    public readonly loggerService: LoggerService,
    private readonly ingredientsService: IngredientsService,
    private readonly modelsService: ModelsService,
    private readonly websocketService: NotificationsPublisherService,
  ) {
    super(loggerService, trainingsService, TrainingSerializer, 'Training');
  }

  /**
   * Override buildFindAllQuery to support both user and organization filtering
   */
  public buildFindAllQuery(user: User, query: TrainingsQueryDto) {
    const publicMetadata = getPublicMetadata(user);
    const adminFilter = CollectionFilterUtil.buildAdminFilter(
      publicMetadata,
      query,
    );

    // Build ownership OR conditions (used when adminFilter is null)
    const ownershipOr = [
      { user: publicMetadata.user },
      { brand: publicMetadata.brand },
      {
        brand: null,
        organization: publicMetadata.organization,
      },
    ];

    const where: Record<string, unknown> = {
      ...(adminFilter ?? { OR: ownershipOr }),
      isDeleted: query.isDeleted ?? false,
    };

    const statusFilter = CollectionFilterUtil.buildStatusFilter(query.status);
    if (Object.keys(statusFilter).length > 0) {
      Object.assign(where, statusFilter);
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
    @CurrentUser() _user: User,
    @Param('trainingId') trainingId: string,
  ): Promise<JsonApiSingleResponse> {
    if (!/^[0-9a-f]{24}$/i.test(trainingId)) {
      throw new HttpException(
        {
          detail: `Training with ID ${trainingId} not found`,
          title: 'Not found',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    const data = await this.trainingsService.findOne({ _id: trainingId });

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
    const publicMetadata = getPublicMetadata(user);
    const entityRecord = entity as {
      user?: { _id?: { toString?: () => string } } | string | null;
      organization?: { _id?: { toString?: () => string } } | string | null;
    };

    const entityUserId =
      (typeof entityRecord.user === 'object' && entityRecord.user !== null
        ? entityRecord.user._id?.toString?.()
        : undefined) ||
      (typeof entityRecord.user === 'string' ? entityRecord.user : undefined);
    if (entityUserId === publicMetadata.user) {
      return true;
    }

    const entityOrgId =
      (typeof entityRecord.organization === 'object' &&
      entityRecord.organization !== null
        ? entityRecord.organization._id?.toString?.()
        : undefined) ||
      (typeof entityRecord.organization === 'string'
        ? entityRecord.organization
        : undefined);
    if (entityOrgId && entityOrgId === publicMetadata.organization) {
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
  @UseGuards(SubscriptionGuard, CreditsGuard)
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
      const publicMetadata = getPublicMetadata(user);

      const sources = createDto.sources || [];

      if (sources.length < 10) {
        throw new HttpException(
          {
            detail: 'At least 10 sources are required for training',
            title: 'Validation failed',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      const sourceIds = sources.map((source) => source);

      const sourceResult = await this.ingredientsService.findAll(
        {
          where: {
            _id: {
              in: sourceIds,
            },
            OR: [
              { user: publicMetadata.user },
              {
                organization: publicMetadata.organization,
              },
            ],
            category: IngredientCategory.IMAGE,
          },
        },
        {
          pagination: false,
        },
      );

      const sourceImages = (
        (sourceResult.docs as TrainingSourceImage[]) ?? []
      ).map((image) => ({
        _id: image._id,
        id: image.id ?? image._id,
        metadata: image.metadata ?? {},
      }));

      if (sourceImages.length < 10) {
        throw new HttpException(
          {
            detail: 'Could not find all specified sources',
            title: 'Validation failed',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      let resolvedModel: string | undefined = createDto.model;
      if (!resolvedModel) {
        try {
          const defaultTrainer = await this.modelsService.findOne({
            isDefault: true,
            key: { contains: `^${MODEL_KEYS.REPLICATE_FAST_FLUX_TRAINER}` },
            provider: 'replicate',
          });
          resolvedModel = defaultTrainer?.key;
        } catch (error: unknown) {
          this.loggerService.error(
            'Failed to find default trainer model',
            error,
          );
        }
      }

      const training = await this.trainingsService.create({
        brandId: publicMetadata.brand ?? null,
        config: {
          category: createDto.category || 'subject',
          model:
            resolvedModel || this.configService.get('REPLICATE_MODELS_TRAINER'),
          provider: createDto.provider || 'replicate',
          seed: createDto.seed ? Number(createDto.seed) : -1,
          status: IngredientStatus.PROCESSING,
          steps: createDto.steps ? Number(createDto.steps) : 1000,
          trigger: createDto.trigger || 'TOK',
        },
        description: createDto.description || '',
        label: createDto.label || 'Custom Model',
        organizationId: publicMetadata.organization,
        sources: {
          connect: sourceImages.map((img) => ({ id: img.id })),
        },
        userId: publicMetadata.user,
      } as unknown as Parameters<TrainingsService['create']>[0]);

      if (!training) {
        throw new HttpException(
          {
            detail: 'Failed to create training',
            title: 'Failed to create training',
          },
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      await Promise.all(
        sourceImages.map((img) =>
          this.ingredientsService.patch(img._id, {
            category: IngredientCategory.SOURCE,
            training: training._id as string,
          }),
        ),
      );

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
        training._id.toString(),
        minimal,
      );
    } catch (error: unknown) {
      await this.trainingsService.patch(training._id, {
        status: IngredientStatus.FAILED,
      });
      this.loggerService.error('Failed to create training zip', error);

      // Emit WebSocket event for training failure
      await this.websocketService.publishTrainingStatus(
        training._id.toString(),
        IngredientStatus.FAILED,
        training.user?.toString() || 'unknown',
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
      await this.trainingsService.patch(training._id, {
        status: IngredientStatus.FAILED,
      });
      this.loggerService.error('Failed to launch training', error);

      // Emit WebSocket event for training failure
      await this.websocketService.publishTrainingStatus(
        training._id.toString(),
        IngredientStatus.FAILED,
        training.user?.toString() || 'unknown',
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
