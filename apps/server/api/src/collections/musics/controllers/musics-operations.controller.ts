import { ActivityEntity } from '@api/collections/activities/entities/activity.entity';
import type { ActivitiesService } from '@api/collections/activities/services/activities.service';
import type { BrandsService } from '@api/collections/brands/services/brands.service';
import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { MetadataService } from '@api/collections/metadata/services/metadata.service';
import type { ModelsService } from '@api/collections/models/services/models.service';
import type { CreateMusicDto } from '@api/collections/musics/dto/create-music.dto';
import type { MusicsService } from '@api/collections/musics/services/musics.service';
import type { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { PromptEntity } from '@api/collections/prompts/entities/prompt.entity';
import type { PromptsService } from '@api/collections/prompts/services/prompts.service';
import { Credits } from '@api/helpers/decorators/credits/credits.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import {
  ModelsGuard,
  ValidateModel,
} from '@api/helpers/guards/models/models.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { resolveGenerationDefaultModel } from '@api/helpers/utils/generation-defaults/generation-defaults.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import type { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import type { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import type { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import type { RouterService } from '@api/services/router/router.service';
import type { FailedGenerationService } from '@api/shared/services/failed-generation/failed-generation.service';
import type { PollingService } from '@api/shared/services/polling/polling.service';
import type { SharedService } from '@api/shared/services/shared/shared.service';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import type { User } from '@clerk/backend';
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
import type { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Types } from 'mongoose';

@AutoSwagger()
@Controller('musics')
@UseGuards(RolesGuard)
export class MusicsOperationsController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly activitiesService: ActivitiesService,
    private readonly brandsService: BrandsService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly failedGenerationService: FailedGenerationService,
    private readonly loggerService: LoggerService,
    private readonly pollingService: PollingService,
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

  @Post()
  @UseGuards(SubscriptionGuard, CreditsGuard, ModelsGuard)
  @Credits({
    description: 'Music generation',
    source: ActivitySource.MUSIC_GENERATION,
  })
  @ValidateModel({ category: ModelCategory.MUSIC })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createMusicDto: CreateMusicDto,
  ): Promise<JsonApiSingleResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    if (!createMusicDto.text) {
      throw new HttpException(
        {
          detail: 'Prompt is required',
          title: 'Prompt validation failed',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const publicMetadata = getPublicMetadata(user);
    const brandId = createMusicDto.brand || publicMetadata.brand;

    // Fetch brand for default model
    const brand = await this.brandsService.findOne({
      _id: new Types.ObjectId(brandId),
      isDeleted: false,
      organization: new Types.ObjectId(publicMetadata.organization),
    });
    const organizationSettings = await this.organizationSettingsService.findOne(
      {
        isDeleted: false,
        organization: new Types.ObjectId(publicMetadata.organization),
      },
    );

    // Model selection: auto-select > user-provided > brand default > system default
    let model: string;
    let routerReason: string | undefined;

    if (createMusicDto.autoSelectModel) {
      const recommendation = await this.routerService.selectModel({
        category: ModelCategory.MUSIC,
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
        service: this.constructorName,
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

    // Save prompt first
    const promptData = await this.promptsService.create(
      new PromptEntity({
        brand: new Types.ObjectId(brandId),
        category: PromptCategory.MODELS_PROMPT_MUSIC,
        model,
        organization: new Types.ObjectId(publicMetadata.organization),
        original: createMusicDto.text,
        user: new Types.ObjectId(publicMetadata.user),
      }),
    );

    const { metadataData, ingredientData } =
      await this.sharedService.saveDocuments(user, {
        ...createMusicDto,
        brand: new Types.ObjectId(publicMetadata.brand),
        category: IngredientCategory.MUSIC,
        extension: MetadataExtension.MP3,
        organization: new Types.ObjectId(publicMetadata.organization),
        prompt: promptData._id,
        status: IngredientStatus.PROCESSING,
      });

    // Create activity for music generation start (after ingredientData is available)
    const activity = await this.activitiesService.create(
      new ActivityEntity({
        brand: new Types.ObjectId(publicMetadata.brand),
        entityId: ingredientData._id,
        entityModel: ActivityEntityModel.INGREDIENT,
        key: ActivityKey.MUSIC_PROCESSING,
        organization: new Types.ObjectId(publicMetadata.organization),
        source: ActivitySource.MUSIC_GENERATION,
        user: new Types.ObjectId(publicMetadata.user),
        value: JSON.stringify({
          ingredientId: ingredientData._id.toString(),
          model,
          type: 'generation',
        }),
      }),
    );

    // Emit background-task-update WebSocket event for activities dropdown
    await this.websocketService.publishBackgroundTaskUpdate({
      activityId: activity._id.toString(),
      label: 'Music Generation',
      progress: 0,
      room: `user-${user.id}`,
      status: 'processing',
      taskId: ingredientData._id.toString(),
      userId: user.id,
    });

    const outputs = Math.max(
      1,
      Math.min(Number(createMusicDto.outputs) || 1, 4),
    );

    const pendingIngredientIds: string[] = [ingredientData._id.toString()];
    const baseSeed =
      typeof createMusicDto.seed === 'number' ? createMusicDto.seed : -1;

    const runMusicGeneration = async (
      metadataId: Types.ObjectId,
      ingredientId: Types.ObjectId,
      outputIndex: number,
      seedValue: number,
    ): Promise<string | null> => {
      const websocketPath = WebSocketPaths.music(ingredientId.toString());

      try {
        // Build provider-specific prompt using universal prompt builder
        const { input: promptParams } =
          await this.promptBuilderService.buildPrompt(model, {
            duration: createMusicDto.duration || 10,
            // Use model's category from DB (set by ModelsGuard), fallback to MUSIC
            modelCategory:
              ((request as unknown as { selectedModel?: { category?: string } })
                .selectedModel?.category as ModelCategory) ||
              ModelCategory.MUSIC,
            prompt: promptData.original,
            seed: seedValue,
          });

        const generationId = await this.replicateService.runModel(
          'meta/musicgen:671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb',
          promptParams,
        );

        if (!generationId) {
          await this.failedGenerationService.handleFailedMusicGeneration(
            this.musicsService,
            ingredientId.toString(),
            websocketPath,
            user.id,
            `user-${user.id}`,
            {
              brand: publicMetadata.brand,
              key: ActivityKey.MUSIC_FAILED,
              organization: publicMetadata.organization,
              source: ActivitySource.MUSIC_GENERATION,
              user: publicMetadata.user,
              value: JSON.stringify({
                error: 'Generation failed to start',
                ingredientId: ingredientId.toString(),
              }),
            },
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

        await this.failedGenerationService.handleFailedMusicGeneration(
          this.musicsService,
          ingredientId.toString(),
          websocketPath,
          user.id,
          `user-${user.id}`,
          {
            brand: publicMetadata.brand,
            key: ActivityKey.MUSIC_FAILED,
            organization: publicMetadata.organization,
            source: ActivitySource.MUSIC_GENERATION,
            user: publicMetadata.user,
            value: JSON.stringify({
              error: (error as Error)?.message || 'Generation failed',
              ingredientId: ingredientId.toString(),
            }),
          },
        );
        return null;
      }
    };

    const primaryWebsocketUrl = WebSocketPaths.music(
      ingredientData._id.toString(),
    );

    try {
      const firstGenerationId = await runMusicGeneration(
        // @ts-expect-error TS2345
        metadataData._id,
        ingredientData._id,
        0,
        baseSeed,
      );

      if (firstGenerationId) {
        const modelData = await this.modelsService.findOne({ key: model });
        let creditsToDeduct = modelData?.cost || 0;

        // Always multiply credits by outputs (each output is a separate generation)
        if (creditsToDeduct > 0 && outputs > 1) {
          creditsToDeduct *= outputs;
        }

        if (creditsToDeduct > 0) {
          await this.creditsUtilsService.deductCreditsFromOrganization(
            publicMetadata.organization,
            publicMetadata.user,
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
            organizationId: publicMetadata.organization,
            outputs,
            userId: publicMetadata.user,
          });
        }

        if (outputs > 1) {
          for (let i = 1; i < outputs; i++) {
            let additionalMetadataId: Types.ObjectId | null = null;
            let additionalIngredientId: Types.ObjectId | null = null;

            const promptId = new Types.ObjectId(promptData._id);

            try {
              const {
                metadataData: additionalMetadata,
                ingredientData: additionalIngredient,
              } = await this.sharedService.saveDocuments(user, {
                ...createMusicDto,
                brand: new Types.ObjectId(publicMetadata.brand),
                category: IngredientCategory.MUSIC,
                extension: MetadataExtension.MP3,
                organization: new Types.ObjectId(publicMetadata.organization),
                prompt: promptId,
                status: IngredientStatus.PROCESSING,
              });

              // @ts-expect-error TS2322
              additionalMetadataId = additionalMetadata._id;
              additionalIngredientId = additionalIngredient._id;

              pendingIngredientIds.push(additionalIngredient._id.toString());

              await this.musicsService.patch(additionalIngredient._id, {
                prompt: promptId,
              });

              const seedForOutput = baseSeed >= 0 ? baseSeed + i : -1;

              await runMusicGeneration(
                new Types.ObjectId(additionalMetadata._id),
                additionalIngredient._id,
                i,
                seedForOutput,
              );
            } catch (error: unknown) {
              this.loggerService.error(
                `${url} failed while preparing output ${i + 1}`,
                error,
              );

              if (additionalIngredientId) {
                await this.failedGenerationService.handleFailedMusicGeneration(
                  this.musicsService,
                  additionalIngredientId.toString(),
                  WebSocketPaths.music(additionalIngredientId.toString()),
                  user.id,
                  `user-${user.id}`,
                  {
                    brand: publicMetadata.brand,
                    key: ActivityKey.MUSIC_FAILED,
                    organization: publicMetadata.organization,
                    source: ActivitySource.MUSIC_GENERATION,
                    user: publicMetadata.user,
                    value: JSON.stringify({
                      error: (error as Error)?.message || 'Generation failed',
                      ingredientId: additionalIngredientId.toString(),
                    }),
                  },
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
      await this.failedGenerationService.handleFailedMusicGeneration(
        this.musicsService,
        ingredientData._id,
        primaryWebsocketUrl,
        user.id,
        `user-${user.id}`,
        {
          brand: publicMetadata.brand,
          key: ActivityKey.MUSIC_FAILED,
          organization: publicMetadata.organization,
          source: ActivitySource.MUSIC_GENERATION,
          user: publicMetadata.user,
          value: JSON.stringify({
            error: (error as Error)?.message || 'Generation failed',
            ingredientId: ingredientData._id.toString(),
          }),
        },
      );
    }

    // Handle waitForCompletion if requested
    if (createMusicDto.waitForCompletion === true) {
      try {
        const completedIngredients =
          await this.pollingService.waitForMultipleIngredientsCompletion(
            pendingIngredientIds,
            180_000, // 3 minutes timeout for music
            3_000, // 3 seconds poll interval
            [
              PopulatePatterns.promptFull,
              PopulatePatterns.metadataFull,
              PopulatePatterns.userMinimal,
              PopulatePatterns.brandMinimal,
            ],
          );

        return serializeSingle(
          request,
          MusicSerializer,
          completedIngredients[0],
        );
      } catch (error: unknown) {
        if ((error as Error).name === 'PollingTimeoutError') {
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
}
