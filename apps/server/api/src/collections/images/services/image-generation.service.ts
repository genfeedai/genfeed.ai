import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ActivityEntity } from '@api/collections/activities/entities/activity.entity';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { AssetsService } from '@api/collections/assets/services/assets.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { buildPromptBrandingFromBrand } from '@api/collections/brands/utils/brand-context.util';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { CreateImageDto } from '@api/collections/images/dto/create-image.dto';
import { ImagesService } from '@api/collections/images/services/images.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
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
import { ConfigService } from '@api/config/config.service';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import { resolveGenerationDefaultModel } from '@api/helpers/utils/generation-defaults/generation-defaults.util';
import { buildReferenceImageUrls } from '@api/helpers/utils/reference/reference.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { ComfyUIService } from '@api/services/integrations/comfyui/comfyui.service';
import { FalService } from '@api/services/integrations/fal/fal.service';
import { KlingAIService } from '@api/services/integrations/klingai/klingai.service';
import { LeonardoAIService } from '@api/services/integrations/leonardoai/leonardoai.service';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { RouterService } from '@api/services/router/router.service';
import { FailedGenerationService } from '@api/shared/services/failed-generation/failed-generation.service';
import { PollingService } from '@api/shared/services/polling/polling.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import { MODEL_KEYS, MODEL_OUTPUT_CAPABILITIES } from '@genfeedai/constants';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
  FileInputType,
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
  ModelCategory,
  PricingType,
  PromptCategory,
  PromptStatus,
} from '@genfeedai/enums';
import type { JsonApiSingleResponse } from '@genfeedai/interfaces';
import { IngredientSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

/** Populate patterns for every image read on the wait/serialize path. */
const IMAGE_POPULATE = [
  PopulatePatterns.promptFull,
  PopulatePatterns.metadataFull,
  PopulatePatterns.brandMinimal,
];

/** The resolved provider an image-generation request routes to. */
type ImageProvider =
  | 'genfeedai'
  | 'klingai'
  | 'fal'
  | 'leonardo'
  | 'replicate'
  | 'sdxl';

/** Document types inferred from the underlying services (no `any`). */
type ResolvedBrand = NonNullable<Awaited<ReturnType<BrandsService['findOne']>>>;
type ResolvedPrompt = Awaited<ReturnType<PromptsService['create']>>;
type SaveDocumentsResult = Awaited<ReturnType<SharedService['saveDocuments']>>;
type SavedIngredient = SaveDocumentsResult['ingredientData'];
type SavedMetadata = SaveDocumentsResult['metadataData'];
type PublicMetadata = ReturnType<typeof getPublicMetadata>;

/**
 * Per-request state threaded through the provider handlers and the shared
 * completion tail. Built once by {@link ImageGenerationService.generateImage}
 * after the placeholder documents exist, so every handler reads from one place
 * instead of the previous flat method's shared mutable locals.
 */
interface GenerationContext {
  brand: ResolvedBrand;
  brandPromptBranding: ReturnType<typeof buildPromptBrandingFromBrand>;
  createImageDto: CreateImageDto;
  height: number;
  ingredientData: SavedIngredient;
  metadataData: SavedMetadata;
  model: string;
  outputs: number;
  /** Mutated by handlers (Fal) that fan out additional background outputs. */
  pendingIngredientIds: string[];
  promptBuilderBrand: {
    description?: string;
    label: string;
    primaryColor?: string;
    secondaryColor?: string;
    text?: string;
  };
  promptData: ResolvedPrompt;
  publicMetadata: PublicMetadata;
  referenceImageUrl: string | null;
  referenceImageUrls: string[];
  request: Request;
  style?: string;
  user: User;
  waitForCompletion: boolean;
  websocketUrl: string;
  width: number;
}

/**
 * How the request should resolve once a provider has dispatched.
 *
 * - `inline` — GenfeedAi completes synchronously inside its promise; on wait we
 *   re-read the ingredient (no polling, no timeout recovery).
 * - `poll-single` — KlingAI/Leonardo poll one ingredient to completion.
 * - `poll-multiple` — Replicate polls every fanned-out ingredient id.
 * - `background-only` — Fal never blocks the request; always returns the
 *   placeholder immediately.
 */
interface CompletionPlan {
  generationPromise: Promise<unknown>;
  kind: 'inline' | 'poll-single' | 'poll-multiple' | 'background-only';
  pollIds?: string[];
}

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
    private readonly promptBuilderService: PromptBuilderService,
    private readonly promptsService: PromptsService,
    private readonly replicateService: ReplicateService,
    private readonly routerService: RouterService,
    private readonly sharedService: SharedService,
    private readonly websocketService: NotificationsPublisherService,
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

    const websocketUrl = WebSocketPaths.image(ingredientData._id);

    const context: GenerationContext = {
      brand,
      brandPromptBranding,
      createImageDto,
      height,
      ingredientData,
      metadataData,
      model,
      outputs,
      pendingIngredientIds: [ingredientData._id.toString()],
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
    await this.createImagePlaceholderActivity(context, ingredientData._id);

    const plan = await this.dispatchGeneration(context, provider);

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
    brand: ResolvedBrand;
    model: string;
    promptOriginalText: string;
    provider: ImageProvider;
    publicMetadata: PublicMetadata;
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
    brand: ResolvedBrand;
    brandPromptBranding: ReturnType<typeof buildPromptBrandingFromBrand>;
    createImageDto: CreateImageDto;
    height: number;
    model: string;
    promptBuilderBrand: GenerationContext['promptBuilderBrand'];
    promptOriginalText: string;
    publicMetadata: PublicMetadata;
    referenceImageUrls: string[];
    style?: string;
    user: User;
    width: number;
  }): Promise<{
    ingredientData: SavedIngredient;
    metadataData: SavedMetadata;
    promptData: ResolvedPrompt;
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
        brand: brand._id,
        category: IngredientCategory.IMAGE,
        extension: MetadataExtension.JPEG,
        height,
        model,
        organization: publicMetadata.organization,
        parent: isEntityId(createImageDto.parent)
          ? createImageDto.parent
          : undefined,
        prompt: promptData._id,
        // Template tracking
        promptTemplate: imageTemplateUsed,
        style,
        templateVersion: imageTemplateVersion,
        width,
      });

    await this.imagesService.patch(ingredientData._id, {
      prompt: promptData._id,
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
    brand: ResolvedBrand,
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
  private classifyProvider(model: string): ImageProvider | null {
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
   * Dispatch map: route the resolved provider to its handler. SDXL has no
   * external generation step, so it returns `null` and the request resolves to
   * the placeholder. Adding a provider touches only a handler plus this switch.
   */
  private async dispatchGeneration(
    context: GenerationContext,
    provider: ImageProvider,
  ): Promise<CompletionPlan | null> {
    switch (provider) {
      case 'genfeedai':
        return this.dispatchGenfeedAi(context);
      case 'klingai':
        return this.dispatchKlingAI(context);
      case 'fal':
        return this.dispatchFal(context);
      case 'leonardo':
        return this.dispatchLeonardo(context);
      case 'replicate':
        return this.dispatchReplicate(context);
      default:
        // SDXL: placeholder only, no external generation.
        return null;
    }
  }

  /**
   * Finish a generation request: when waiting, await the provider promise and
   * serialize the completed ingredient (single source of truth for the
   * poll/serialize/timeout-recovery tail); otherwise return the placeholder and
   * let generation run in the background.
   */
  private async finishGeneration(
    context: GenerationContext,
    plan: CompletionPlan | null,
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
          ingredientId: context.ingredientData._id,
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
    context: GenerationContext,
    plan: CompletionPlan,
  ): Promise<unknown> {
    if (plan.kind === 'inline') {
      return this.imagesService.findOne(
        { _id: context.ingredientData._id },
        IMAGE_POPULATE,
      );
    }

    if (plan.kind === 'poll-multiple') {
      const completedIngredients =
        await this.pollingService.waitForMultipleIngredientsCompletion(
          plan.pollIds ?? [context.ingredientData._id.toString()],
          180_000, // 3 minutes timeout
          2_000, // 2 seconds poll interval
          IMAGE_POPULATE,
        );
      return completedIngredients[0];
    }

    // poll-single
    return this.pollingService.waitForIngredientCompletion(
      context.ingredientData._id.toString(),
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
    context: GenerationContext,
  ): Promise<void> {
    if (!(error instanceof Error) || error.name !== 'PollingTimeoutError') {
      return;
    }

    const ingredient = await this.imagesService.findOne(
      { _id: context.ingredientData._id },
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
   * Single failure path for every provider: log, persist the failed state, and
   * re-throw so the request rejects. Collapses the previously copy-pasted
   * `handleFailedImageGeneration` call sites.
   */
  private async handleProviderFailure(
    context: GenerationContext,
    error: unknown,
    label: string,
    ingredientId: SavedIngredient['_id'] = context.ingredientData._id,
  ): Promise<never> {
    this.loggerService.error(`${label} failed`, error);
    const errorMessage = getErrorMessage(error);

    // Attribute the failure to the specific output that failed, not always the
    // primary ingredient. The websocket path is derived from the same id so the
    // matching placeholder (not the first) receives the failure update. The
    // default keeps every single-output provider call site on the primary id —
    // and for the primary `WebSocketPaths.image(_id)` equals `context.websocketUrl`.
    await this.failedGenerationService.handleFailedImageGeneration(
      this.imagesService,
      ingredientId,
      WebSocketPaths.image(ingredientId),
      context.publicMetadata,
      getUserRoomName(context.user.id),
      errorMessage,
    );
    throw error;
  }

  /**
   * Create the IMAGE_PROCESSING activity and emit the matching background-task
   * websocket update for a placeholder ingredient. Shared by the primary output
   * and every multi-output fan-out path.
   */
  private async createImagePlaceholderActivity(
    context: GenerationContext,
    ingredientId: string,
  ): Promise<void> {
    const activity = await this.activitiesService.create(
      new ActivityEntity({
        brand: context.brand._id,
        entityId: ingredientId,
        entityModel: ActivityEntityModel.INGREDIENT,
        key: ActivityKey.IMAGE_PROCESSING,
        organization: context.publicMetadata.organization,
        source: ActivitySource.IMAGE_GENERATION,
        user: context.publicMetadata.user,
        value: JSON.stringify({
          ingredientId: ingredientId.toString(),
          model: context.model,
          type: 'generation',
        }),
      }),
    );

    await this.websocketService.publishBackgroundTaskUpdate({
      activityId: activity._id.toString(),
      label: 'Image Generation',
      progress: 0,
      room: getUserRoomName(context.user.id),
      status: 'processing',
      taskId: ingredientId.toString(),
      userId: context.user.id,
    });
  }

  /** GenfeedAi (ComfyUI): generate, upload, complete inline. */
  private dispatchGenfeedAi(context: GenerationContext): CompletionPlan {
    const {
      ingredientData,
      metadataData,
      promptData,
      referenceImageUrl,
      user,
      websocketUrl,
    } = context;

    const generationPromise = (async () => {
      const { imageBuffer } = await this.comfyUIService.generateImage(
        context.model,
        {
          faceImage: referenceImageUrl || undefined,
          height: context.height,
          prompt: promptData.original,
          seed: context.createImageDto.seed,
          width: context.width,
        },
      );

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
            prompt: promptData._id,
            size: uploadMeta.size,
            width: uploadMeta.width,
          }),
        ),
        this.imagesService.patch(ingredientData._id, {
          cdnUrl:
            typeof uploadMeta.publicUrl === 'string'
              ? uploadMeta.publicUrl
              : undefined,
          prompt: promptData._id,
          s3Key:
            typeof uploadMeta.s3Key === 'string' ? uploadMeta.s3Key : undefined,
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
    })().catch((error: unknown) =>
      this.handleProviderFailure(
        context,
        error,
        'ComfyUIService generateImage',
      ),
    );

    return { generationPromise, kind: 'inline' };
  }

  /** Kling AI: queue generation, patch external id, poll on wait. */
  private dispatchKlingAI(context: GenerationContext): CompletionPlan {
    const { createImageDto, metadataData, promptData, referenceImageUrl } =
      context;

    const generationPromise = this.klingAIService
      .queueGenerateImage(promptData.original, {
        ...createImageDto,
        height: context.height,
        model: context.model,
        reference: referenceImageUrl || undefined,
        style: context.style || 'realistic',
        width: context.width,
      })
      .then(async (generationId) => {
        if (!generationId) {
          throw new Error('No generation ID returned from KlingAI');
        }

        await this.metadataService.patch(
          metadataData._id,
          new MetadataEntity({
            externalId: generationId,
            prompt: promptData._id,
          }),
        );

        return generationId;
      })
      .catch((error: unknown) =>
        this.handleProviderFailure(
          context,
          error,
          'KlingAIService generateImage',
        ),
      );

    return { generationPromise, kind: 'poll-single' };
  }

  /** Leonardo: generate, patch external id, poll on wait. */
  private dispatchLeonardo(context: GenerationContext): CompletionPlan {
    const { createImageDto, metadataData, promptData } = context;

    const generationPromise = this.leonardoaiService
      .generateImage(promptData.original, {
        ...createImageDto,
        height: context.height,
        style: context.style || 'realistic',
        width: context.width,
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
      .catch((error: unknown) =>
        this.handleProviderFailure(
          context,
          error,
          'LeonardoAIService generateImage',
        ),
      );

    return { generationPromise, kind: 'poll-single' };
  }

  /**
   * Fal: generate the primary output then, for multi-output requests, fan out
   * additional outputs in the background. Fal never blocks the request.
   */
  private dispatchFal(context: GenerationContext): CompletionPlan {
    const {
      createImageDto,
      height,
      metadataData,
      promptData,
      referenceImageUrl,
      width,
    } = context;

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
      // Primary output: a failure here is attributed to the primary ingredient.
      let primaryUrl: string;
      try {
        const falResult = await this.falService.generateImage(
          context.model,
          buildFalInput(),
        );
        await this.metadataService.patch(
          metadataData._id,
          new MetadataEntity({
            externalId: falResult.url,
            prompt: promptData._id,
          }),
        );
        primaryUrl = falResult.url;
      } catch (error: unknown) {
        return this.handleProviderFailure(
          context,
          error,
          'FalService generateImage',
          context.ingredientData._id,
        );
      }

      // Additional outputs sit outside the primary's catch: each owns its own
      // failure attribution (see createFalAdditionalOutput), so a failed fan-out
      // output marks that output rather than the already-succeeded primary.
      // finishGeneration attaches an empty catch to the background promise, so a
      // rejection after marking is intentional and not an unhandled rejection.
      for (let i = 1; i < context.outputs; i++) {
        await this.createFalAdditionalOutput(context, buildFalInput);
      }

      return primaryUrl;
    })();

    return { generationPromise, kind: 'background-only' };
  }

  /** Create one additional Fal output document, generate it, and track it. */
  private async createFalAdditionalOutput(
    context: GenerationContext,
    buildFalInput: () => Record<string, unknown>,
  ): Promise<void> {
    const { createImageDto, brand, promptData, publicMetadata } = context;

    // Capture the additional output's id as soon as its placeholder exists so a
    // generation/patch failure marks that specific output, not the (already
    // succeeded) primary.
    let additionalIngredientId: SavedIngredient['_id'] | null = null;
    try {
      const {
        metadataData: additionalMetadata,
        ingredientData: additionalIngredient,
      } = await this.sharedService.saveDocuments(context.user, {
        ...createImageDto,
        brand: brand._id,
        category: IngredientCategory.IMAGE,
        extension: MetadataExtension.JPG,
        model: context.model,
        organization: publicMetadata.organization,
        parent: context.ingredientData.parent,
        prompt: promptData._id,
        status: IngredientStatus.PROCESSING,
      });
      additionalIngredientId = additionalIngredient._id;

      const additionalResult = await this.falService.generateImage(
        context.model,
        buildFalInput(),
      );

      await Promise.all([
        this.metadataService.patch(
          additionalMetadata._id,
          new MetadataEntity({
            externalId: additionalResult.url,
            prompt: promptData._id,
          }),
        ),
        this.imagesService.patch(additionalIngredient._id, {
          prompt: promptData._id,
        }),
      ]);

      // Activity creation + websocket publishing is post-success bookkeeping:
      // a failure here must not mark the already-generated additional output as
      // failed, so swallow (and log) instead of letting it reach the catch.
      try {
        await this.createImagePlaceholderActivity(
          context,
          additionalIngredient._id,
        );
      } catch (activityError: unknown) {
        this.loggerService.error(
          'Failed to publish placeholder activity for additional output',
          { error: activityError },
        );
      }

      context.pendingIngredientIds.push(additionalIngredient._id.toString());
    } catch (error: unknown) {
      // Mark the specific additional output that failed; never fall back to the
      // primary, which is a different (already-succeeded) output.
      if (additionalIngredientId) {
        return this.handleProviderFailure(
          context,
          error,
          'FalService generateImage (additional output)',
          additionalIngredientId,
        );
      }
      // The placeholder was never created (saveDocuments failed), so there is
      // nothing to mark. Log so the dropped output is observable, then propagate
      // to fail the request rather than swallowing it silently.
      this.loggerService.error(
        'Fal additional output failed before its placeholder was created',
        error,
      );
      throw error;
    }
  }

  /**
   * Replicate: build provider-specific prompt params, dispatch, then handle
   * batch vs sequential multi-output. Polls every fanned-out id on wait.
   */
  private async dispatchReplicate(
    context: GenerationContext,
  ): Promise<CompletionPlan> {
    const {
      createImageDto,
      promptBuilderBrand,
      brandPromptBranding,
      promptData,
    } = context;

    const destination = context.model;
    const modelCapability = MODEL_OUTPUT_CAPABILITIES[destination];
    const isBatchSupported = modelCapability?.isBatchSupported ?? false;

    // Build provider-specific prompt using the universal prompt builder with
    // template support. NOTE: This must complete before we can start generation.
    // Only batch-capable models yield every output from a single call, so they
    // request `context.outputs`; non-batch models make a separate call per output
    // (see createReplicateSequentialOutputs) and must request exactly one output
    // per call — otherwise every one of those N calls over-requests N images.
    const { input: promptParams } = await this.promptBuilderService.buildPrompt(
      context.model,
      {
        blacklist: createImageDto.blacklist,
        brand: promptBuilderBrand,
        branding: brandPromptBranding,
        brandingMode: createImageDto.brandingMode,
        camera: createImageDto.camera,
        fontFamily: createImageDto.fontFamily,
        height: context.height,
        isBrandingEnabled: createImageDto.isBrandingEnabled,
        lens: createImageDto.lens,
        lighting: createImageDto.lighting,
        // Use model's category from DB (set by ModelsGuard), fallback to IMAGE
        modelCategory: ModelCategory.IMAGE,
        mood: createImageDto.mood,
        outputs: isBatchSupported ? context.outputs : 1,
        prompt: promptData.original,
        // Template support
        promptTemplate: createImageDto.promptTemplate,
        references: context.referenceImageUrls,
        scene: createImageDto.scene,
        seed: createImageDto.seed,
        style: context.style || createImageDto.style || 'realistic',
        tags: createImageDto.tags?.map((tag) => tag.toString()) || [],
        useTemplate: createImageDto.useTemplate,
        width: context.width,
      },
      context.publicMetadata.organization,
    );

    // Track all placeholder ingredient IDs - start with first one
    const pollIds: string[] = [context.ingredientData._id.toString()];

    const generationPromise = (async () => {
      // Primary generation: a failure here is attributed to the primary
      // ingredient.
      let generationId: string;
      try {
        const id = await this.replicateService.generateTextToImage(
          destination,
          promptParams,
        );
        if (!id) {
          throw new Error('No generation ID returned from Replicate');
        }
        generationId = id;
      } catch (error: unknown) {
        return this.handleProviderFailure(
          context,
          error,
          'ReplicateService generateImage',
          context.ingredientData._id,
        );
      }

      // Multi-output fan-out. createReplicateSequentialOutputs owns its own
      // per-output failure attribution (a failed additional output marks that
      // output, never the primary); the batch and single-output branches wrap
      // their DB work here so a failure still tears down the primary placeholder.
      if (isBatchSupported && context.outputs > 1) {
        try {
          await this.createReplicateBatchOutputs(
            context,
            destination,
            generationId,
            pollIds,
          );
        } catch (error: unknown) {
          return this.handleProviderFailure(
            context,
            error,
            'ReplicateService generateImage',
            context.ingredientData._id,
          );
        }
      } else if (context.outputs > 1) {
        await this.createReplicateSequentialOutputs(
          context,
          destination,
          generationId,
          promptParams,
          pollIds,
        );
      } else {
        // Single output - use original external ID
        try {
          await this.metadataService.patch(
            context.metadataData._id,
            new MetadataEntity({
              externalId: generationId,
            }),
          );
        } catch (error: unknown) {
          return this.handleProviderFailure(
            context,
            error,
            'ReplicateService generateImage',
            context.ingredientData._id,
          );
        }
      }

      return generationId;
    })();

    return { generationPromise, kind: 'poll-multiple', pollIds };
  }

  /**
   * Batch-capable Replicate models: one API call yields multiple outputs.
   * Create the remaining placeholder documents and index their external ids.
   */
  private async createReplicateBatchOutputs(
    context: GenerationContext,
    destination: string,
    generationId: string,
    pollIds: string[],
  ): Promise<void> {
    const { createImageDto, brand, promptData, publicMetadata } = context;

    await this.metadataService.patch(
      context.metadataData._id,
      new MetadataEntity({
        externalId: `${generationId}_0`,
      }),
    );

    // Create additional placeholder documents for remaining outputs
    const additionalDocuments = await Promise.all(
      Array.from({ length: context.outputs - 1 }, () => {
        return this.sharedService.saveDocuments(context.user, {
          ...createImageDto,
          brand: brand._id,
          category: IngredientCategory.IMAGE,
          extension: MetadataExtension.JPG,
          model: context.model,
          organization: publicMetadata.organization,
          parent: context.ingredientData.parent,
          prompt: promptData._id,
          status: IngredientStatus.PROCESSING,
        });
      }),
    );

    // Update metadata and images in parallel
    await Promise.all(
      additionalDocuments.flatMap(
        ({ metadataData: addMeta, ingredientData: addIngredient }, index) => {
          const i = index + 1;
          return [
            this.metadataService.patch(
              addMeta._id,
              new MetadataEntity({
                externalId: `${generationId}_${i}`,
              }),
            ),
            this.imagesService.patch(addIngredient._id, {
              prompt: promptData._id,
            }),
          ];
        },
      ),
    );

    // Create activities for each additional placeholder (batch model path)
    await Promise.all(
      additionalDocuments.map(({ ingredientData: addIngredient }) =>
        this.createImagePlaceholderActivity(context, addIngredient._id),
      ),
    );

    // Push additional ingredient IDs to tracking array for polling
    additionalDocuments.forEach(({ ingredientData: addIngredient }) => {
      pollIds.push(addIngredient._id.toString());
    });

    this.loggerService.log(
      'Created multiple placeholders for batch-capable model multi-output',
      {
        generationId,
        isBatchSupported: true,
        model: destination,
        outputs: context.outputs,
      },
    );
  }

  /**
   * Non-batch Replicate models: make a separate API call per additional output,
   * each with its own placeholder document and external id.
   */
  private async createReplicateSequentialOutputs(
    context: GenerationContext,
    destination: string,
    generationId: string,
    promptParams: Record<string, unknown>,
    pollIds: string[],
  ): Promise<void> {
    const { createImageDto, brand, promptData, publicMetadata } = context;

    try {
      await this.metadataService.patch(
        context.metadataData._id,
        new MetadataEntity({
          externalId: generationId,
        }),
      );
    } catch (error: unknown) {
      await this.handleProviderFailure(
        context,
        error,
        'ReplicateService generateImage',
        context.ingredientData._id,
      );
    }

    // Make additional API calls for remaining outputs
    // NOTE: Sequential because each needs unique generationId
    for (let i = 1; i < context.outputs; i++) {
      // Capture the additional output's id as soon as its placeholder exists so
      // a generation/patch failure marks that specific output, not the primary.
      let additionalIngredientId: SavedIngredient['_id'] | null = null;
      try {
        const {
          metadataData: additionalMetadata,
          ingredientData: additionalIngredient,
        } = await this.sharedService.saveDocuments(context.user, {
          ...createImageDto,
          brand: brand._id,
          category: IngredientCategory.IMAGE,
          extension: MetadataExtension.JPG,
          model: context.model,
          organization: publicMetadata.organization,
          parent: context.ingredientData.parent,
          prompt: promptData._id,
          status: IngredientStatus.PROCESSING,
        });
        additionalIngredientId = additionalIngredient._id;

        // Make separate API call for each output
        const additionalGenerationId =
          await this.replicateService.generateTextToImage(
            destination,
            promptParams,
          );
        if (!additionalGenerationId) {
          throw new Error('No generation ID returned from Replicate');
        }

        await Promise.all([
          this.metadataService.patch(
            additionalMetadata._id,
            new MetadataEntity({
              externalId: additionalGenerationId,
            }),
          ),
          this.imagesService.patch(additionalIngredient._id, {
            prompt: promptData._id,
          }),
        ]);

        await this.createImagePlaceholderActivity(
          context,
          additionalIngredient._id,
        );

        // Push this additional ingredient ID to tracking array for polling
        pollIds.push(additionalIngredient._id.toString());
      } catch (error: unknown) {
        // Mark the specific additional output that failed; never fall back to
        // the primary, which is a different output.
        if (additionalIngredientId) {
          return this.handleProviderFailure(
            context,
            error,
            'ReplicateService generateImage (additional output)',
            additionalIngredientId,
          );
        }
        // The placeholder was never created (saveDocuments failed), so there is
        // nothing to mark. Log so the dropped output is observable, then
        // propagate to fail the request rather than swallowing it silently.
        this.loggerService.error(
          'Replicate additional output failed before its placeholder was created',
          error,
        );
        throw error;
      }
    }

    this.loggerService.log(
      'Created multiple API calls for non-batch model multi-output',
      {
        isBatchSupported: false,
        model: destination,
        outputs: context.outputs,
      },
    );
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
