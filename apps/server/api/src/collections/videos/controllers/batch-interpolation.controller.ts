import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ActivityEntity } from '@api/collections/activities/entities/activity.entity';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { PromptEntity } from '@api/collections/prompts/entities/prompt.entity';
import { PromptsService } from '@api/collections/prompts/services/prompts.service';
import {
  BatchInterpolationDto,
  InterpolationPairDto,
} from '@api/collections/videos/dto/batch-interpolation.dto';
import { BatchInterpolationReferenceService } from '@api/collections/videos/services/batch-interpolation-reference.service';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { Credits } from '@api/helpers/decorators/credits/credits.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { FailedGenerationService } from '@api/shared/services/failed-generation/failed-generation.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { hasInterpolation } from '@genfeedai/constants';
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

type InterpolationJobResult = {
  id: string;
  pairIndex: number;
  status: string;
};

type InterpolationContext = {
  brand: NonNullable<Awaited<ReturnType<BrandsService['findOne']>>>;
  cameraPrompt: string;
  dto: BatchInterpolationDto;
  duration: number;
  groupId: string;
  height: number;
  model: NonNullable<Awaited<ReturnType<ModelsService['findOne']>>>;
  pairs: InterpolationPairDto[];
  user: User;
  width: number;
};

@AutoSwagger()
@Controller('videos')
@UseGuards(RolesGuard, SubscriptionGuard, CreditsGuard)
export class BatchInterpolationController {
  constructor(
    private readonly activitiesService: ActivitiesService,
    private readonly brandsService: BrandsService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly failedGenerationService: FailedGenerationService,
    private readonly interpolationReferenceService: BatchInterpolationReferenceService,
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
    // Generate group ID to link all videos from this storyboard batch together.
    const groupId = randomUUID();

    // Validate model exists.
    const model = await this.modelsService.findOne({
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

    const modelHasInterpolation =
      typeof model.hasInterpolation === 'boolean'
        ? model.hasInterpolation
        : hasInterpolation(dto.modelKey);

    if (!modelHasInterpolation) {
      throw new HttpException(
        {
          detail: `Model ${dto.modelKey} does not support start/end frame interpolation`,
          title: 'Model does not support interpolation',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // Get brand for organization context
    const brand = await this.brandsService.findOne({
      id: user.brandId,
      organizationId: user.organizationId,
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

      // Add loop-back pair: last frame's end to first frame's start.
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

    const { height, width } = this.resolveDimensions(
      dto.format || IngredientFormat.LANDSCAPE,
    );
    const context: InterpolationContext = {
      brand,
      cameraPrompt: dto.cameraPrompt || '',
      dto,
      duration: dto.duration || 5,
      groupId,
      height,
      model,
      pairs,
      user,
      width,
    };
    const jobs = await Promise.all(
      pairs.map((pair, index) => this.processPair(pair, index, context)),
    );

    // Log merge intent; webhook auto-merge runs once all group videos complete.
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

  private resolveDimensions(format: IngredientFormat): {
    height: number;
    width: number;
  } {
    if (format === IngredientFormat.PORTRAIT) {
      return { height: 1280, width: 720 };
    }
    if (format === IngredientFormat.SQUARE) {
      return { height: 1080, width: 1080 };
    }
    return { height: 720, width: 1280 };
  }

  private async processPair(
    pair: InterpolationPairDto,
    pairIndex: number,
    context: InterpolationContext,
  ): Promise<InterpolationJobResult> {
    try {
      const { endFrameUrl, startFrameUrl } =
        await this.interpolationReferenceService.resolvePair(
          pair,
          context.user.organizationId,
        );
      if (!startFrameUrl || !endFrameUrl) {
        this.loggerService.warn('Missing frame URLs for pair', {
          endFrameUrl,
          endImageId: pair.endImageId,
          pairIndex,
          startFrameUrl,
          startImageId: pair.startImageId,
        });
        return { id: '', pairIndex, status: 'failed' };
      }
      const promptText =
        pair.prompt ||
        context.cameraPrompt ||
        'smooth transition, cinematic motion';
      const promptData = await this.promptsService.create(
        new PromptEntity({
          brandId: context.user.brandId,
          category: PromptCategory.MODELS_PROMPT_VIDEO,
          organizationId: context.user.organizationId,
          original: promptText,
          status: PromptStatus.PROCESSING,
          userId: context.user.userId ?? context.user.id,
        }),
      );
      const builtPrompt = await this.promptBuilderService.buildPrompt(
        context.dto.modelKey,
        {
          duration: context.duration,
          endFrame: endFrameUrl,
          height: context.height,
          modelCategory:
            (context.model.category as ModelCategory) || ModelCategory.VIDEO,
          prompt: promptText,
          promptTemplate: context.dto.promptTemplate,
          references: [startFrameUrl],
          useTemplate: context.dto.useTemplate,
          width: context.width,
        },
        context.user.organizationId,
      );
      const { metadataData, ingredientData } =
        await this.sharedService.createMediaDocuments(context.user, {
          brandId: context.brand.id,
          category: IngredientCategory.VIDEO,
          extension: MetadataExtension.MP4,
          groupId: context.groupId,
          groupIndex: pairIndex,
          height: context.height,
          isMergeEnabled: context.dto.isMergeEnabled || false,
          model: context.dto.modelKey,
          organizationId: context.brand.organizationId,
          promptId: promptData.id,
          promptTemplate: builtPrompt.templateUsed,
          sourceIds: [pair.startImageId],
          status: IngredientStatus.PROCESSING,
          templateVersion: builtPrompt.templateVersion,
          width: context.width,
        });
      const ingredientId = ingredientData.id.toString();
      const activity = await this.activitiesService.create(
        new ActivityEntity({
          brandId: context.brand.id,
          entityId: ingredientData.id,
          entityModel: ActivityEntityModel.INGREDIENT,
          key: ActivityKey.VIDEO_PROCESSING,
          organizationId: context.user.organizationId,
          source: ActivitySource.VIDEO_GENERATION,
          userId: context.user.userId ?? context.user.id,
          value: JSON.stringify({
            groupId: context.groupId,
            ingredientId,
            isLoopMode: context.dto.isLoopMode,
            isMergeEnabled: context.dto.isMergeEnabled,
            model: context.dto.modelKey,
            pairIndex,
            totalPairs: context.pairs.length,
            type: 'interpolation',
          }),
        }),
      );
      const isLoopPair =
        Boolean(context.dto.isLoopMode) &&
        pairIndex === context.pairs.length - 1;
      await this.websocketService.publishBackgroundTaskUpdate({
        activityId: activity.id.toString(),
        label: isLoopPair
          ? `Loop ${pairIndex + 1}/${context.pairs.length}`
          : `Interpolation ${pairIndex + 1}/${context.pairs.length}`,
        progress: 0,
        room: getUserRoomName(context.user.id),
        status: 'processing',
        taskId: ingredientId,
        userId: context.user.id,
      });
      return this.dispatchPair({
        context,
        ingredientId,
        isLoopPair,
        metadataId: metadataData.id.toString(),
        pairIndex,
        promptParams: builtPrompt.input,
      });
    } catch (error: unknown) {
      this.loggerService.error('Failed to process interpolation pair', error);
      return { id: '', pairIndex, status: 'failed' };
    }
  }

  private async dispatchPair(params: {
    context: InterpolationContext;
    ingredientId: string;
    isLoopPair: boolean;
    metadataId: string;
    pairIndex: number;
    promptParams: Record<string, unknown>;
  }): Promise<InterpolationJobResult> {
    const { context, ingredientId, isLoopPair, metadataId, pairIndex } = params;
    const generationId = await this.replicateService.generateTextToVideo(
      context.dto.modelKey,
      params.promptParams,
    );
    if (!generationId) {
      await this.failedGenerationService.handleFailedVideoGeneration(
        this.videosService,
        ingredientId,
        WebSocketPaths.video(ingredientId),
        context.user.id,
        getUserRoomName(context.user.id),
      );
      return { id: ingredientId, pairIndex, status: 'failed' };
    }
    await this.metadataService.patch(
      metadataId,
      new MetadataEntity({ externalId: generationId }),
    );
    const modelData = await this.modelsService.findOne({
      key: context.dto.modelKey,
    });
    const credits = modelData?.cost || 0;
    if (credits > 0) {
      await this.creditsUtilsService.deductCreditsFromOrganization(
        context.user.organizationId,
        context.user.userId ?? context.user.id,
        credits,
        `Interpolation video - ${context.dto.modelKey} (pair ${pairIndex + 1}/${context.pairs.length})`,
        ActivitySource.VIDEO_GENERATION,
      );
    }
    this.loggerService.log('Interpolation job started', {
      generationId,
      groupId: context.groupId,
      ingredientId,
      isLoopPair,
      model: context.dto.modelKey,
      pairIndex,
    });
    return { id: ingredientId, pairIndex, status: 'processing' };
  }
}
