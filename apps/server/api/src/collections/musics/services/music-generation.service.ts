import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ActivityEntity } from '@api/collections/activities/entities/activity.entity';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { CreateMusicDto } from '@api/collections/musics/dto/create-music.dto';
import { MusicGenerationCreditsService } from '@api/collections/musics/services/music-generation-credits.service';
import { MusicsService } from '@api/collections/musics/services/musics.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { PromptEntity } from '@api/collections/prompts/entities/prompt.entity';
import { PromptsService } from '@api/collections/prompts/services/prompts.service';
import { resolveGenerationDefaultModel } from '@api/helpers/utils/generation-defaults/generation-defaults.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { RouterService } from '@api/services/router/router.service';
import { FailedGenerationService } from '@api/shared/services/failed-generation/failed-generation.service';
import { IngredientCompletionService } from '@api/shared/services/poll-until/ingredient-completion.service';
import { PollTimeoutException } from '@api/shared/services/poll-until/poll-until.exception';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
  ModelCategory,
  PromptCategory,
} from '@genfeedai/enums';
import type { JsonApiSingleResponse } from '@genfeedai/interfaces';
import { MusicSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { Request } from 'express';

const MUSICGEN_VERSION =
  'meta/musicgen:671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb';
const MUSIC_COMPLETION_TIMEOUT_MS = 180_000;
const MUSIC_COMPLETION_POLL_INTERVAL_MS = 3_000;
const MUSIC_COMPLETION_POPULATE = [
  PopulatePatterns.promptFull,
  PopulatePatterns.metadataFull,
  PopulatePatterns.userMinimal,
  PopulatePatterns.brandMinimal,
];

type MusicDispatchParams = {
  brandId: string;
  createMusicDto: CreateMusicDto;
  ingredientId: string;
  metadataId: string;
  model: string;
  outputs: number;
  promptData: Awaited<ReturnType<PromptsService['create']>>;
  request: Request;
  url: string;
  user: User;
};

/**
 * Owns the music-generation workflow formerly implemented by
 * `MusicsOperationsController.create` while the controller retains the stable
 * HTTP transport contract.
 */
@Injectable()
export class MusicGenerationService {
  private readonly orchestrationSource = 'MusicsOperationsController';

  constructor(
    private readonly activitiesService: ActivitiesService,
    private readonly brandsService: BrandsService,
    private readonly creditsService: MusicGenerationCreditsService,
    private readonly failedGenerationService: FailedGenerationService,
    private readonly loggerService: LoggerService,
    private readonly ingredientCompletionService: IngredientCompletionService,
    private readonly metadataService: MetadataService,
    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly musicsService: MusicsService,
    private readonly promptsService: PromptsService,
    private readonly promptBuilderService: PromptBuilderService,
    private readonly replicateService: ReplicateService,
    private readonly routerService: RouterService,
    private readonly sharedService: SharedService,
    private readonly websocketService: NotificationsPublisherService,
  ) {}

  async generateMusic(
    user: User,
    createMusicDto: CreateMusicDto,
    request: Request,
  ): Promise<JsonApiSingleResponse> {
    const url = `${this.orchestrationSource} create`;

    if (!createMusicDto.text) {
      throw new HttpException(
        {
          detail: 'Prompt is required',
          title: 'Prompt validation failed',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const brandId = createMusicDto.brandId || user.brandId;
    const brand = await this.brandsService.findOne({
      id: brandId,
      organizationId: user.organizationId,
    });
    const organizationSettings = await this.organizationSettingsService.findOne(
      {
        organizationId: user.organizationId,
      },
    );

    let model: string;
    let routerReason: string | undefined;

    if (createMusicDto.autoSelectModel) {
      const recommendation = await this.routerService.selectModel({
        category: ModelCategory.MUSIC,
        organizationId: user.organizationId,
        outputs: createMusicDto.outputs,
        prioritize: createMusicDto.prioritize || 'balanced',
        prompt: createMusicDto.text,
      });
      model = recommendation.selectedModel as string;
      routerReason = recommendation.reason;

      this.loggerService.log('Auto model routing selected', {
        promptPreview: createMusicDto.text.substring(0, 100),
        reason: routerReason,
        selectedModel: model,
        service: this.orchestrationSource,
      });
    } else {
      model = resolveGenerationDefaultModel<string>({
        brandDefault: brand?.defaultMusicModel as string | undefined,
        explicit: createMusicDto.model as string | undefined,
        organizationDefault: organizationSettings?.defaultMusicModel as
          | string
          | undefined,
        systemDefault: (await this.routerService.getDefaultModel(
          ModelCategory.MUSIC,
        )) as string,
      });
    }

    const promptData = await this.promptsService.create(
      new PromptEntity({
        brandId,
        category: PromptCategory.MODELS_PROMPT_MUSIC,
        model,
        organizationId: user.organizationId,
        original: createMusicDto.text,
        userId: user.userId ?? user.id,
      }),
    );

    const { metadataData, ingredientData } =
      await this.sharedService.createMediaDocuments(user, {
        brandId,
        category: IngredientCategory.MUSIC,
        duration: createMusicDto.duration,
        extension: MetadataExtension.MP3,
        generationPrompt: createMusicDto.text,
        generationSeed: createMusicDto.seed,
        isDefault: createMusicDto.isDefault,
        model,
        organizationId: user.organizationId,
        promptId: promptData.id,
        scope: createMusicDto.scope,
        status: IngredientStatus.PROCESSING,
        tagIds: createMusicDto.tags,
      });

    const activity = await this.activitiesService.create(
      new ActivityEntity({
        brandId,
        entityId: ingredientData.id,
        entityModel: ActivityEntityModel.INGREDIENT,
        key: ActivityKey.MUSIC_PROCESSING,
        organizationId: user.organizationId,
        source: ActivitySource.MUSIC_GENERATION,
        userId: user.userId ?? user.id,
        value: JSON.stringify({
          ingredientId: ingredientData.id.toString(),
          model,
          type: 'generation',
        }),
      }),
    );

    await this.websocketService.publishBackgroundTaskUpdate({
      activityId: activity.id.toString(),
      label: 'Music Generation',
      progress: 0,
      room: getUserRoomName(user.id),
      status: 'processing',
      taskId: ingredientData.id.toString(),
      userId: user.id,
    });

    const outputs = Math.max(
      1,
      Math.min(Number(createMusicDto.outputs) || 1, 4),
    );
    const pendingIngredientIds = await this.dispatchOutputs({
      brandId,
      createMusicDto,
      ingredientId: ingredientData.id.toString(),
      metadataId: metadataData.id.toString(),
      model,
      outputs,
      promptData,
      request,
      url,
      user,
    });
    return this.serializeResult({
      createMusicDto,
      ingredientData,
      pendingIngredientIds,
      request,
    });
  }

  private async dispatchOutputs(
    params: MusicDispatchParams,
  ): Promise<string[]> {
    const { ingredientId, metadataId, outputs } = params;
    const pendingIds = [ingredientId];
    const baseSeed =
      typeof params.createMusicDto.seed === 'number'
        ? params.createMusicDto.seed
        : -1;
    const firstGenerationId = await this.startGeneration({
      ...params,
      ingredientId,
      metadataId,
      outputIndex: 0,
      seed: baseSeed,
    });
    if (!firstGenerationId) {
      return pendingIds;
    }
    await this.creditsService.settle(
      params.user,
      params.model,
      outputs,
      firstGenerationId,
    );
    for (let index = 1; index < outputs; index++) {
      await this.prepareAdditionalOutput(params, pendingIds, baseSeed, index);
    }
    return pendingIds;
  }

  private async prepareAdditionalOutput(
    params: MusicDispatchParams,
    pendingIds: string[],
    baseSeed: number,
    outputIndex: number,
  ): Promise<void> {
    let metadataId: string | null = null;
    let ingredientId: string | null = null;
    try {
      const created = await this.sharedService.createMediaDocuments(
        params.user,
        {
          brandId: params.brandId,
          category: IngredientCategory.MUSIC,
          duration: params.createMusicDto.duration,
          extension: MetadataExtension.MP3,
          generationPrompt: params.createMusicDto.text,
          generationSeed: params.createMusicDto.seed,
          model: params.model,
          organizationId: params.user.organizationId,
          promptId: params.promptData.id,
          scope: params.createMusicDto.scope,
          status: IngredientStatus.PROCESSING,
          tagIds: params.createMusicDto.tags,
        },
      );
      metadataId = created.metadataData.id.toString();
      ingredientId = created.ingredientData.id.toString();
      pendingIds.push(ingredientId);
      await this.musicsService.patch(created.ingredientData.id, {
        promptId: params.promptData.id,
      });
      await this.startGeneration({
        ...params,
        ingredientId,
        metadataId,
        outputIndex,
        seed: baseSeed >= 0 ? baseSeed + outputIndex : -1,
      });
    } catch (error: unknown) {
      this.loggerService.error(
        `${params.url} failed while preparing output ${outputIndex + 1}`,
        error,
      );
      if (ingredientId) {
        await this.handleFailedGeneration(
          params.user,
          params.brandId,
          ingredientId,
          WebSocketPaths.music(ingredientId),
          (error as Error)?.message || 'Generation failed',
        );
      }
      if (metadataId) {
        await this.metadataService.patch(metadataId, { externalId: undefined });
      }
    }
  }

  private async startGeneration(
    params: MusicDispatchParams & {
      ingredientId: string;
      metadataId: string;
      outputIndex: number;
      seed: number;
    },
  ): Promise<string | null> {
    try {
      const { input } = await this.promptBuilderService.buildPrompt(
        params.model,
        {
          duration: params.createMusicDto.duration || 10,
          modelCategory:
            ((
              params.request as unknown as {
                selectedModel?: { category?: string };
              }
            ).selectedModel?.category as ModelCategory) || ModelCategory.MUSIC,
          prompt: params.promptData.original,
          seed: params.seed,
        },
      );
      const generationId = await this.replicateService.runModel(
        MUSICGEN_VERSION,
        input,
      );
      if (!generationId) {
        await this.handleFailedGeneration(
          params.user,
          params.brandId,
          params.ingredientId,
          WebSocketPaths.music(params.ingredientId),
          'Generation failed to start',
        );
        return null;
      }
      await this.metadataService.patch(params.metadataId, {
        externalId: generationId,
      });
      return generationId;
    } catch (error: unknown) {
      this.loggerService.error(
        `${params.url} failed (output ${params.outputIndex + 1})`,
        error,
      );
      await this.handleFailedGeneration(
        params.user,
        params.brandId,
        params.ingredientId,
        WebSocketPaths.music(params.ingredientId),
        (error as Error)?.message || 'Generation failed',
      );
      return null;
    }
  }

  private async serializeResult(params: {
    createMusicDto: CreateMusicDto;
    ingredientData: Awaited<
      ReturnType<SharedService['createMediaDocuments']>
    >['ingredientData'];
    pendingIngredientIds: string[];
    request: Request;
  }): Promise<JsonApiSingleResponse> {
    if (params.createMusicDto.waitForCompletion !== true) {
      return serializeSingle(params.request, MusicSerializer, {
        ...params.ingredientData,
        pendingIngredientIds: params.pendingIngredientIds,
      });
    }
    try {
      const completed =
        await this.ingredientCompletionService.waitForMultipleIngredientsCompletion(
          params.pendingIngredientIds,
          MUSIC_COMPLETION_TIMEOUT_MS,
          MUSIC_COMPLETION_POLL_INTERVAL_MS,
          MUSIC_COMPLETION_POPULATE,
        );
      return serializeSingle(params.request, MusicSerializer, completed[0]);
    } catch (error: unknown) {
      if (error instanceof PollTimeoutException) {
        throw new HttpException(
          {
            detail: `Music generation did not complete within 3 minutes. Current status: ${params.ingredientData.status}`,
            title: 'Generation timeout',
          },
          HttpStatus.GATEWAY_TIMEOUT,
        );
      }
      throw error;
    }
  }

  private handleFailedGeneration(
    user: User,
    brandId: string,
    ingredientId: string,
    websocketPath: string,
    error: string,
  ): Promise<void> {
    return this.failedGenerationService.handleFailedMusicGeneration(
      this.musicsService,
      ingredientId.toString(),
      websocketPath,
      user.id,
      getUserRoomName(user.id),
      {
        brandId,
        key: ActivityKey.MUSIC_FAILED,
        organizationId: user.organizationId,
        source: ActivitySource.MUSIC_GENERATION,
        userId: user.userId ?? user.id,
        value: JSON.stringify({
          error,
          ingredientId: ingredientId.toString(),
        }),
      },
    );
  }
}
