/**
 * Trainings Operations Controller
 * Handles training operation routes:
 * - Relaunch training
 * - Get training images
 * - Get training sources
 */
import { ImagesQueryDto } from '@api/collections/images/dto/images-query.dto';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { TrainingEntity } from '@api/collections/trainings/entities/training.entity';
import { TrainingsService } from '@api/collections/trainings/services/trainings.service';
import { ConfigService } from '@api/config/config.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import type { User } from '@clerk/backend';
import { IngredientCategory, IngredientStatus } from '@genfeedai/enums';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/interfaces';
import {
  IngredientSerializer,
  TrainingSerializer,
} from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

interface TrainingSourceImage {
  _id: string;
  id: string;
  metadata: {
    extension?: string;
  };
}

@AutoSwagger()
@Controller('trainings')
@UseGuards(RolesGuard)
export class TrainingsOperationsController {
  constructor(
    private readonly configService: ConfigService,
    private readonly ingredientsService: IngredientsService,
    private readonly loggerService: LoggerService,
    private readonly metadataService: MetadataService,
    private readonly trainingsService: TrainingsService,
  ) {}

  @Post(':trainingId/train')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async relaunchTraining(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('trainingId') trainingId: string,
  ): Promise<JsonApiSingleResponse> {
    try {
      const publicMetadata = getPublicMetadata(user);

      const existingTraining = await this.trainingsService.findOne({
        _id: trainingId,
        $or: [
          { user: publicMetadata.user },
          { organization: publicMetadata.organization },
        ],
      });

      if (!existingTraining) {
        throw new HttpException(
          {
            detail: `Training with ID ${trainingId} not found`,
            title: 'Not found',
          },
          HttpStatus.NOT_FOUND,
        );
      }

      if (existingTraining.status === 'processing') {
        throw new HttpException(
          {
            detail: 'Cannot relaunch a training that is already in progress',
            title: 'Training in progress',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      const sourceIds = Array.isArray(existingTraining.sources)
        ? existingTraining.sources
        : [];

      let sourceImages: TrainingSourceImage[] = [];
      if (sourceIds.length > 0) {
        const sourceResult = await this.ingredientsService.findAll(
          [
            {
              $match: {
                _id: {
                  $in: sourceIds.map((sid: unknown) =>
                    typeof sid === 'string' ? sid : sid,
                  ),
                },
                category: IngredientCategory.SOURCE,
                user: publicMetadata.user,
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

        sourceImages = ((sourceResult.docs as TrainingSourceImage[]) ?? []).map(
          (image) => ({
            _id: image._id,
            id: image.id ?? image._id,
            metadata: image.metadata ?? {},
          }),
        );
      }

      if (sourceImages.length < 10) {
        throw new HttpException(
          {
            detail: 'Could not find all source images for relaunching training',
            title: 'Validation failed',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      const newTraining = await this.trainingsService.create({
        brandId: existingTraining.brand ?? publicMetadata.brand ?? null,
        config: {
          category:
            (existingTraining.category as string | undefined) || 'subject',
          model:
            (existingTraining.model as string | undefined) ||
            this.configService.get('REPLICATE_MODELS_TRAINER'),
          provider:
            (existingTraining.provider as string | undefined) || 'replicate',
          seed:
            typeof existingTraining.seed === 'number'
              ? existingTraining.seed
              : -1,
          status: IngredientStatus.PROCESSING,
          steps:
            typeof existingTraining.steps === 'number'
              ? existingTraining.steps
              : 1000,
          trigger: (existingTraining.trigger as string | undefined) || 'TOK',
        },
        description: existingTraining.description || '',
        label: existingTraining.label || 'Custom Model',
        organizationId: publicMetadata.organization,
        sources: {
          connect: sourceImages.map((img) => ({ id: img.id })),
        },
        userId: publicMetadata.user,
      } as unknown as Parameters<TrainingsService['create']>[0]);

      if (!newTraining) {
        throw new HttpException(
          {
            detail: 'Failed to create new training',
            title: 'Failed to create new training',
          },
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      await Promise.all(
        sourceImages.map((img) =>
          this.ingredientsService.patch(img._id, {
            category: IngredientCategory.SOURCE,
            training: newTraining._id as string,
          }),
        ),
      );

      return this.processAndLaunchTraining(
        request,
        newTraining as unknown as TrainingEntity,
        sourceImages,
      );
    } catch (error: unknown) {
      throw new HttpException(
        {
          detail: (error as Error)?.message ?? 'Unknown error occurred',
          title: 'Failed to relaunch training',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':trainingId/images')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getTrainingImages(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('trainingId') trainingId: string,
    @Query() query: ImagesQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    try {
      const publicMetadata = getPublicMetadata(user);

      // Find the training
      const training = await this.trainingsService.findOne({
        _id: trainingId,
        $or: [
          { user: publicMetadata.user },
          { organization: publicMetadata.organization },
        ],
      });

      if (!training) {
        throw new HttpException(
          {
            detail: `Training with ID ${trainingId} not found`,
            title: 'Not found',
          },
          HttpStatus.NOT_FOUND,
        );
      }

      const metadataResult = await this.metadataService.findAll(
        [
          {
            $match: {
              model: training.model,
            },
          },
          {
            $project: {
              _id: 1,
            },
          },
        ],
        {
          pagination: false,
        },
      );

      const metadataIds = (
        (metadataResult.docs as Array<{ _id?: string }> | undefined) ?? []
      )
        .map((meta) => meta._id)
        .filter((metaId): metaId is string => typeof metaId === 'string');

      if (metadataIds.length === 0) {
        return serializeCollection(request, IngredientSerializer, {
          docs: [],
        });
      }

      const imageMatchConditions: Record<string, unknown> = {
        category: IngredientCategory.IMAGE,
        metadata: { $in: metadataIds },
      };

      // NOT NEEDED RIGHT NOW
      // if (query.brand && isValidObjectId(query.brand)) {
      //   imageMatchConditions.brand = query.brand;
      // }

      const data = await this.ingredientsService.findAll(
        [
          {
            $match: imageMatchConditions,
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
          customLabels,
          ...QueryDefaultsUtil.getPaginationDefaults(query),
        },
      );

      return serializeCollection(request, IngredientSerializer, data);
    } catch (error: unknown) {
      throw new HttpException(
        {
          detail: (error as Error)?.message ?? 'Unknown error occurred',
          title: 'Failed to fetch training images',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':trainingId/sources')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getTrainingSources(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('trainingId') trainingId: string,
    @Query() query: BaseQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    try {
      const publicMetadata = getPublicMetadata(user);

      const training = await this.trainingsService.findOne({
        _id: trainingId,
        $or: [
          { user: publicMetadata.user },
          { organization: publicMetadata.organization },
        ],
      });

      if (!training) {
        throw new HttpException(
          {
            detail: `Training with ID ${trainingId} not found`,
            title: 'Not found',
          },
          HttpStatus.NOT_FOUND,
        );
      }

      const sources = Array.isArray(training.sources) ? training.sources : [];

      const sourceResult = await this.ingredientsService.findAll(
        [
          {
            $match: {
              _id: {
                $in: sources,
              },
              category: IngredientCategory.SOURCE,
              isDeleted: false,
              status: IngredientStatus.UPLOADED,
            },
          },
        ],
        {
          customLabels,
          ...QueryDefaultsUtil.getPaginationDefaults(query),
        },
      );

      return serializeCollection(request, IngredientSerializer, {
        docs: sourceResult.docs || [],
      });
    } catch (error: unknown) {
      throw new HttpException(
        {
          detail: (error as Error)?.message ?? 'Unknown error occurred',
          title: 'Failed to fetch training sources',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Prepare images, create training zip and trigger replicate. Returns serialized training
   */
  private async processAndLaunchTraining(
    request: Request,
    training: TrainingEntity,
    sourceImages: TrainingSourceImage[],
  ): Promise<JsonApiSingleResponse> {
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
      await this.trainingsService.patch(training._id, { status: 'failed' });
      this.loggerService.error('Failed to create training zip', error);
      throw new HttpException(
        {
          detail:
            error instanceof Error
              ? error.message
              : 'Failed to prepare training images',
          title: 'Training preparation failed',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.trainingsService.launchTraining(training, uploadedUrl);
    return serializeSingle(request, TrainingSerializer, training);
  }
}
