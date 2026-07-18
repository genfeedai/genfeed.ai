import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AssetsService } from '@api/collections/assets/services/assets.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { buildPromptBrandingFromBrand } from '@api/collections/brands/utils/brand-context.util';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { CreateImageDto } from '@api/collections/images/dto/create-image.dto';
import type {
  ImageGenerationCompletionPlan,
  ImageGenerationContext,
  ImageGenerationProvider,
  ImageGenerationPublicMetadata,
  ImageGenerationResolvedBrand,
  ImageGenerationResolvedPrompt,
  ImageGenerationSavedIngredient,
  ImageGenerationSavedMetadata,
} from '@api/collections/images/services/image-generation.types';
import { ImageGenerationProviderDispatchService } from '@api/collections/images/services/image-generation-provider-dispatch.service';
import { ImagesService } from '@api/collections/images/services/images.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { ModelRegistrationService } from '@api/collections/models/services/model-registration.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import {
  baseModelKey,
  isFalDestination,
  isGenfeedAiDestination,
  isReplicateDestination,
} from '@api/collections/models/utils/model-key.util';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { PromptEntity } from '@api/collections/prompts/entities/prompt.entity';
import { PromptsService } from '@api/collections/prompts/services/prompts.service';
import type { RequestWithContext as Request } from '@api/common/middleware/request-context.middleware';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import { resolveGenerationDefaultModel } from '@api/helpers/utils/generation-defaults/generation-defaults.util';
import { buildReferenceImageUrls } from '@api/helpers/utils/reference/reference.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { RouterService } from '@api/services/router/router.service';
import { IngredientCompletionService } from '@api/shared/services/poll-until/ingredient-completion.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import { MODEL_KEYS, MODEL_OUTPUT_CAPABILITIES } from '@genfeedai/constants';
import {
  IngredientCategory,
  MetadataExtension,
  ModelCategory,
  PricingType,
  PromptCategory,
  PromptStatus,
} from '@genfeedai/enums';
import type { JsonApiSingleResponse } from '@genfeedai/interfaces';
import { IngredientSerializer } from '@genfeedai/serializers';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PollTimeoutException } from '@server/shared/services/poll-until/poll-until.exception';

/** Populate patterns for every image read on the wait/serialize path. */
const IMAGE_POPULATE = [
  PopulatePatterns.promptFull,
  PopulatePatterns.metadataFull,
  PopulatePatterns.brandMinimal,
];

/**
 * Owns the full image-generation workflow extracted out of
 * `ImagesOperationsController`.
 *
 * The controller keeps the HTTP surface (decorators, guards, interceptors) and
 * delegates the request body to {@link generateImage}. This service resolves the
 * model, runs the deferred credit check, builds prompts, persists placeholder
 * documents, dispatches to the correct provider through a single dispatch map,
 * and finishes the request via one shared completion tail — collapsing the
 * previously copy-pasted failure-handler, poll-and-serialize, and timeout
 * recovery blocks to a single call site each.
 */
