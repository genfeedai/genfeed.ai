import { ActivityEntity } from '@api/collections/activities/entities/activity.entity';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { AssetsService } from '@api/collections/assets/services/assets.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { PromptEntity } from '@api/collections/prompts/entities/prompt.entity';
import { PromptsService } from '@api/collections/prompts/services/prompts.service';
import {
  BatchInterpolationDto,
  InterpolationPairDto,
} from '@api/collections/videos/dto/batch-interpolation.dto';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { ConfigService } from '@api/config/config.service';
import { Credits } from '@api/helpers/decorators/credits/credits.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { buildReferenceImageUrls } from '@api/helpers/utils/reference/reference.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { FailedGenerationService } from '@api/shared/services/failed-generation/failed-generation.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import type { User } from '@clerk/backend';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
  IngredientCategory,
  IngredientFormat,
  IngredientStatus,
  MemberRole,
  MetadataExtension,
  ModelCategory,
  PromptCategory,
  PromptStatus,
} from '@genfeedai/enums';
import { BatchInterpolationSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
  Req,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('videos')
@UseGuards(RolesGuard, SubscriptionGuard, CreditsGuard)
export class BatchInterpolationController {
  constructor(
    private readonly activitiesService: ActivitiesService,
    private readonly assetsService: AssetsService,
    private readonly brandsService: BrandsService,
    private readonly configService: ConfigService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly failedGenerationService: FailedGenerationService,
    readonly _fileQueueService: FileQueueService,
    private readonly ingredientsService: IngredientsService,
    private readonly loggerService: LoggerService,
    private readonly metadataService: MetadataService,
    private readonly modelsService: ModelsService,
    private readonly promptsService: PromptsService,
    private readonly promptBuilderService: PromptBuilderService,
    private readonly replicateService: ReplicateService,
    private readonly sharedService: SharedService,
    private readonly videosService: VideosService,
    private readonly websocketService: NotificationsPublisherService,
  ) {}

  @Post('interpolation')
  @SetMetadata('roles', [
    'superadmin',
    MemberRole.OWNER,
    MemberRole.ADMIN,
    MemberRole.CREATOR,
  ])
  @Credits({
    description: 'Batch interpolation video generation',
    source: ActivitySource.VIDEO_GENERATION,
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async createBatchInterpolation(
    @Req() req: Request,
    @Body() dto: BatchInterpolationDto,
    @CurrentUser() user: User,
  ) {
    const publicMetadata = getPublicMetadata(user);

    // Generate group ID to link all videos together
    const groupId = '507f191e810c19729de860ee'.toString();

    // Validate model exists and supports interpolation
    const model = await this.modelsService.findOne({
      isDeleted: false,
      key: dto.modelKey,
    });

    if (!model) {
      throw new HttpException(
        {
          detail: `Model ${dto.modelKey} not found or not available`,
          title: 'Model not found',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    // Get brand for organization context
    const brand = await this.brandsService.findOne({
      _id: publicMetadata.brand,
      isDeleted: false,
      organization: publicMetadata.organization,
    });

    if (!brand) {
      throw new HttpException(
        {
          detail: 'You do not have access to this brand',
          title: 'Brand not found',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    // Build pairs array - add loop pair if isLoopMode is enabled
    const pairs: InterpolationPairDto[] = [...dto.pairs];

    if (dto.isLoopMode && pairs.length >= 2) {
      // Get the last frame's endImageId and first frame's startImageId
      const lastPair = pairs[pairs.length - 1];
      const firstPair = pairs[0];

      // Add loop-back pair: last frame's end → first frame's start
      pairs.push({
        endImageId: firstPair.startImageId,
        prompt: dto.cameraPrompt || 'smooth transition back to start',
        startImageId: lastPair.endImageId,
      });

      this.loggerService.log('Added loop-back pair for seamless loop', {
        loopPairEnd: firstPair.startImageId,
        loopPairStart: lastPair.endImageId,
        totalPairs: pairs.length,
      });
    }

    const jobs: Array<{
      id: string;
      pairIndex: number;
      status: string;
    }> = [];

    const duration = dto.duration || 5;
    const cameraPrompt = dto.cameraPrompt || '';
    const format = dto.format || IngredientFormat.LANDSCAPE;

    // Calculate dimensions based on format
    let width: number;
    let height: number;
    switch (format) {
      case IngredientFormat.PORTRAIT:
        width = 720;
        height = 1280;
        break;
      case IngredientFormat.SQUARE:
        width = 1080;
        height = 1080;
        break;
      default:
        width = 1280;
        height = 720;
        break;
    }

    // Process each pair
    for (let i = 0; i < pairs.length; i++) {
      const pair = pairs[i];

      try {
        // Build reference image URLs for start and end frames
        const [startFrameUrls, endFrameUrls] = await Promise.all([
          buildReferenceImageUrls({
            assetsService: this.assetsService,
            configService: this.configService,
            ingredientsService: this.ingredientsService,
            loggerService: this.loggerService,
            referenceIds: [pair.startImageId],
          }),
          buildReferenceImageUrls({
            assetsService: this.assetsService,
            configService: this.configService,
            ingredientsService: this.ingredientsService,
            loggerService: this.loggerService,
            referenceIds: [pair.endImageId],
          }),
        ]);

        const startFrameUrl = startFrameUrls[0];
        const endFrameUrl = endFrameUrls[0];

        if (!startFrameUrl || !endFrameUrl) {
          this.loggerService.warn('Missing frame URLs for pair', {
            endFrameUrl,
            endImageId: pair.endImageId,
            pairIndex: i,
            startFrameUrl,
            startImageId: pair.startImageId,
          });

          jobs.push({
            id: '',
            pairIndex: i,
            status: 'failed',
          });
          continue;
        }

        // Build prompt: pair prompt > camera prompt > default
        const promptText =
          pair.prompt || cameraPrompt || 'smooth transition, cinematic motion';

        // Create prompt record
        const promptData = await this.promptsService.create(
          new PromptEntity({
            brand: publicMetadata.brand,
            category: PromptCategory.MODELS_PROMPT_VIDEO,
            organization: publicMetadata.organization,
            original: promptText,
            status: PromptStatus.PROCESSING,
            user: publicMetadata.user,
          }),
        );

        // Build prompt params for interpolation (with template support)
        const {
          input: promptParams,
          templateUsed,
          templateVersion,
        } = await this.promptBuilderService.buildPrompt(
          dto.modelKey,
          {
            duration,
            endFrame: endFrameUrl,
            height,
            modelCategory:
              (model.category as ModelCategory) || ModelCategory.VIDEO,
            prompt: promptText,
            promptTemplate: dto.promptTemplate,
            references: [startFrameUrl],
            useTemplate: dto.useTemplate,
            width,
          },
          publicMetadata.organization,
        );

        // Create video ingredient with groupId for batch tracking
        const { metadataData, ingredientData } =
          await this.sharedService.saveDocuments(user, {
            brand: brand._id,
            category: IngredientCategory.VIDEO,
            extension: MetadataExtension.MP4,
            groupId,
            groupIndex: i,
            height,
            isMergeEnabled: dto.isMergeEnabled || false,
            model: dto.modelKey,
            organization: brand.organization,
            prompt: promptData._id,
            promptTemplate: templateUsed,
            references: [pair.startImageId],
            status: IngredientStatus.PROCESSING,
            templateVersion: templateVersion,
            width,
          });

        const ingredientId = ingredientData._id.toString();

        // Create activity for tracking
        const activity = await this.activitiesService.create(
          new ActivityEntity({
            brand: brand._id,
            entityId: ingredientData._id,
            entityModel: ActivityEntityModel.INGREDIENT,
            key: ActivityKey.VIDEO_PROCESSING,
            organization: publicMetadata.organization,
            source: ActivitySource.VIDEO_GENERATION,
            user: publicMetadata.user,
            value: JSON.stringify({
              groupId,
              ingredientId,
              isLoopMode: dto.isLoopMode,
              isMergeEnabled: dto.isMergeEnabled,
              model: dto.modelKey,
              pairIndex: i,
              totalPairs: pairs.length,
              type: 'interpolation',
            }),
          }),
        );

        // Emit background task update
        const isLoopPair = dto.isLoopMode && i === pairs.length - 1;
        const label = isLoopPair
          ? `Loop ${i + 1}/${pairs.length}`
          : `Interpolation ${i + 1}/${pairs.length}`;

        await this.websocketService.publishBackgroundTaskUpdate({
          activityId: activity._id.toString(),
          label,
          progress: 0,
          room: getUserRoomName(user.id),
          status: 'processing',
          taskId: ingredientId,
          userId: user.id,
        });

        // Trigger generation via Replicate
        const generationId = await this.replicateService.generateTextToVideo(
          dto.modelKey,
          promptParams,
        );

        if (generationId) {
          // Update metadata with external ID
          await this.metadataService.patch(
            metadataData._id.toString(),
            new MetadataEntity({
              externalId: generationId,
            }),
          );

          // Deduct credits
          const modelData = await this.modelsService.findOne({
            key: dto.modelKey,
          });
          const creditsToDeduct = modelData?.cost || 0;

          if (creditsToDeduct > 0) {
            await this.creditsUtilsService.deductCreditsFromOrganization(
              publicMetadata.organization,
              publicMetadata.user,
              creditsToDeduct,
              `Interpolation video - ${dto.modelKey} (pair ${i + 1}/${pairs.length})`,
              ActivitySource.VIDEO_GENERATION,
            );
          }

          jobs.push({
            id: ingredientId,
            pairIndex: i,
            status: 'processing',
          });

          this.loggerService.log('Interpolation job started', {
            generationId,
            groupId,
            ingredientId,
            isLoopPair,
            model: dto.modelKey,
            pairIndex: i,
          });
        } else {
          // Generation failed to start
          const websocketUrl = WebSocketPaths.video(ingredientId);
          await this.failedGenerationService.handleFailedVideoGeneration(
            this.videosService,
            ingredientId,
            websocketUrl,
            user.id,
            getUserRoomName(user.id),
          );

          jobs.push({
            id: ingredientId,
            pairIndex: i,
            status: 'failed',
          });
        }
      } catch (error: unknown) {
        this.loggerService.error('Failed to process interpolation pair', error);

        jobs.push({
          id: '',
          pairIndex: i,
          status: 'failed',
        });
      }
    }

    // Log merge intent - actual merge is triggered by frontend when all videos complete
    if (dto.isMergeEnabled) {
      const successfulJobs = jobs.filter((j) => j.status === 'processing');

      if (successfulJobs.length > 1) {
        this.loggerService.log('Batch interpolation with merge enabled', {
          groupId,
          isMergeEnabled: true,
          successfulJobs: successfulJobs.length,
          totalJobs: jobs.length,
        });
      }
    }

    const result = {
      groupId,
      isMergeEnabled: dto.isMergeEnabled || false,
      jobs,
      totalJobs: pairs.length,
    };

    return serializeSingle(req, BatchInterpolationSerializer, result);
  }
}
