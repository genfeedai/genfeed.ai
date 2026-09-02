/**
 * Trainings Operations Controller
 * Handles training operation routes:
 * - Relaunch training
 * - Get training images
 * - Get training sources
 */

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ImagesQueryDto } from '@api/collections/images/dto/images-query.dto';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import type { TrainingEntity } from '@api/collections/trainings/entities/training.entity';
import type { TrainingSourceImage } from '@api/collections/trainings/services/trainings.service';
import { TrainingsService } from '@api/collections/trainings/services/trainings.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { CategoryPrismaUtil } from '@api/helpers/utils/category-prisma/category-prisma.util';
import { customLabels } from '@api/helpers/utils/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { IngredientCategory, IngredientStatus } from '@genfeedai/enums';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/interfaces';
import { TrainingStage } from '@genfeedai/prisma';
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

/**
 * Training stages that represent active/in-flight work. Relaunch is blocked
 * while a training sits in any of these. The Prisma `Training.stage` column
 * uses the `TrainingStage` enum — there is NO `status` column.
 */
const IN_PROGRESS_TRAINING_STAGES: readonly TrainingStage[] = [
  TrainingStage.PENDING,
  TrainingStage.UPLOADING,
  TrainingStage.TRAINING,
];

@AutoSwagger()
@Controller('trainings')
@UseGuards(RolesGuard)
export class TrainingsOperationsController {
  constructor(
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
      const existingTraining = await this.trainingsService.findOne({
        id: trainingId,
        OR: [
          { userId: user.userId ?? user.id },
          { organizationId: user.organizationId },
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

      if (
        existingTraining.stage &&
        IN_PROGRESS_TRAINING_STAGES.includes(existingTraining.stage)
      ) {
        throw new HttpException(
          {
            detail: 'Cannot relaunch a training that is already in progress',
            title: 'Training in progress',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      const { sourceImages, training: newTraining } =
        await this.trainingsService.relaunchTrainingWithSources(
          existingTraining,
          user,
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
      // Find the training
      const training = await this.trainingsService.findOne({
        id: trainingId,
        OR: [
          { userId: user.userId ?? user.id },
          { organizationId: user.organizationId },
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
        {
          where: {
            model: training.model,
          },
        },
        {
          pagination: false,
        },
      );

      const metadataIds = (
        (metadataResult.docs as Array<{ id?: string }> | undefined) ?? []
      )
        .map((meta) => meta.id)
        .filter((metaId): metaId is string => typeof metaId === 'string');

      if (metadataIds.length === 0) {
        return serializeCollection(request, IngredientSerializer, {
          docs: [],
        });
      }

      const imageMatchConditions: Record<string, unknown> = {
        category: CategoryPrismaUtil.toIngredientCategory(
          IngredientCategory.IMAGE,
        ),
        metadataId: { in: metadataIds },
      };

      const data = await this.ingredientsService.findAll(
        { where: imageMatchConditions },
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
      const training = await this.trainingsService.findOne({
        id: trainingId,
        OR: [
          { userId: user.userId ?? user.id },
          { organizationId: user.organizationId },
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
        {
          where: {
            id: {
              in: sources,
            },
            category: CategoryPrismaUtil.toIngredientCategory(
              IngredientCategory.SOURCE,
            ),
            isDeleted: false,
            status: IngredientStatus.UPLOADED,
          },
        },
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
        training.id.toString(),
        minimal,
      );
    } catch (error: unknown) {
      await this.trainingsService.patch(training.id, {
        stage: TrainingStage.FAILED,
      });
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