@Injectable()
export class ImageGenerationService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly assetsService: AssetsService,
    private readonly brandsService: BrandsService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly ingredientCompletionService: IngredientCompletionService,
    private readonly imageGenerationProviderDispatchService: ImageGenerationProviderDispatchService,
    private readonly imagesService: ImagesService,
    private readonly ingredientsService: IngredientsService,
    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly loggerService: LoggerService,
    private readonly modelRegistrationService: ModelRegistrationService,
    private readonly modelsService: ModelsService,
    private readonly promptBuilderService: PromptBuilderService,
    private readonly promptsService: PromptsService,
    private readonly routerService: RouterService,
    private readonly sharedService: SharedService,
  ) {}

  async generateImage(
    user: User,
    createImageDto: CreateImageDto,
    request: Request,
  ): Promise<JsonApiSingleResponse> {
    const { brand, model, promptOriginalText, provider, publicMetadata } =
      await this.resolveAndValidate(user, createImageDto, request);

    const brandPromptBranding = buildPromptBrandingFromBrand(brand);
    const promptBuilderBrand = {
      description: brand.description ?? undefined,
      label: brand.label ?? 'Brand',
      primaryColor: brand.primaryColor ?? undefined,
      secondaryColor: brand.secondaryColor ?? undefined,
      text: brand.text ?? undefined,
    };

    const width = createImageDto.width || 1920;
    const height = createImageDto.height || 1080;
    const style = createImageDto.style;
    const outputs = Number(createImageDto.outputs) || 1;

    this.loggerService.debug('Image generation request received', {
      model,
      outputs,
      rawOutputs: createImageDto.outputs,
    });

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

    const { promptData, metadataData, ingredientData } =
      await this.persistImageDocuments({
        brand,
        brandPromptBranding,
        createImageDto,
        height,
        model,
        promptBuilderBrand,
        promptOriginalText,
        publicMetadata,
        referenceImageUrls,
        style,
        user,
        width,
      });

    const websocketUrl = WebSocketPaths.image(ingredientData.id);

    const context: ImageGenerationContext = {
      brand,
      brandPromptBranding,
      createImageDto,
      height,
      ingredientData,
      metadataData,
      model,
      outputs,
      pendingIngredientIds: [ingredientData.id.toString()],
      promptBuilderBrand,
      promptData,
      publicMetadata,
      referenceImageUrl,
      referenceImageUrls,
      request,
      style,
      user,
      waitForCompletion: createImageDto.waitForCompletion === true,
      websocketUrl,
      width,
    };

    // Create activity + websocket update for image generation start
    await this.imageGenerationProviderDispatchService.createPlaceholderActivity(
      context,
      ingredientData.id,
    );

    const plan = await this.imageGenerationProviderDispatchService.dispatch(
      context,
      provider,
    );

    return this.finishGeneration(context, plan);
  }

  /**
   * Validate the request and resolve the brand, model, and target provider.
   * Throws BAD_REQUEST (missing prompt / unknown provider), FORBIDDEN (brand)
   * or PAYMENT_REQUIRED (deferred credits) exactly as the original handler did.
   */
  private async resolveAndValidate(
    user: User,
    createImageDto: CreateImageDto,
    request: Request,
  ): Promise<{
    brand: ImageGenerationResolvedBrand;
    model: string;
    promptOriginalText: string;
    provider: ImageGenerationProvider;
    publicMetadata: ImageGenerationPublicMetadata;
  }> {
    this.loggerService.log(`${this.constructorName} create`, {
      ...createImageDto,
    });
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
    const promptOriginalText =
      typeof promptOriginal === 'string'
        ? promptOriginal
        : String(promptOriginal ?? '');

    const brandId = createImageDto.brand || publicMetadata.brand;
    const brand = await this.brandsService.findOne({
      _id: brandId,
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

    const organizationSettings = await this.organizationSettingsService.findOne(
      {
        isDeleted: false,
        organization: publicMetadata.organization,
      },
    );

    const model = await this.resolveImageModel(
      createImageDto,
      promptOriginalText,
      brand,
      organizationSettings,
    );

    // Validate resolved model against org (catches default-resolution bypassing
    // ModelsGuard). Prefer the verified token org so validation still runs when
    // request-context middleware did not populate organizationId; only
    // single-tenant deployments (no org at all) skip it.
    const validationOrgId =
      publicMetadata.organization || request.context?.organizationId;
    if (validationOrgId) {
      await this.modelRegistrationService.validateModelForOrg(
        model,
        validationOrgId,
      );
    }

    await this.ensureDeferredCredits(
      createImageDto,
      model,
      publicMetadata.organization,
      request,
    );

    const provider = this.classifyProvider(model);
    if (!provider) {
      throw new HttpException(
        {
          detail: 'Invalid model for image generation',
          title: 'Validation failed',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    return { brand, model, promptOriginalText, provider, publicMetadata };
  }

  /**
   * Create the prompt document, run the template-tracking prompt build, persist
   * the placeholder ingredient/metadata pair, and link the prompt. Returns the
   * documents the generation flow operates on.
   */
  private async persistImageDocuments(params: {
    brand: ImageGenerationResolvedBrand;
    brandPromptBranding: ReturnType<typeof buildPromptBrandingFromBrand>;
    createImageDto: CreateImageDto;
    height: number;
    model: string;
    promptBuilderBrand: ImageGenerationContext['promptBuilderBrand'];
    promptOriginalText: string;
    publicMetadata: ImageGenerationPublicMetadata;
    referenceImageUrls: string[];
    style?: string;
    user: User;
    width: number;
  }): Promise<{
    ingredientData: ImageGenerationSavedIngredient;
    metadataData: ImageGenerationSavedMetadata;
    promptData: ImageGenerationResolvedPrompt;
  }> {
    const {
      brand,
      brandPromptBranding,
      createImageDto,
      height,
      model,
      promptBuilderBrand,
      promptOriginalText,
      publicMetadata,
      referenceImageUrls,
      style,
      user,
      width,
    } = params;

    const promptData = await this.promptsService.create(
      new PromptEntity({
        brand: isEntityId(createImageDto.brand)
          ? createImageDto.brand
          : publicMetadata.brand,
        category: PromptCategory.MODELS_PROMPT_IMAGE,
        model,
        organization: publicMetadata.organization,
        original: promptOriginalText,
        status: PromptStatus.PROCESSING,
        user: publicMetadata.user,
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
        brand: promptBuilderBrand,
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
        brand: brand.id,
        category: IngredientCategory.IMAGE,
        extension: MetadataExtension.JPEG,
        height,
        model,
        organization: publicMetadata.organization,
        parent: isEntityId(createImageDto.parent)
          ? createImageDto.parent
          : undefined,
        prompt: promptData.id,
        // Template tracking
        promptTemplate: imageTemplateUsed,
        style,
        templateVersion: imageTemplateVersion,
        width,
      });

    await this.imagesService.patch(ingredientData.id, {
      prompt: promptData.id,
    });

    return { ingredientData, metadataData, promptData };
  }

  /**
   * Resolve the model for an image-generation request.
   * Precedence: auto-select > user-provided > brand default > org default >
   * system default.
   */
  private async resolveImageModel(
    createImageDto: CreateImageDto,
    promptOriginalText: string,
    brand: ImageGenerationResolvedBrand,
    organizationSettings: { defaultImageModel?: unknown } | null,
  ): Promise<string> {
    if (createImageDto.autoSelectModel) {
      // Auto model routing - let RouterService pick the best model
      const recommendation = await this.routerService.selectModel({
        category: ModelCategory.IMAGE,
        dimensions: {
          height: createImageDto.height,
          width: createImageDto.width,
        },
        outputs: createImageDto.outputs,
        prioritize: createImageDto.prioritize || 'balanced',
        prompt: promptOriginalText,
      });

      this.loggerService.log('Auto model routing selected', {
        promptPreview: promptOriginalText.substring(0, 100),
        reason: recommendation.reason,
        selectedModel: recommendation.selectedModel,
        service: this.constructorName,
      });

      return recommendation.selectedModel as string;
    }

    // Manual selection: user-provided > brand default > system default
    const modelKeys = Object.values(MODEL_KEYS) as string[];
    const userModel =
      createImageDto.model && modelKeys.includes(createImageDto.model as string)
        ? (createImageDto.model as string)
        : undefined;
    const brandDefaultModel =
      brand.defaultImageModel &&
      modelKeys.includes(brand.defaultImageModel as string)
        ? (brand.defaultImageModel as string)
        : undefined;
    const organizationDefaultModel =
      organizationSettings?.defaultImageModel &&
      modelKeys.includes(organizationSettings.defaultImageModel as string)
        ? (organizationSettings.defaultImageModel as string)
        : undefined;
    const systemDefaultModel = (await this.routerService.getDefaultModel(
      ModelCategory.IMAGE,
    )) as string;
    return resolveGenerationDefaultModel<string>({
      brandDefault: brandDefaultModel,
      explicit: userModel,
      organizationDefault: organizationDefaultModel,
      systemDefault: systemDefaultModel,
    });
  }

  /**
   * Run the deferred credit check (CreditsGuard defers it until the model is
   * resolved) and rewrite the request's credits config with the resolved amount.
   */
  private async ensureDeferredCredits(
    createImageDto: CreateImageDto,
    model: string,
    organization: string,
    request: Request,
  ): Promise<void> {
    const reqWithCredits = request as unknown as {
      creditsConfig?: {
        deferred?: boolean;
        amount?: number;
        modelKey?: string;
      };
    };
    if (!reqWithCredits.creditsConfig?.deferred) {
      return;
    }

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

    // This route always defers (CreditsGuard defers until the model resolves),
    // so this is the sole authorizer and must charge for the real number of
    // billable provider calls — the single figure CreditsInterceptor deducts on
    // success. `calculateDynamicImageCost` returns the per-output base. Only the
    // providers that fan out into one provider call per output multiply: Fal
    // always loops per output, and non-batch Replicate makes a separate call per
    // output. Batch-capable Replicate yields N images in one call, and the
    // single-output providers (genfeedai/klingai/leonardo/sdxl) ignore `outputs`
    // entirely, so neither multiplies. Mirrors the videos hardening in #853 and
    // matches the dispatch logic below.
    const requestedOutputs = Number(createImageDto.outputs) || 1;
    if (requestedOutputs > 1) {
      const provider = this.classifyProvider(model);
      const isBatchSupported =
        MODEL_OUTPUT_CAPABILITIES[model]?.isBatchSupported ?? false;
      const fansOutPerOutput =
        provider === 'fal' || (provider === 'replicate' && !isBatchSupported);
      if (fansOutPerOutput) {
        requiredCredits *= requestedOutputs;
      }
    }

    const hasCredits =
      await this.creditsUtilsService.checkOrganizationCreditsAvailable(
        organization,
        requiredCredits,
      );
    if (!hasCredits) {
      const balance =
        await this.creditsUtilsService.getOrganizationCreditsBalance(
          organization,
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

  /**
   * Resolve which provider a model routes to. Returns `null` for models that
   * match no known provider (the caller throws BAD_REQUEST), mirroring the
   * original flat guard.
   */
  private classifyProvider(model: string): ImageGenerationProvider | null {
    const replicateModels: string[] = [
      MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_3,
      MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4,
      MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4_FAST,
      MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4_ULTRA,
    ];

    const isGenfeedAi = isGenfeedAiDestination(model);
    const isFal = isFalDestination(model);
    const isReplicate =
      !isFal &&
      !isGenfeedAi &&
      (replicateModels.includes(model) || isReplicateDestination(model));

    if (isGenfeedAi) {
      return 'genfeedai';
    }
    if (model === MODEL_KEYS.KLINGAI_V2) {
      return 'klingai';
    }
    if (isFal) {
      return 'fal';
    }
    if (model === MODEL_KEYS.LEONARDOAI) {
      return 'leonardo';
    }
    if (isReplicate) {
      return 'replicate';
    }
    if (model === MODEL_KEYS.SDXL) {
      return 'sdxl';
    }
    return null;
  }

  /**
   * Finish a generation request: when waiting, await the provider promise and
   * serialize the completed ingredient (single source of truth for the
   * poll/serialize/timeout-recovery tail); otherwise return the placeholder and
   * let generation run in the background.
   */
  private async finishGeneration(
    context: ImageGenerationContext,
    plan: ImageGenerationCompletionPlan | null,
  ): Promise<JsonApiSingleResponse> {
    if (plan && context.waitForCompletion && plan.kind !== 'background-only') {
      try {
        await plan.generationPromise;
        const completed = await this.resolveCompletedIngredient(context, plan);
        return serializeSingle(
          context.request,
          IngredientSerializer,
          completed,
        );
      } catch (error: unknown) {
        // GenfeedAi (`inline`) completes synchronously and never had timeout
        // recovery; only the polling providers translate timeouts to 504.
        if (plan.kind !== 'inline') {
          await this.throwGatewayTimeoutIfPending(error, context);
        }
        throw error;
      }
    }

    if (plan) {
      // Generation runs in the background. Attach an empty catch to prevent an
      // unhandled rejection (the failure is already handled in the provider's
      // own catch).
      plan.generationPromise.catch(() => {
        // Error already handled in the provider catch block.
      });
    } else if (context.waitForCompletion) {
      // SDXL has no external generation to await.
      this.loggerService.warn(
        'waitForCompletion requested for unsupported provider',
        {
          ingredientId: context.ingredientData.id,
          model: context.model,
        },
      );
    }

    return serializeSingle(context.request, IngredientSerializer, {
      ...context.ingredientData,
      pendingIngredientIds: context.pendingIngredientIds,
    });
  }

  /** Read the completed ingredient for the request's completion strategy. */
  private async resolveCompletedIngredient(
    context: ImageGenerationContext,
    plan: ImageGenerationCompletionPlan,
  ): Promise<unknown> {
    if (plan.kind === 'inline') {
      return this.imagesService.findOne(
        { _id: context.ingredientData.id },
        IMAGE_POPULATE,
      );
    }

    if (plan.kind === 'poll-multiple') {
      const completedIngredients =
        await this.ingredientCompletionService.waitForMultipleIngredientsCompletion(
          plan.pollIds ?? [context.ingredientData.id.toString()],
          180_000, // 3 minutes timeout
          2_000, // 2 seconds poll interval
          IMAGE_POPULATE,
        );
      return completedIngredients[0];
    }

    // poll-single
    return this.ingredientCompletionService.waitForIngredientCompletion(
      context.ingredientData.id.toString(),
      180000, // 3 minutes timeout
      2000, // 2 seconds poll interval
      IMAGE_POPULATE,
    );
  }

  /**
   * Translate a polling timeout into a 504 with the ingredient's current
   * status. No-op (caller re-throws the original error) for any other error or
   * when the ingredient can no longer be read.
   */
  private async throwGatewayTimeoutIfPending(
    error: unknown,
    context: ImageGenerationContext,
  ): Promise<void> {
    if (!(error instanceof PollTimeoutException)) {
      return;
    }

    const ingredient = await this.imagesService.findOne(
      { _id: context.ingredientData.id },
      IMAGE_POPULATE,
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
