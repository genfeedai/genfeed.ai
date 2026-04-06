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
import { TrainingFilterUtil } from '@api/helpers/utils/training-filter/training-filter.util';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import type { AggregatePaginateResult } from '@api/types/mongoose-aggregate-paginate-v2';
import type { User } from '@clerk/backend';
import {
  ActivitySource,
  IngredientCategory,
  IngredientStatus,
  ModelKey,
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
import { type PipelineStage, Types } from 'mongoose';

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
    super(loggerService, trainingsService, TrainingSerializer, Training.name);
  }

  /**
   * Build virtual fields pipeline stages (totalSources, totalGeneratedImages)
   * Shared between findAll and findOne
   */
  private buildVirtualFieldsStages(): PipelineStage[] {
    return [
      {
        $lookup: {
          as: 'metadataWithModel',
          from: 'metadata',
          let: { trainingModel: '$model' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$model', '$$trainingModel'] },
              },
            },
          ],
        },
      },
      TrainingFilterUtil.buildSourceImagesLookup({
        as: 'sourceImages',
        category: IngredientCategory.SOURCE,
        sourceIdsVar: '$sources',
        userIdVar: '$user',
      }),
      TrainingFilterUtil.buildGeneratedImagesLookup({
        as: 'generatedImages',
        metadataIdsVar: '$metadataWithModel._id',
      }),
      {
        $addFields: {
          totalGeneratedImages: {
            $size: { $ifNull: ['$generatedImages', []] },
          },
          totalSources: { $size: { $ifNull: ['$sourceImages', []] } },
        },
      },
      {
        $project: {
          generatedImages: 0,
          metadataWithModel: 0,
          sourceImages: 0,
        },
      },
    ];
  }

  /**
   * Override buildFindAllPipeline to support both user and organization filtering
   */
  public buildFindAllPipeline(
    user: User,
    query: TrainingsQueryDto,
  ): PipelineStage[] {
    const publicMetadata = getPublicMetadata(user);
    const adminFilter = CollectionFilterUtil.buildAdminFilter(
      publicMetadata,
      query,
    );

    // Build ownership $or conditions (used when adminFilter is null)
    const ownershipOr = [
      { user: new Types.ObjectId(publicMetadata.user) },
      { brand: new Types.ObjectId(publicMetadata.brand) },
      {
        brand: null,
        organization: new Types.ObjectId(publicMetadata.organization),
      },
    ];

    const pipeline: PipelineStage[] = [
      {
        $match: {
          ...(adminFilter ?? { $or: ownershipOr }),
          isDeleted: query.isDeleted ?? false,
        },
      },
      ...this.buildVirtualFieldsStages(),
    ];

    const statusFilter = CollectionFilterUtil.buildStatusFilter(query.status);
    if (Object.keys(statusFilter).length > 0) {
      const matchStage = pipeline[0] as { $match: Record<string, unknown> };
      Object.assign(matchStage.$match, statusFilter);
    }

    pipeline.push({
      $sort: handleQuerySort(query.sort),
    });

    return pipeline;
  }

  /**
   * Build pipeline for findOne with virtual fields
   */
  public buildFindOnePipeline(id: string): PipelineStage[] {
    return [
      { $match: { _id: new Types.ObjectId(id) } },
      ...this.buildVirtualFieldsStages(),
    ];
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
    if (!Types.ObjectId.isValid(trainingId)) {
      throw new HttpException(
        {
          detail: `Training with ID ${trainingId} not found`,
          title: 'Not found',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    const pipeline = this.buildFindOnePipeline(trainingId);
    const result = await this.trainingsService.findAll(pipeline, {
      pagination: false,
    });
    const data = result.docs?.[0];

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

    const aggregate = this.buildFindAllPipeline(user, query);

    const data: AggregatePaginateResult<TrainingDocument> =
      await this.trainingsService.findAll(aggregate, options);
    return serializeCollection(request, TrainingSerializer, data);
  }

  /**
   * Override canUserModifyEntity to check both user and organization ownership
   */
  public canUserModifyEntity(user: User, entity: unknown): boolean {
    const publicMetadata = getPublicMetadata(user);

    const entityUserId =
      entity.user?._id?.toString() || entity.user?.toString();
    if (entityUserId === publicMetadata.user) {
      return true;
    }

    const entityOrgId =
      entity.organization?._id?.toString() || entity.organization?.toString();
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
    modelKey: ModelKey.REPLICATE_FAST_FLUX_TRAINER,
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

      const sourceIds = sources.map((source) => new Types.ObjectId(source));

      const sourceResult = await this.ingredientsService.findAll(
        [
          {
            $match: {
              _id: {
                $in: sourceIds,
              },
              $or: [
                { user: new Types.ObjectId(publicMetadata.user) },
                {
                  organization: new Types.ObjectId(publicMetadata.organization),
                },
              ],
              category: IngredientCategory.IMAGE,
            },
          },
          {
            $lookup: {
              as: 'metadata',
              foreignField: '_id',
              from: 'metadata',
              localField: 'metadata',
            },
          },
          {
            $unwind: {
              path: '$metadata',
              preserveNullAndEmptyArrays: false,
            },
          },
        ],
        {
          pagination: false,
        },
      );

      const sourceImages = sourceResult.docs || [];

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
            key: { $regex: `^${ModelKey.REPLICATE_FAST_FLUX_TRAINER}` },
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

      const training = await this.trainingsService.create(
        new TrainingEntity({
          brand: publicMetadata.brand
            ? new Types.ObjectId(publicMetadata.brand)
            : undefined,
          category: createDto.category || 'subject',
          description: createDto.description || '',
          label: createDto.label || 'Custom Model',
          model:
            resolvedModel || this.configService.get('REPLICATE_MODELS_TRAINER'),
          organization: new Types.ObjectId(publicMetadata.organization),
          provider: createDto.provider || 'replicate',
          seed: createDto.seed ? Number(createDto.seed) : -1,
          sources: sourceImages.map((img: { _id: unknown }) => img._id),
          status: IngredientStatus.PROCESSING,
          steps: createDto.steps ? Number(createDto.steps) : 1000,
          trigger: createDto.trigger || 'TOK',
          user: new Types.ObjectId(publicMetadata.user),
        }),
      );

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
          // @ts-expect-error TS2345
          this.ingredientsService.patch(img._id, {
            category: IngredientCategory.SOURCE,
            training: training._id as Types.ObjectId,
          }),
        ),
      );

      // Return training immediately to avoid timeout
      const response = serializeSingle(request, TrainingSerializer, training);

      // Process and launch training asynchronously in the background
      setImmediate(() => {
        this.processAndLaunchTrainingAsync(
          training as unknown as TrainingEntity,
          // @ts-expect-error TS2345
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
    sourceImages: { id: string; metadata: { extension: string } }[],
  ): Promise<void> {
    let uploadedUrl: string;
    try {
      const minimal = sourceImages.map((img) => ({
        id: img.id,
        metadata: { extension: img.metadata?.extension },
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
