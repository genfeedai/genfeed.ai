import { ActivityEntity } from '@api/collections/activities/entities/activity.entity';
import type { ActivitiesService } from '@api/collections/activities/services/activities.service';
import type { AssetsService } from '@api/collections/assets/services/assets.service';
import type { BrandsService } from '@api/collections/brands/services/brands.service';
import { buildPromptBrandingFromBrand } from '@api/collections/brands/utils/brand-context.util';
import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { CreateImageDto } from '@api/collections/images/dto/create-image.dto';
import type { SplitImageDto } from '@api/collections/images/dto/split-image.dto';
import type { ImagesService } from '@api/collections/images/services/images.service';
import type { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import type { MetadataService } from '@api/collections/metadata/services/metadata.service';
import type { ModelRegistrationService } from '@api/collections/models/services/model-registration.service';
import type { ModelsService } from '@api/collections/models/services/models.service';
import {
  baseModelKey,
  isFalDestination,
  isGenfeedAiDestination,
  isReplicateDestination,
} from '@api/collections/models/utils/model-key.util';
import type { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { PromptEntity } from '@api/collections/prompts/entities/prompt.entity';
import type { PromptsService } from '@api/collections/prompts/services/prompts.service';
import type { CreateTagDto } from '@api/collections/tags/dto/create-tag.dto';
import type { TagsService } from '@api/collections/tags/services/tags.service';
import type { ConfigService } from '@api/config/config.service';
import {
  Credits,
  DeferCreditsUntilModelResolution,
} from '@api/helpers/decorators/credits/credits.decorator';
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
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { getErrorMessage } from '@api/helpers/utils/error/get-error-message.util';
import { resolveGenerationDefaultModel } from '@api/helpers/utils/generation-defaults/generation-defaults.util';
import { buildReferenceImageUrls } from '@api/helpers/utils/reference/reference.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import type { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import type { ComfyUIService } from '@api/services/integrations/comfyui/comfyui.service';
import type { FalService } from '@api/services/integrations/fal/fal.service';
import type { KlingAIService } from '@api/services/integrations/klingai/klingai.service';
import type { LeonardoAIService } from '@api/services/integrations/leonardoai/leonardoai.service';
import type { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import type { NotificationsService } from '@api/services/notifications/notifications.service';
import type { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import type { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import type { RouterService } from '@api/services/router/router.service';
import type { WebhookClientService } from '@api/services/webhook-client/webhook-client.service';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import type { FailedGenerationService } from '@api/shared/services/failed-generation/failed-generation.service';
import type { PollingService } from '@api/shared/services/polling/polling.service';
import type { SharedService } from '@api/shared/services/shared/shared.service';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import type { User } from '@clerk/backend';
import { MODEL_KEYS, MODEL_OUTPUT_CAPABILITIES } from '@genfeedai/constants';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
  FileInputType,
  IngredientCategory,
  IngredientStatus,
  MemberRole,
  MetadataExtension,
  ModelCategory,
  PricingType,
  PromptCategory,
  PromptStatus,
  TagCategory,
  TagKey,
} from '@genfeedai/enums';
import type { JsonApiSingleResponse } from '@genfeedai/interfaces';
import { IngredientSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Req,
  SetMetadata,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';
import { isValidObjectId, Types } from 'mongoose';
import sharp from 'sharp';

@AutoSwagger()
@Controller('images')
@UseGuards(RolesGuard)
export class ImagesOperationsController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly activitiesService: ActivitiesService,
    private readonly assetsService: AssetsService,
    private readonly brandsService: BrandsService,
    private readonly comfyUIService: ComfyUIService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly failedGenerationService: FailedGenerationService,
    private readonly filesClientService: FilesClientService,
    private readonly falService: FalService,
    private readonly pollingService: PollingService,
    private readonly imagesService: ImagesService,
    private readonly ingredientsService: IngredientsService,
    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly klingAIService: KlingAIService,
    private readonly leonardoaiService: LeonardoAIService,
    private readonly loggerService: LoggerService,
    private readonly metadataService: MetadataService,
    private readonly modelRegistrationService: ModelRegistrationService,
    private readonly modelsService: ModelsService,
    readonly _notificationsService: NotificationsService,
    private readonly promptBuilderService: PromptBuilderService,
    private readonly promptsService: PromptsService,
    private readonly replicateService: ReplicateService,
    private readonly routerService: RouterService,
    private readonly sharedService: SharedService,
    private readonly tagsService: TagsService,
    readonly _webhookService: WebhookClientService,
    private readonly websocketService: NotificationsPublisherService,
  ) {}

  @Post()
  @SetMetadata('roles', [
    'superadmin',
    MemberRole.OWNER,
    MemberRole.ADMIN,
    MemberRole.CREATOR,
  ])
  @Credits({
    description: 'Image generation',
    source: ActivitySource.IMAGE_GENERATION,
  })
  @DeferCreditsUntilModelResolution()
  @ValidateModel({ category: ModelCategory.IMAGE })
  @UseGuards(SubscriptionGuard, CreditsGuard, ModelsGuard)
  @UseInterceptors(CreditsInterceptor)
  @RateLimit({ limit: 30, scope: 'organization', windowMs: 60 * 1000 })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async create(
    @Req() request: Request,
    @Body() createImageDto: CreateImageDto,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    let url = `${this.constructorName} create`;

    this.loggerService.log(url, { ...createImageDto });
    const publicMetadata = getPublicMetadata(user);

    if (!createImageDto.prompt && !createImageDto.text) {
      throw new HttpException(
        {
          detail: 'Prompt is required',
          title: 'Prompt validation failed',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const promptOriginal = createImageDto.text || createImageDto.prompt;

    const brandId = createImageDto.brand || publicMetadata.brand;
    const brand = await this.brandsService.findOne({
      _id: new Types.ObjectId(brandId),
      isDeleted: false,
      organization: new Types.ObjectId(publicMetadata.organization),
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

    const organizationSettings = await this.organizationSettingsService.findOne(
      {
        isDeleted: false,
        organization: new Types.ObjectId(publicMetadata.organization),
      },
    );

    // Model selection: auto-select > user-provided > brand default > system default
    let model: string;
    let routerReason: string | undefined;

    if (createImageDto.autoSelectModel) {
      // Auto model routing - let RouterService pick the best model
      const promptString =
        typeof promptOriginal === 'string'
          ? promptOriginal
          : promptOriginal?.toString() || '';
      const recommendation = await this.routerService.selectModel({
        category: ModelCategory.IMAGE,
        dimensions: {
          height: createImageDto.height,
          width: createImageDto.width,
        },
        outputs: createImageDto.outputs,
        prioritize: createImageDto.prioritize || 'balanced',
        prompt: promptString,
      });
      model = recommendation.selectedModel as string;
      routerReason = recommendation.reason;

      this.loggerService.log('Auto model routing selected', {
        promptPreview: promptString.substring(0, 100),
        reason: routerReason,
        selectedModel: model,
        service: this.constructorName,
      });
    } else {
      // Manual selection: user-provided > brand default > system default
      const userModel =
        createImageDto.model &&
        Object.values(MODEL_KEYS).includes(createImageDto.model as string)
          ? (createImageDto.model as string)
          : undefined;
      const brandDefaultModel =
        brand.defaultImageModel &&
        Object.values(MODEL_KEYS).includes(brand.defaultImageModel as string)
          ? (brand.defaultImageModel as string)
          : undefined;
      const organizationDefaultModel =
        organizationSettings?.defaultImageModel &&
        Object.values(MODEL_KEYS).includes(
          organizationSettings.defaultImageModel as string,
        )
          ? (organizationSettings.defaultImageModel as string)
          : undefined;
      const systemDefaultModel = (await this.routerService.getDefaultModel(
        ModelCategory.IMAGE,
      )) as string;
      model = resolveGenerationDefaultModel<string>({
        brandDefault: brandDefaultModel,
        explicit: userModel,
        organizationDefault: organizationDefaultModel,
        systemDefault: systemDefaultModel,
      });
    }

    // Validate resolved model against org (catches default-resolution bypassing ModelsGuard)
    if (request.context?.organizationId) {
      const authenticatedOrgId = new Types.ObjectId(
        request.context.organizationId,
      );
      await this.modelRegistrationService.validateModelForOrg(
        model,
        authenticatedOrgId,
      );
    }

    // CreditsGuard deferred credit check, do it now with resolved model.
    const reqWithCredits = request as unknown as {
      creditsConfig?: {
        deferred?: boolean;
        amount?: number;
        modelKey?: string;
      };
    };
    if (reqWithCredits.creditsConfig?.deferred) {
      const resolvedModelDoc = await this.modelsService.findOne({
        isDeleted: false,
        key: baseModelKey(model),
      });

      const imgWidth = createImageDto.width || 1920;
      const imgHeight = createImageDto.height || 1080;
      let requiredCredits: number;

      if (resolvedModelDoc) {
        requiredCredits = this.calculateDynamicImageCost(
          resolvedModelDoc,
          imgWidth,
          imgHeight,
        );
      } else {
        requiredCredits = 5; // Fallback default cost
      }

      const hasCredits =
        await this.creditsUtilsService.checkOrganizationCreditsAvailable(
          publicMetadata.organization,
          requiredCredits,
        );
      if (!hasCredits) {
        const balance =
          await this.creditsUtilsService.getOrganizationCreditsBalance(
            publicMetadata.organization,
          );
        throw new HttpException(
          {
            detail: `Insufficient credits: ${requiredCredits} required, ${balance} available`,
            title: 'Insufficient credits',
          },
          HttpStatus.PAYMENT_REQUIRED,
        );
      }
      reqWithCredits.creditsConfig = {
        ...reqWithCredits.creditsConfig,
        amount: requiredCredits,
        deferred: false,
        modelKey: model,
      };
    }

    const replicateModels = [
      MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_3,
      MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4,
      MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4_FAST,
      MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4_ULTRA,
    ];

    const isLeonardoAI = model === MODEL_KEYS.LEONARDOAI;
    const isKlingAI = model === MODEL_KEYS.KLINGAI_V2;
    const isSDXL = model === MODEL_KEYS.SDXL;
    const isGenfeedAi = isGenfeedAiDestination(model);
    const isFal = isFalDestination(model);
    const isKnownReplicateModel = replicateModels.includes(model);
    const isDynamicReplicateDestination = isReplicateDestination(model);
    const isReplicate =
      !isFal &&
      !isGenfeedAi &&
      (isKnownReplicateModel || isDynamicReplicateDestination);

    const brandPromptBranding = buildPromptBrandingFromBrand(brand);

    const width = createImageDto.width || 1920;
    const height = createImageDto.height || 1080;
    const style = createImageDto.style;
    const outputs = Number(createImageDto.outputs) || 1;

    this.loggerService.debug('Image generation request received', {
      model,
      outputs,
      rawOutputs: createImageDto.outputs,
    });

    // Build reference URLs from references array
    const referenceIds: string[] = Array.isArray(createImageDto.references)
      ? createImageDto.references.map((id) => id.toString())
      : [];

    const referenceImageUrls: string[] = await buildReferenceImageUrls({
      assetsService: this.assetsService,
      configService: this.configService,
      ingredientsService: this.ingredientsService,
      loggerService: this.loggerService,
      referenceIds,
    });

    const referenceImageUrl: string | null = referenceImageUrls[0] || null;

    if (
      !isLeonardoAI &&
      !isKlingAI &&
      !isSDXL &&
      !isGenfeedAi &&
      !isFal &&
      !isReplicate
    ) {
      throw new HttpException(
        {
          detail: 'Invalid model for image generation',
          title: 'Validation failed',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const promptData = await this.promptsService.create(
      new PromptEntity({
        brand: isValidObjectId(createImageDto.brand)
          ? new Types.ObjectId(createImageDto.brand)
          : new Types.ObjectId(publicMetadata.brand),
        category: PromptCategory.MODELS_PROMPT_IMAGE,
        model: createImageDto.model as string,
        organization: new Types.ObjectId(publicMetadata.organization),
        original:
          typeof promptOriginal === 'string'
            ? promptOriginal
            : promptOriginal?.toString() || '',
        status: PromptStatus.PROCESSING,
        user: new Types.ObjectId(publicMetadata.user),
      }),
    );

    // Build prompt early to get template tracking info
    const {
      templateUsed: imageTemplateUsed,
      templateVersion: imageTemplateVersion,
    } = await this.promptBuilderService.buildPrompt(
      model,
      {
        blacklist: createImageDto.blacklist,
        brand: {
          description: brand.description,
          label: brand.label,
          primaryColor: brand.primaryColor,
          secondaryColor: brand.secondaryColor,
          text: brand.text,
        },
        branding: brandPromptBranding,
        brandingMode: createImageDto.brandingMode,
        camera: createImageDto.camera,
        fontFamily: createImageDto.fontFamily,
        height,
        isBrandingEnabled: createImageDto.isBrandingEnabled,
        lens: createImageDto.lens,
        lighting: createImageDto.lighting,
        // Use model's category from DB (set by ModelsGuard), fallback to IMAGE
        modelCategory: ModelCategory.IMAGE,
        mood: createImageDto.mood,
        outputs: createImageDto.outputs,
        prompt: promptData.original,
        promptTemplate: createImageDto.promptTemplate,
        references: referenceImageUrls,
        scene: createImageDto.scene,
        seed: createImageDto.seed,
        style: style || createImageDto.style || 'realistic',
        useTemplate: createImageDto.useTemplate,
        width,
      },
      publicMetadata.organization,
    );

    const { metadataData, ingredientData } =
      await this.sharedService.saveDocuments(user, {
        ...createImageDto,
        brand: new Types.ObjectId(brand._id),
        category: IngredientCategory.IMAGE,
        extension: MetadataExtension.JPEG,
        height,
        model,
        organization: new Types.ObjectId(publicMetadata.organization),
        parent: isValidObjectId(createImageDto.parent)
          ? new Types.ObjectId(createImageDto.parent)
          : undefined,
        prompt: new Types.ObjectId(promptData._id),
        // Template tracking
        promptTemplate: imageTemplateUsed,
        style,
        templateVersion: imageTemplateVersion,
        width,
      });

    await this.imagesService.patch(ingredientData._id, {
      prompt: new Types.ObjectId(promptData._id),
    });

    // Create activity for image generation start (after ingredientData is available)
    const activity = await this.activitiesService.create(
      new ActivityEntity({
        brand: new Types.ObjectId(brand._id),
        entityId: ingredientData._id,
        entityModel: ActivityEntityModel.INGREDIENT,
        key: ActivityKey.IMAGE_PROCESSING,
        organization: new Types.ObjectId(publicMetadata.organization),
        source: ActivitySource.IMAGE_GENERATION,
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
      label: 'Image Generation',
      progress: 0,
      room: getUserRoomName(user.id),
      status: 'processing',
      taskId: ingredientData._id.toString(),
      userId: user.id,
    });

    const websocketUrl = WebSocketPaths.image(ingredientData._id);
    const waitForCompletion = createImageDto.waitForCompletion === true;
    const pendingIngredientIds: string[] = [ingredientData._id.toString()];

    if (isGenfeedAi) {
      url = 'ComfyUIService generateImage';

      const generationPromise = (async () => {
        const { imageBuffer } = await this.comfyUIService.generateImage(model, {
          faceImage: referenceImageUrl || undefined,
          height,
          prompt: promptData.original,
          seed: createImageDto.seed,
          width,
        });

        const uploadMeta = await this.filesClientService.uploadToS3(
          ingredientData._id.toString(),
          'images',
          {
            contentType: 'image/png',
            data: imageBuffer,
            type: FileInputType.BUFFER,
          },
        );

        await Promise.all([
          this.metadataService.patch(
            metadataData._id,
            new MetadataEntity({
              height: uploadMeta.height,
              prompt: new Types.ObjectId(promptData._id),
              size: uploadMeta.size,
              width: uploadMeta.width,
            }),
          ),
          this.imagesService.patch(ingredientData._id, {
            cdnUrl: uploadMeta.publicUrl,
            prompt: new Types.ObjectId(promptData._id),
            s3Key: uploadMeta.s3Key,
            status: IngredientStatus.GENERATED,
          }),
          this.websocketService.publishVideoComplete(
            websocketUrl,
            {
              id: ingredientData._id.toString(),
              ingredientId: ingredientData._id.toString(),
              status: 'completed',
            },
            user.id,
            getUserRoomName(user.id),
          ),
        ]);

        return ingredientData._id.toString();
      })().catch(async (error: unknown) => {
        this.loggerService.error(`${url} failed`, error);
        const errorMessage = getErrorMessage(error);

        await this.failedGenerationService.handleFailedImageGeneration(
          this.imagesService,
          ingredientData._id,
          websocketUrl,
          publicMetadata,
          getUserRoomName(user.id),
          errorMessage,
        );
        throw error;
      });

      if (waitForCompletion) {
        await generationPromise;

        const completedIngredient = await this.imagesService.findOne(
          { _id: ingredientData._id },
          [
            PopulatePatterns.promptFull,
            PopulatePatterns.metadataFull,
            PopulatePatterns.brandMinimal,
          ],
        );

        return serializeSingle(
          request,
          IngredientSerializer,
          completedIngredient,
        );
      }

      generationPromise.catch(() => {
        // Error already handled in the catch block above
      });
    }

    // Kling AI
    if (isKlingAI) {
      url = 'KlingAIService generateImage';

      // Create async generation promise - don't await unless waitForCompletion
      const generationPromise = this.klingAIService
        .queueGenerateImage(promptData.original, {
          ...createImageDto,
          height,
          model,
          reference: referenceImageUrl || undefined,
          style: style || 'realistic',
          width,
        })
        .then(async (generationId) => {
          if (!generationId) {
            throw new Error('No generation ID returned from KlingAI');
          }

          await this.metadataService.patch(
            metadataData._id,
            new MetadataEntity({
              externalId: generationId,
              prompt: new Types.ObjectId(promptData._id),
            }),
          );

          return generationId;
        })
        .catch(async (error: unknown) => {
          this.loggerService.error(`${url} failed`, error);
          const errorMessage = getErrorMessage(error);

          await this.failedGenerationService.handleFailedImageGeneration(
            this.imagesService,
            ingredientData._id,
            websocketUrl,
            publicMetadata,
            getUserRoomName(user.id),
            errorMessage,
          );
          throw error;
        });

      if (waitForCompletion) {
        // Wait for the generation to complete
        try {
          await generationPromise;

          const completedIngredient =
            await this.pollingService.waitForIngredientCompletion(
              ingredientData._id.toString(),
              180000, // 3 minutes timeout
              2000, // 2 seconds poll interval
              [
                PopulatePatterns.promptFull,
                PopulatePatterns.metadataFull,
                PopulatePatterns.brandMinimal,
              ],
            );

          return serializeSingle(
            request,
            IngredientSerializer,
            completedIngredient,
          );
        } catch (error: unknown) {
          if (error instanceof Error && error.name === 'PollingTimeoutError') {
            const ingredient = await this.imagesService.findOne(
              { _id: ingredientData._id },
              [
                PopulatePatterns.promptFull,
                PopulatePatterns.metadataFull,
                PopulatePatterns.brandMinimal,
              ],
            );

            if (ingredient) {
              throw new HttpException(
                {
                  detail: `Image generation did not complete within 3 minutes. Current status: ${ingredient.status}`,
                  title: 'Generation timeout',
                },
                HttpStatus.GATEWAY_TIMEOUT,
              );
            }
          }
          throw error;
        }
      } else {
        // Return immediately - generation runs in background
        // Attach empty catch to prevent unhandled promise rejection
        generationPromise.catch(() => {
          // Error already handled in the catch block above
        });
      }
    }

    if (isFal) {
      url = 'FalService generateImage';

      const buildFalInput = (): Record<string, unknown> => ({
        image_size: {
          height,
          width,
        },
        ...(referenceImageUrl ? { image_url: referenceImageUrl } : {}),
        ...(createImageDto.seed !== undefined
          ? { seed: createImageDto.seed }
          : {}),
        prompt: promptData.original,
      });

      const generationPromise = (async () => {
        const falResult = await this.falService.generateImage(
          model,
          buildFalInput(),
        );

        await this.metadataService.patch(
          metadataData._id,
          new MetadataEntity({
            externalId: falResult.url,
            prompt: new Types.ObjectId(promptData._id),
          }),
        );

        for (let i = 1; i < outputs; i++) {
          const {
            metadataData: additionalMetadata,
            ingredientData: additionalIngredient,
          } = await this.sharedService.saveDocuments(user, {
            ...createImageDto,
            brand: new Types.ObjectId(brand._id),
            category: IngredientCategory.IMAGE,
            extension: MetadataExtension.JPG,
            model,
            organization: new Types.ObjectId(publicMetadata.organization),
            parent: ingredientData.parent,
            prompt: new Types.ObjectId(promptData._id),
            status: IngredientStatus.PROCESSING,
          });

          const additionalResult = await this.falService.generateImage(
            model,
            buildFalInput(),
          );

          await Promise.all([
            this.metadataService.patch(
              additionalMetadata._id,
              new MetadataEntity({
                externalId: additionalResult.url,
                prompt: new Types.ObjectId(promptData._id),
              }),
            ),
            this.imagesService.patch(additionalIngredient._id, {
              prompt: new Types.ObjectId(promptData._id),
            }),
          ]);

          const additionalActivity = await this.activitiesService.create(
            new ActivityEntity({
              brand: new Types.ObjectId(brand._id),
              entityId: additionalIngredient._id,
              entityModel: ActivityEntityModel.INGREDIENT,
              key: ActivityKey.IMAGE_PROCESSING,
              organization: new Types.ObjectId(publicMetadata.organization),
              source: ActivitySource.IMAGE_GENERATION,
              user: new Types.ObjectId(publicMetadata.user),
              value: JSON.stringify({
                ingredientId: additionalIngredient._id.toString(),
                model,
                type: 'generation',
              }),
            }),
          );

          await this.websocketService.publishBackgroundTaskUpdate({
            activityId: additionalActivity._id.toString(),
            label: 'Image Generation',
            progress: 0,
            room: getUserRoomName(user.id),
            status: 'processing',
            taskId: additionalIngredient._id.toString(),
            userId: user.id,
          });

          pendingIngredientIds.push(additionalIngredient._id.toString());
        }

        return falResult.url;
      })().catch(async (error: unknown) => {
        this.loggerService.error(`${url} failed`, error);
        const errorMessage = getErrorMessage(error);

        await this.failedGenerationService.handleFailedImageGeneration(
          this.imagesService,
          ingredientData._id,
          websocketUrl,
          publicMetadata,
          getUserRoomName(user.id),
          errorMessage,
        );
        throw error;
      });

      generationPromise.catch(() => {
        // Error already handled in the catch block above
      });
    }

    // Leonardo
    if (isLeonardoAI) {
      url = 'LeonardoAIService generateImage';

      // Create async generation promise - don't await unless waitForCompletion
      const generationPromise = this.leonardoaiService
        .generateImage(promptData.original, {
          ...createImageDto,
          height,
          style: style || 'realistic',
          width,
        })
        .then(async (generationId) => {
          if (!generationId) {
            throw new Error('No generation ID returned from LeonardoAI');
          }

          await this.metadataService.patch(
            metadataData._id,
            new MetadataEntity({
              externalId: generationId,
            }),
          );

          return generationId;
        })
        .catch(async (error: unknown) => {
          this.loggerService.error(`${url} failed`, error);
          const errorMessage = getErrorMessage(error);

          await this.failedGenerationService.handleFailedImageGeneration(
            this.imagesService,
            ingredientData._id,
            websocketUrl,
            publicMetadata,
            getUserRoomName(user.id),
            errorMessage,
          );
          throw error;
        });

      if (waitForCompletion) {
        // Wait for the generation to complete
        try {
          await generationPromise;

          const completedIngredient =
            await this.pollingService.waitForIngredientCompletion(
              ingredientData._id.toString(),
              180000, // 3 minutes timeout
              2000, // 2 seconds poll interval
              [
                PopulatePatterns.promptFull,
                PopulatePatterns.metadataFull,
                PopulatePatterns.brandMinimal,
              ],
            );

          return serializeSingle(
            request,
            IngredientSerializer,
            completedIngredient,
          );
        } catch (error: unknown) {
          if (error instanceof Error && error.name === 'PollingTimeoutError') {
            const ingredient = await this.imagesService.findOne(
              { _id: ingredientData._id },
              [
                PopulatePatterns.promptFull,
                PopulatePatterns.metadataFull,
                PopulatePatterns.brandMinimal,
              ],
            );

            if (ingredient) {
              throw new HttpException(
                {
                  detail: `Image generation did not complete within 3 minutes. Current status: ${ingredient.status}`,
                  title: 'Generation timeout',
                },
                HttpStatus.GATEWAY_TIMEOUT,
              );
            }
          }
          throw error;
        }
      } else {
        // Return immediately - generation runs in background
        // Attach empty catch to prevent unhandled promise rejection
        generationPromise.catch(() => {
          // Error already handled in the catch block above
        });
      }
    }

    if (isReplicate) {
      url = 'ReplicateService generateImage';

      // Build provider-specific prompt using universal prompt builder with template support
      // NOTE: This must complete before we can start generation
      const { input: promptParams } =
        await this.promptBuilderService.buildPrompt(
          model,
          {
            blacklist: createImageDto.blacklist,
            brand: {
              description: brand.description,
              label: brand.label,
              primaryColor: brand.primaryColor,
              secondaryColor: brand.secondaryColor,
              text: brand.text,
            },
            branding: brandPromptBranding,
            brandingMode: createImageDto.brandingMode,
            camera: createImageDto.camera,
            fontFamily: createImageDto.fontFamily,
            height,
            isBrandingEnabled: createImageDto.isBrandingEnabled,
            lens: createImageDto.lens,
            lighting: createImageDto.lighting,
            // Use model's category from DB (set by ModelsGuard), fallback to IMAGE
            modelCategory: ModelCategory.IMAGE,
            mood: createImageDto.mood,
            outputs,
            prompt: promptData.original,
            // Template support
            promptTemplate: createImageDto.promptTemplate,
            references: referenceImageUrls,
            scene: createImageDto.scene,
            seed: createImageDto.seed,
            style: style || createImageDto.style || 'realistic',
            tags: createImageDto.tags?.map((tag) => tag.toString()) || [],
            useTemplate: createImageDto.useTemplate,
            width,
          },
          publicMetadata.organization,
        );

      const destination = model;
      const modelCapability = MODEL_OUTPUT_CAPABILITIES[destination];
      const isBatchSupported = modelCapability?.isBatchSupported ?? false;

      // Track all placeholder ingredient IDs - start with first one
      const replicatePendingIngredientIds: string[] = [
        ingredientData._id.toString(),
      ];

      // Create async generation promise - don't await unless waitForCompletion
      const generationPromise = this.replicateService
        .generateTextToImage(destination, promptParams)
        .then(async (generationId) => {
          if (!generationId) {
            throw new Error('No generation ID returned from Replicate');
          }

          // Handle multiple outputs differently for batch-capable models vs others
          if (isBatchSupported && outputs > 1) {
            // Batch-capable models: single API call with num_outputs
            await this.metadataService.patch(
              metadataData._id,
              new MetadataEntity({
                externalId: `${generationId}_0`,
              }),
            );

            // Create additional placeholder documents for remaining outputs
            const additionalDocuments = await Promise.all(
              Array.from({ length: outputs - 1 }, () => {
                return this.sharedService.saveDocuments(user, {
                  ...createImageDto,
                  brand: new Types.ObjectId(brand._id),
                  category: IngredientCategory.IMAGE,
                  extension: MetadataExtension.JPG,
                  model,
                  organization: new Types.ObjectId(publicMetadata.organization),
                  parent: ingredientData.parent,
                  prompt: new Types.ObjectId(promptData._id),
                  status: IngredientStatus.PROCESSING,
                });
              }),
            );

            // Update metadata and images in parallel
            await Promise.all(
              additionalDocuments.flatMap(
                (
                  { metadataData: addMeta, ingredientData: addIngredient },
                  index,
                ) => {
                  const i = index + 1;
                  return [
                    this.metadataService.patch(
                      addMeta._id,
                      new MetadataEntity({
                        externalId: `${generationId}_${i}`,
                      }),
                    ),
                    this.imagesService.patch(addIngredient._id, {
                      prompt: new Types.ObjectId(promptData._id),
                    }),
                  ];
                },
              ),
            );

            // Create activities for each additional placeholder (batch model path)
            await Promise.all(
              additionalDocuments.map(({ ingredientData: addIngredient }) =>
                this.activitiesService
                  .create(
                    new ActivityEntity({
                      brand: new Types.ObjectId(brand._id),
                      entityId: addIngredient._id,
                      entityModel: ActivityEntityModel.INGREDIENT,
                      key: ActivityKey.IMAGE_PROCESSING,
                      organization: new Types.ObjectId(
                        publicMetadata.organization,
                      ),
                      source: ActivitySource.IMAGE_GENERATION,
                      user: new Types.ObjectId(publicMetadata.user),
                      value: JSON.stringify({
                        ingredientId: addIngredient._id.toString(),
                        model,
                        type: 'generation',
                      }),
                    }),
                  )
                  .then((newActivity) =>
                    this.websocketService.publishBackgroundTaskUpdate({
                      activityId: newActivity._id.toString(),
                      label: 'Image Generation',
                      progress: 0,
                      room: getUserRoomName(user.id),
                      status: 'processing',
                      taskId: addIngredient._id.toString(),
                      userId: user.id,
                    }),
                  ),
              ),
            );

            // Push additional ingredient IDs to tracking array for polling
            additionalDocuments.forEach(({ ingredientData: addIngredient }) => {
              replicatePendingIngredientIds.push(addIngredient._id.toString());
            });

            this.loggerService.log(
              'Created multiple placeholders for batch-capable model multi-output',
              {
                generationId,
                isBatchSupported: true,
                model: destination,
                outputs,
              },
            );
          } else if (outputs > 1) {
            // Non-batch models: make multiple separate API calls
            await this.metadataService.patch(
              metadataData._id,
              new MetadataEntity({
                externalId: generationId,
              }),
            );

            // Make additional API calls for remaining outputs
            // NOTE: Sequential because each needs unique generationId
            for (let i = 1; i < outputs; i++) {
              const {
                metadataData: additionalMetadata,
                ingredientData: additionalIngredient,
              } = await this.sharedService.saveDocuments(user, {
                ...createImageDto,
                brand: new Types.ObjectId(brand._id),
                category: IngredientCategory.IMAGE,
                extension: MetadataExtension.JPG,
                model,
                organization: new Types.ObjectId(publicMetadata.organization),
                parent: ingredientData.parent,
                prompt: new Types.ObjectId(promptData._id),
                status: IngredientStatus.PROCESSING,
              });

              // Make separate API call for each output
              const additionalGenerationId =
                await this.replicateService.generateTextToImage(
                  destination,
                  promptParams,
                );

              await Promise.all([
                this.metadataService.patch(
                  additionalMetadata._id,
                  new MetadataEntity({
                    externalId: additionalGenerationId,
                  }),
                ),
                this.imagesService.patch(additionalIngredient._id, {
                  prompt: new Types.ObjectId(promptData._id),
                }),
              ]);

              // Create activity for this additional output (non-batch path)
              const additionalActivity = await this.activitiesService.create(
                new ActivityEntity({
                  brand: new Types.ObjectId(brand._id),
                  entityId: additionalIngredient._id,
                  entityModel: ActivityEntityModel.INGREDIENT,
                  key: ActivityKey.IMAGE_PROCESSING,
                  organization: new Types.ObjectId(publicMetadata.organization),
                  source: ActivitySource.IMAGE_GENERATION,
                  user: new Types.ObjectId(publicMetadata.user),
                  value: JSON.stringify({
                    ingredientId: additionalIngredient._id.toString(),
                    model,
                    type: 'generation',
                  }),
                }),
              );

              await this.websocketService.publishBackgroundTaskUpdate({
                activityId: additionalActivity._id.toString(),
                label: 'Image Generation',
                progress: 0,
                room: getUserRoomName(user.id),
                status: 'processing',
                taskId: additionalIngredient._id.toString(),
                userId: user.id,
              });

              // Push this additional ingredient ID to tracking array for polling
              replicatePendingIngredientIds.push(
                additionalIngredient._id.toString(),
              );
            }

            this.loggerService.log(
              'Created multiple API calls for non-batch model multi-output',
              {
                isBatchSupported: false,
                model: destination,
                outputs,
              },
            );
          } else {
            // Single output - use original external ID
            await this.metadataService.patch(
              metadataData._id,
              new MetadataEntity({
                externalId: generationId,
              }),
            );
          }

          return generationId;
        })
        .catch(async (error: unknown) => {
          this.loggerService.error(`${url} failed`, error);
          const errorMessage = getErrorMessage(error);

          await this.failedGenerationService.handleFailedImageGeneration(
            this.imagesService,
            ingredientData._id,
            websocketUrl,
            publicMetadata,
            getUserRoomName(user.id),
            errorMessage,
          );
          throw error;
        });

      if (waitForCompletion) {
        // Wait for the generation to complete
        try {
          await generationPromise;

          const completedIngredients =
            await this.pollingService.waitForMultipleIngredientsCompletion(
              replicatePendingIngredientIds,
              180_000, // 3 minutes timeout
              2_000, // 2 seconds poll interval
              [
                PopulatePatterns.promptFull,
                PopulatePatterns.metadataFull,
                PopulatePatterns.brandMinimal,
              ],
            );

          return serializeSingle(
            request,
            IngredientSerializer,
            completedIngredients[0],
          );
        } catch (error: unknown) {
          if (error instanceof Error && error.name === 'PollingTimeoutError') {
            const ingredient = await this.imagesService.findOne(
              { _id: ingredientData._id },
              [
                PopulatePatterns.promptFull,
                PopulatePatterns.metadataFull,
                PopulatePatterns.brandMinimal,
              ],
            );

            if (ingredient) {
              throw new HttpException(
                {
                  detail: `Image generation did not complete within 3 minutes. Current status: ${ingredient.status}`,
                  title: 'Generation timeout',
                },
                HttpStatus.GATEWAY_TIMEOUT,
              );
            }
          }
          throw error;
        }
      } else {
        // Return immediately - generation runs in background
        // Attach empty catch to prevent unhandled promise rejection
        generationPromise.catch(() => {
          // Error already handled in the catch block above
        });
      }
    }

    // For non-Replicate providers, handle waitForCompletion if needed
    if (
      waitForCompletion &&
      !isKlingAI &&
      !isLeonardoAI &&
      !isFal &&
      !isReplicate
    ) {
      // This shouldn't happen, but handle it gracefully
      this.loggerService.warn(
        'waitForCompletion requested for unsupported provider',
        {
          ingredientId: ingredientData._id,
          model,
        },
      );
    }

    // For non-Replicate providers, return single ID
    return serializeSingle(request, IngredientSerializer, {
      ...ingredientData,
      pendingIngredientIds,
    });
  }

  /**
   * Split a contact sheet image into individual frames and save them as ingredients
   */
  @Post(':id/split')
  @SetMetadata('roles', [
    'superadmin',
    MemberRole.OWNER,
    MemberRole.ADMIN,
    MemberRole.CREATOR,
  ])
  @RateLimit({ limit: 10, scope: 'organization', windowMs: 60 * 1000 })
  @LogMethod({ logEnd: true, logError: true, logStart: true })
  async splitContactSheet(
    @Req() _request: Request,
    @Param('id') id: string,
    @Body() splitImageDto: SplitImageDto,
    @CurrentUser() user: User,
  ): Promise<{
    data: { frames: Array<{ id: string; url: string; index: number }> };
  }> {
    const publicMetadata = getPublicMetadata(user);

    if (!isValidObjectId(id)) {
      throw new HttpException(
        {
          detail: 'The provided image ID is not valid',
          title: 'Invalid ID',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // Fetch the source image with metadata populated
    const sourceImage = await this.imagesService.findOne(
      {
        _id: new Types.ObjectId(id),
        isDeleted: false,
        organization: new Types.ObjectId(publicMetadata.organization),
      },
      [PopulatePatterns.metadataFull],
    );

    if (!sourceImage) {
      throw new HttpException(
        {
          detail:
            'The specified image was not found or you do not have access to it',
          title: 'Image not found',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    // Extract metadata fields from source image to preserve in split frames
    const sourceMetadata = sourceImage.metadata as unknown as Record<
      string,
      unknown
    >;
    const metadataFields: Record<string, unknown> = {
      // Copy model, style, extension, prompt from source
      ...(sourceMetadata?.model ? { model: sourceMetadata.model } : {}),
      ...(sourceMetadata?.style ? { style: sourceMetadata.style } : {}),
      ...(sourceMetadata?.extension
        ? { extension: sourceMetadata.extension }
        : {}),
      ...(sourceMetadata?.prompt
        ? // @ts-expect-error TS2769
          { prompt: new Types.ObjectId(sourceMetadata.prompt) }
        : {}),
      ...(sourceMetadata?.assistant
        ? { assistant: sourceMetadata.assistant }
        : {}),
      ...(sourceMetadata?.seed !== undefined
        ? { seed: sourceMetadata.seed }
        : {}),
      ...(sourceMetadata?.externalId
        ? { externalId: sourceMetadata.externalId }
        : {}),
      ...(sourceMetadata?.externalProvider
        ? { externalProvider: sourceMetadata.externalProvider }
        : {}),
    };

    // Get the image URL from CDN
    const imageUrl = `${this.configService.ingredientsEndpoint}/images/${id}`;

    this.loggerService.log('Splitting contact sheet', {
      borderInset: splitImageDto.borderInset,
      gridCols: splitImageDto.gridCols,
      gridRows: splitImageDto.gridRows,
      sourceImageId: id,
    });

    // Call files microservice to split the image
    const { frames } = await this.filesClientService.splitImage(
      imageUrl,
      splitImageDto.gridRows,
      splitImageDto.gridCols,
      splitImageDto.borderInset,
    );

    this.loggerService.log(`Split into ${frames.length} frames`);

    // Find or create "splitted" tag
    let splittedTag = await this.tagsService.findOne({
      category: TagCategory.INGREDIENT,
      isDeleted: false,
      key: TagKey.SPLITTED,
      organization: new Types.ObjectId(publicMetadata.organization),
    });

    if (!splittedTag) {
      splittedTag = await this.tagsService.create({
        category: TagCategory.INGREDIENT,
        key: TagKey.SPLITTED,
        label: 'Splitted',
        organization: new Types.ObjectId(publicMetadata.organization),
      } as unknown as CreateTagDto);
    }

    // Create ingredients for each frame
    const frameResults: Array<{ id: string; url: string; index: number }> = [];

    for (let i = 0; i < frames.length; i++) {
      const frameBuffer = frames[i];

      // Get frame dimensions from buffer metadata
      const frameMetadata = await sharp(frameBuffer).metadata();
      const frameWidth = frameMetadata.width || 0;
      const frameHeight = frameMetadata.height || 0;

      // Create ingredient and metadata for this frame, preserving source metadata
      const { ingredientData } = await this.sharedService.saveDocuments(user, {
        brand: sourceImage.brand,
        category: IngredientCategory.IMAGE,
        extension: metadataFields.extension || MetadataExtension.JPEG,
        label: `Frame ${i + 1}`,
        organization: new Types.ObjectId(publicMetadata.organization),
        parent: new Types.ObjectId(id),
        status: IngredientStatus.GENERATED,
        // Preserve metadata fields from source image
        ...metadataFields,
        height: frameHeight,
        // Add "splitted" tag
        tags: [new Types.ObjectId(splittedTag._id)],
        // Set frame-specific dimensions from actual buffer metadata
        width: frameWidth,
      });

      // Upload frame to S3
      await this.filesClientService.uploadToS3(
        ingredientData._id.toString(),
        'images',
        {
          contentType: 'image/jpeg',
          data: frameBuffer,
          type: FileInputType.BUFFER,
        },
      );

      // Update status
      await this.imagesService.patch(ingredientData._id, {
        status: IngredientStatus.GENERATED,
      });

      frameResults.push({
        id: ingredientData._id.toString(),
        index: i,
        url: `${this.configService.ingredientsEndpoint}/images/${ingredientData._id}`,
      });
    }

    // Create activity for the split operation
    await this.activitiesService.create(
      new ActivityEntity({
        brand: sourceImage.brand,
        key: ActivityKey.IMAGE_GENERATED,
        organization: new Types.ObjectId(publicMetadata.organization),
        source: ActivitySource.IMAGE_GENERATION,
        user: new Types.ObjectId(publicMetadata.user),
        value: JSON.stringify({
          frameCount: frameResults.length,
          frameIds: frameResults.map((f) => f.id),
          sourceImageId: id,
          type: 'contact-sheet-split',
        }),
      }),
    );

    this.loggerService.log('Contact sheet split complete', {
      frameCount: frameResults.length,
      sourceImageId: id,
    });

    return {
      data: {
        frames: frameResults,
      },
    };
  }

  /**
   * Calculate dynamic image cost based on model pricing type.
   * Mirrors the CreditsGuard.calculateDynamicCost logic for image models.
   */
  private calculateDynamicImageCost(
    model: {
      cost?: number;
      pricingType?: PricingType;
      costPerUnit?: number;
      minCost?: number;
    },
    width: number,
    height: number,
  ): number {
    const pricingType = model.pricingType || PricingType.FLAT;
    let baseCost = model.cost || 0;

    if (
      pricingType === PricingType.PER_MEGAPIXEL &&
      width &&
      height &&
      model.costPerUnit
    ) {
      const megapixels = (width * height) / 1_000_000;
      baseCost = Math.ceil(megapixels * model.costPerUnit);
    }

    const minCost = model.minCost || 0;
    if (minCost > 0 && baseCost < minCost) {
      baseCost = minCost;
    }

    return baseCost;
  }
}
