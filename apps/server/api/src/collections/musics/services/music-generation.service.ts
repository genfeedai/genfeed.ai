import type { AuthenticatedUser as User } from '@server/auth/interfaces/authenticated-user.interface';
import { ActivityEntity } from '@server/collections/activities/entities/activity.entity';
import { ActivitiesService } from '@server/collections/activities/services/activities.service';
import { BrandsService } from '@server/collections/brands/services/brands.service';
import { CreditsUtilsService } from '@server/collections/credits/services/credits.utils.service';
import { MetadataService } from '@server/collections/metadata/services/metadata.service';
import { ModelsService } from '@server/collections/models/services/models.service';
import { CreateMusicDto } from '@server/collections/musics/dto/create-music.dto';
import { MusicsService } from '@server/collections/musics/services/musics.service';
import { OrganizationSettingsService } from '@server/collections/organization-settings/services/organization-settings.service';
import { PromptEntity } from '@server/collections/prompts/entities/prompt.entity';
import { PromptsService } from '@server/collections/prompts/services/prompts.service';
import { resolveGenerationDefaultModel } from '@server/helpers/utils/generation-defaults/generation-defaults.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { WebSocketPaths } from '@server/helpers/utils/websocket/websocket.util';
import { NotificationsPublisherService } from '@server/services/notifications/publisher/notifications-publisher.service';
import { PromptBuilderService } from '@server/services/prompt-builder/prompt-builder.service';
import { RouterService } from '@server/services/router/router.service';
import { FailedGenerationService } from '@server/shared/services/failed-generation/failed-generation.service';
import { IngredientCompletionService } from '@server/shared/services/poll-until/ingredient-completion.service';
import { SharedService } from '@server/shared/services/shared/shared.service';
import { PopulatePatterns } from '@server/shared/utils/populate/populate.util';
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
import { ReplicateService } from '@server/services/integrations/replicate/services/replicate.service';
import { PollTimeoutException } from '@server/shared/services/poll-until/poll-until.exception';
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
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly failedGenerationService: FailedGenerationService,
    private readonly loggerService: LoggerService,
    private readonly ingredientCompletionService: IngredientCompletionService,
    private readonly metadataService: MetadataService,
    private readonly modelsService: ModelsService,
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
    const pendingIngredientIds: string[] = [ingredientData.id.toString()];
    const baseSeed =
      typeof createMusicDto.seed === 'number' ? createMusicDto.seed : -1;

    const runMusicGeneration = async (
      metadataId: string,
      ingredientId: string,
      outputIndex: number,
      seedValue: number,
    ): Promise<string | null> => {
      const websocketPath = WebSocketPaths.music(ingredientId.toString());

      try {
        const { input: promptParams } =
          await this.promptBuilderService.buildPrompt(model, {
            duration: createMusicDto.duration || 10,
            modelCategory:
              ((request as unknown as { selectedModel?: { category?: string } })
                .selectedModel?.category as ModelCategory) ||
              ModelCategory.MUSIC,
            prompt: promptData.original,
            seed: seedValue,
          });

        const generationId = await this.replicateService.runModel(
          MUSICGEN_VERSION,
          promptParams,
        );

        if (!generationId) {
          await this.handleFailedGeneration(
            user,
            brandId,
            ingredientId,
            websocketPath,
            'Generation failed to start',
          );
          return null;
        }

        await this.metadataService.patch(metadataId, {
          externalId: generationId,
        });

        return generationId;
      } catch (error: unknown) {
        this.loggerService.error(
          `${url} failed (output ${outputIndex + 1})`,
          error,
        );

        await this.handleFailedGeneration(
          user,
          brandId,
          ingredientId,
          websocketPath,
          (error as Error)?.message || 'Generation failed',
        );
        return null;
      }
    };

    const primaryWebsocketUrl = WebSocketPaths.music(
      ingredientData.id.toString(),
    );

    try {
      const firstGenerationId = await runMusicGeneration(
        metadataData.id.toString(),
        ingredientData.id,
        0,
        baseSeed,
      );

      if (firstGenerationId) {
        await this.settleCredits(user, model, outputs, firstGenerationId);

        if (outputs > 1) {
          for (let i = 1; i < outputs; i++) {
            let additionalMetadataId: string | null = null;
            let additionalIngredientId: string | null = null;
            const promptId = promptData.id;

            try {
              const {
                metadataData: additionalMetadata,
                ingredientData: additionalIngredient,
              } = await this.sharedService.createMediaDocuments(user, {
                brandId,
                category: IngredientCategory.MUSIC,
                duration: createMusicDto.duration,
                extension: MetadataExtension.MP3,
                generationPrompt: createMusicDto.text,
                generationSeed: createMusicDto.seed,
                model,
                organizationId: user.organizationId,
                promptId,
                scope: createMusicDto.scope,
                status: IngredientStatus.PROCESSING,
                tagIds: createMusicDto.tags,
              });

              additionalMetadataId = additionalMetadata.id.toString();
              additionalIngredientId = additionalIngredient.id.toString();
              pendingIngredientIds.push(additionalIngredient.id.toString());

              await this.musicsService.patch(additionalIngredient.id, {
                promptId,
              });

              const seedForOutput = baseSeed >= 0 ? baseSeed + i : -1;

              await runMusicGeneration(
                additionalMetadata.id,
                additionalIngredient.id,
                i,
                seedForOutput,
              );
            } catch (error: unknown) {
              this.loggerService.error(
                `${url} failed while preparing output ${i + 1}`,
                error,
              );

              if (additionalIngredientId) {
                await this.handleFailedGeneration(
                  user,
                  brandId,
                  additionalIngredientId,
                  WebSocketPaths.music(additionalIngredientId),
                  (error as Error)?.message || 'Generation failed',
                );
              }

              if (additionalMetadataId) {
                await this.metadataService.patch(additionalMetadataId, {
                  externalId: undefined,
                });
              }
            }
          }
        }
      }
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      await this.handleFailedGeneration(
        user,
        brandId,
        ingredientData.id,
        primaryWebsocketUrl,
        (error as Error)?.message || 'Generation failed',
      );
    }

    if (createMusicDto.waitForCompletion === true) {
      try {
        const completedIngredients =
          await this.ingredientCompletionService.waitForMultipleIngredientsCompletion(
            pendingIngredientIds,
            MUSIC_COMPLETION_TIMEOUT_MS,
            MUSIC_COMPLETION_POLL_INTERVAL_MS,
            MUSIC_COMPLETION_POPULATE,
          );

        return serializeSingle(
          request,
          MusicSerializer,
          completedIngredients[0],
        );
      } catch (error: unknown) {
        if (error instanceof PollTimeoutException) {
          throw new HttpException(
            {
              detail: `Music generation did not complete within 3 minutes. Current status: ${ingredientData.status}`,
              title: 'Generation timeout',
            },
            HttpStatus.GATEWAY_TIMEOUT,
          );
        }
        throw error;
      }
    }

    return serializeSingle(request, MusicSerializer, {
      ...ingredientData,
      pendingIngredientIds,
    });
  }

  private async settleCredits(
    user: User,
    model: string,
    outputs: number,
    firstGenerationId: string,
  ): Promise<void> {
    const modelData = await this.modelsService.findOne({ key: model });
    let creditsToDeduct = modelData?.cost || 0;

    if (creditsToDeduct > 0 && outputs > 1) {
      creditsToDeduct *= outputs;
    }

    if (creditsToDeduct <= 0) {
      return;
    }

    await this.creditsUtilsService.deductCreditsFromOrganization(
      user.organizationId,
      user.userId ?? user.id,
      creditsToDeduct,
      `Music generation - ${model}${
        outputs > 1 ? ` (${outputs} outputs)` : ''
      }`,
      ActivitySource.MUSIC_GENERATION,
    );
    this.loggerService.log('Credits deducted after music generation', {
      credits: creditsToDeduct,
      generationId: firstGenerationId,
      model,
      organizationId: user.organizationId,
      outputs,
      userId: user.userId ?? user.id,
    });
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
