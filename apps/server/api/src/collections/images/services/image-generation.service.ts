import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { buildPromptBrandingFromBrand } from '@api/collections/brands/utils/brand-context.util';
import { CreateImageDto } from '@api/collections/images/dto/create-image.dto';
import type {
  ImageGenerationCompletionPlan,
  ImageGenerationContext,
  ImageGenerationResolvedBrand,
  ImageGenerationResolvedPrompt,
  ImageGenerationSavedIngredient,
  ImageGenerationSavedMetadata,
} from '@api/collections/images/services/image-generation.types';
import { ImageGenerationAdmissionService } from '@api/collections/images/services/image-generation-admission.service';
import { ImageGenerationProviderDispatchService } from '@api/collections/images/services/image-generation-provider-dispatch.service';
import { ImagesService } from '@api/collections/images/services/images.service';
import { IngredientGenerationCancellationService } from '@api/collections/ingredients/services/ingredient-generation-cancellation.service';
import { ModelRegistrationService } from '@api/collections/models/services/model-registration.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { PromptEntity } from '@api/collections/prompts/entities/prompt.entity';
import { PromptsService } from '@api/collections/prompts/services/prompts.service';
import type {
  GenerationPlaceholderCreatedCallback,
  GenerationPlaceholderScope,
} from '@api/common/interfaces/generation-placeholder-lifecycle.interface';
import type { RequestWithContext as Request } from '@api/common/middleware/request-context.middleware';
import { createRequestAbortSignal } from '@api/helpers/utils/request/request-abort-signal.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import {
  GenerationBriefCompileError,
  runImageGenerationBrief,
  toRedactedGenerationBriefProviderData,
} from '@api/services/generation-brief';
import type { ImageGenerationBriefDispatch } from '@api/services/generation-brief/image-generation-brief-registry';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { RouterService } from '@api/services/router/router.service';
import { IngredientCompletionService } from '@api/shared/services/poll-until/ingredient-completion.service';
import { PollTimeoutException } from '@api/shared/services/poll-until/poll-until.exception';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import {
  IngredientCategory,
  MetadataExtension,
  ModelCategory,
  PromptCategory,
  PromptStatus,
} from '@genfeedai/contracts';
import type {
  ImageGenerationBrief,
  ImageGenerationBriefReference,
} from '@genfeedai/contracts/api-types/contracts/generation-brief.contract';
import type { GenerationBriefPersistedEvidence } from '@genfeedai/contracts/api-types/contracts/generation-brief-compiler.contract';
import type { JsonApiSingleResponse } from '@genfeedai/contracts/interfaces';
import { IngredientSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

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
 * documents, dispatches through the typed provider registry,
 * and finishes the request via one shared completion tail — collapsing the
 * previously copy-pasted failure-handler, poll-and-serialize, and timeout
 * recovery blocks to a single call site each.
 */
@Injectable()
export class ImageGenerationService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly brandsService: BrandsService,
    private readonly admissionService: ImageGenerationAdmissionService,
    private readonly ingredientCompletionService: IngredientCompletionService,
    private readonly imageGenerationProviderDispatchService: ImageGenerationProviderDispatchService,
    private readonly imagesService: ImagesService,
    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly loggerService: LoggerService,
    private readonly modelRegistrationService: ModelRegistrationService,
    private readonly promptBuilderService: PromptBuilderService,
    private readonly promptsService: PromptsService,
    private readonly routerService: RouterService,
    private readonly sharedService: SharedService,
    private readonly cancellationService: IngredientGenerationCancellationService,
  ) {}

  async generateImage(
    user: User,
    createImageDto: CreateImageDto,
    request: Request,
    onPlaceholderCreated?: GenerationPlaceholderCreatedCallback,
    placeholderScope?: GenerationPlaceholderScope,
    onCreditsPrepared?: () => Promise<void>,
    runReferences?: readonly ImageGenerationBriefReference[],
  ): Promise<JsonApiSingleResponse> {
    const {
      brand,
      model,
      modelEndpoint,
      modelInputSchema,
      modelProvider,
      modelSchemaFamily,
      promptOriginalText,
    } = await this.resolveAndValidate(user, createImageDto, request);

    const accepted = await this.admissionService.findReusableIngredient(
      createImageDto.sourceActionId,
      user.organizationId,
    );
    if (accepted) {
      await this.admissionService.ensureCredits(
        createImageDto,
        model,
        user.organizationId,
        request,
        onCreditsPrepared,
      );
      return serializeSingle(request, IngredientSerializer, accepted);
    }

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

    const referenceImageUrls =
      await this.admissionService.resolveReferenceImageUrls(
        user.organizationId,
        referenceIds,
      );

    const referenceImageUrl: string | null = referenceImageUrls[0] || null;

    const compiledBrief = this.compileImageGenerationBrief({
      createImageDto,
      height,
      model,
      promptOriginalText,
      referenceIds,
      runReferences,
      style,
      width,
    });

    const { promptData, metadataData, ingredientData } =
      await this.persistImageDocuments({
        brand,
        brandPromptBranding,
        briefEvidence: compiledBrief.evidence,
        compiledDispatch: compiledBrief.dispatch,
        createImageDto,
        generationSource: compiledBrief.generationSource,
        height,
        model,
        modelInputSchema,
        promptBuilderBrand,
        promptOriginalText,
        user,
        referenceIds,
        referenceImageUrls,
        placeholderScope,
        style,
        width,
      });

    const websocketUrl = WebSocketPaths.image(ingredientData.id);

    const context: ImageGenerationContext = {
      brand,
      brandPromptBranding,
      briefEvidence: compiledBrief.evidence,
      compiledDispatch: compiledBrief.dispatch,
      createImageDto,
      generationBrief: compiledBrief.brief,
      generationSource: compiledBrief.generationSource,
      height,
      ingredientData,
      metadataData,
      model,
      modelEndpoint,
      modelInputSchema,
      modelProvider,
      modelSchemaFamily,
      outputs,
      pendingIngredientIds: [ingredientData.id.toString()],
      promptBuilderBrand,
      promptData,
      referenceIds,
      referenceImageUrl,
      referenceImageUrls,
      request,
      style,
      user,
      waitForCompletion: createImageDto.waitForCompletion === true,
      websocketUrl,
      width,
      abortSignal: createRequestAbortSignal(request),
    };

    return this.dispatchAndFinish(
      context,
      onPlaceholderCreated,
      onCreditsPrepared,
    );
  }

  private async dispatchAndFinish(
    context: ImageGenerationContext,
    onPlaceholderCreated?: GenerationPlaceholderCreatedCallback,
    onCreditsPrepared?: () => Promise<void>,
  ): Promise<JsonApiSingleResponse> {
    try {
      await onPlaceholderCreated?.(context.ingredientData.id.toString());
      await this.admissionService.ensureCredits(
        context.createImageDto,
        context.model,
        context.user.organizationId,
        context.request,
        onCreditsPrepared,
      );
    } catch (error: unknown) {
      return this.imageGenerationProviderDispatchService.failPlaceholderBeforeDispatch(
        context,
        error,
      );
    }
    await this.imageGenerationProviderDispatchService.createPlaceholderActivity(
      context,
      context.ingredientData.id,
    );
    const plan =
      await this.imageGenerationProviderDispatchService.dispatch(context);
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
    modelEndpoint: string;
    modelInputSchema?: Record<string, unknown>;
    modelProvider?: string;
    modelSchemaFamily?: string;
    promptOriginalText: string;
  }> {
    this.loggerService.log(`${this.constructorName} create`, {
      ...createImageDto,
    });

    if (!createImageDto.text) {
      throw new HttpException(
        {
          detail: 'Prompt is required',
          title: 'Prompt validation failed',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const promptOriginalText = createImageDto.text;

    const brandId = createImageDto.brandId || user.brandId;
    const brand = await this.brandsService.findOne({
      id: brandId,
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

    const organizationSettings = await this.organizationSettingsService.findOne(
      {
        organizationId: user.organizationId,
      },
    );

    const model = await this.resolveImageModel(
      createImageDto,
      promptOriginalText,
      brand,
      organizationSettings,
      user.organizationId,
    );

    // Validate resolved model against org (catches default-resolution bypassing
    // ModelsGuard). Prefer the verified token org so validation still runs when
    // request-context middleware did not populate organizationId; only
    // single-tenant deployments (no org at all) skip it.
    const validationOrgId =
      user.organizationId || request.context?.organizationId;
    const registeredModel = validationOrgId
      ? await this.modelRegistrationService.validateModelForOrg(
          model,
          validationOrgId,
        )
      : undefined;
    const modelEndpoint = registeredModel?.endpoint || model;
    const modelProvider = registeredModel?.provider;
    const rawInputSchema = registeredModel?.providerInputSchema;
    const modelInputSchema =
      rawInputSchema &&
      typeof rawInputSchema === 'object' &&
      !Array.isArray(rawInputSchema)
        ? (rawInputSchema as Record<string, unknown>)
        : undefined;
    const modelSchemaFamily =
      registeredModel?.providerSchemaFamily ?? undefined;

    if (
      !this.imageGenerationProviderDispatchService.supports(
        model,
        modelProvider,
      )
    ) {
      throw new HttpException(
        {
          detail: 'Invalid model for image generation',
          title: 'Validation failed',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    return {
      brand,
      model,
      modelEndpoint,
      modelInputSchema,
      modelProvider,
      modelSchemaFamily,
      promptOriginalText,
    };
  }

  /**
   * Compile a generation brief through the registered compiler for the
   * requested model family, or record an explicit exemption for every model
   * that has not been onboarded to model-aware compilation.
   */
  private compileImageGenerationBrief(params: {
    createImageDto: CreateImageDto;
    height: number;
    model: string;
    promptOriginalText: string;
    referenceIds: string[];
    runReferences?: readonly ImageGenerationBriefReference[];
    style?: string;
    width: number;
  }): {
    brief?: ImageGenerationBrief;
    dispatch?: ImageGenerationBriefDispatch;
    evidence: GenerationBriefPersistedEvidence;
    generationSource: string;
  } {
    const composition = [
      params.createImageDto.camera,
      params.createImageDto.lens,
    ]
      .filter((value): value is string => Boolean(value?.trim()))
      .join(', ');
    const avoid = [
      ...(params.createImageDto.blacklist ?? []),
      ...(params.createImageDto.negativePrompt
        ? [params.createImageDto.negativePrompt]
        : []),
    ];

    try {
      return runImageGenerationBrief({
        avoid,
        brandingMode: params.createImageDto.brandingMode,
        composition,
        fidelityMode: params.createImageDto.fidelityMode,
        height: params.height,
        isBrandingEnabled: params.createImageDto.isBrandingEnabled,
        lighting: params.createImageDto.lighting,
        model: params.model,
        objective: params.promptOriginalText,
        referenceIds: params.referenceIds,
        references: params.runReferences,
        scene: params.createImageDto.scene,
        seed: params.createImageDto.seed,
        surface: 'studio',
        visualDirection: params.style || params.createImageDto.style,
        width: params.width,
      });
    } catch (error: unknown) {
      if (error instanceof GenerationBriefCompileError) {
        throw new HttpException(
          {
            detail: error.message,
            title: 'Generation brief compilation failed',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      throw error;
    }
  }

  /**
   * Create the prompt document, run the template-tracking prompt build, persist
   * the placeholder ingredient/metadata pair, and link the prompt. Returns the
   * documents the generation flow operates on.
   */
  private async persistImageDocuments(params: {
    brand: ImageGenerationResolvedBrand;
    brandPromptBranding: ReturnType<typeof buildPromptBrandingFromBrand>;
    briefEvidence: GenerationBriefPersistedEvidence;
    compiledDispatch?: ImageGenerationBriefDispatch;
    createImageDto: CreateImageDto;
    generationSource: string;
    height: number;
    model: string;
    modelInputSchema?: Record<string, unknown>;
    promptBuilderBrand: ImageGenerationContext['promptBuilderBrand'];
    promptOriginalText: string;
    referenceIds: string[];
    referenceImageUrls: string[];
    placeholderScope?: GenerationPlaceholderScope;
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
      briefEvidence,
      compiledDispatch,
      createImageDto,
      generationSource,
      height,
      model,
      modelInputSchema,
      promptBuilderBrand,
      promptOriginalText,
      user,
      referenceIds,
      referenceImageUrls,
      placeholderScope,
      style,
      width,
    } = params;

    const submittedPromptId = isEntityId(createImageDto.promptId)
      ? createImageDto.promptId
      : undefined;
    const submittedPrompt = submittedPromptId
      ? await this.promptsService.findOne({
          id: submittedPromptId,
          organizationId: user.organizationId,
          userId: user.userId ?? user.id,
        })
      : null;
    const promptData = submittedPrompt
      ? await this.promptsService.patch(submittedPrompt.id, {
          model,
          status: PromptStatus.PROCESSING,
        })
      : await this.promptsService.create(
          new PromptEntity({
            brandId: isEntityId(createImageDto.brandId)
              ? createImageDto.brandId
              : user.brandId,
            category: PromptCategory.MODELS_PROMPT_IMAGE,
            model,
            organizationId: user.organizationId,
            original: promptOriginalText,
            status: PromptStatus.PROCESSING,
            userId: user.userId ?? user.id,
          }),
        );

    let imageTemplateUsed: string | undefined;
    let imageTemplateVersion: number | undefined;
    if (!compiledDispatch) {
      const builtPrompt = await this.promptBuilderService.buildPrompt(
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
          modelInputSchema,
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
        user.organizationId,
      );
      imageTemplateUsed = builtPrompt.templateUsed;
      imageTemplateVersion = builtPrompt.templateVersion;
    }

    const { metadataData, ingredientData } =
      await this.sharedService.createMediaDocuments(user, {
        brandId: brand.id,
        category: IngredientCategory.IMAGE,
        extension: MetadataExtension.JPEG,
        generationPrompt: promptOriginalText,
        generationSeed: createImageDto.seed,
        generationSource,
        groupId: placeholderScope?.groupId,
        groupIndex: placeholderScope?.groupIndex,
        height,
        isDefault: createImageDto.isDefault,
        model,
        negativePrompt: createImageDto.negativePrompt,
        organizationId: user.organizationId,
        parentId: isEntityId(createImageDto.parentId)
          ? createImageDto.parentId
          : undefined,
        promptId: promptData.id,
        promptTemplate: imageTemplateUsed,
        providerData: toRedactedGenerationBriefProviderData(briefEvidence),
        scope: createImageDto.scope,
        sourceActionId: createImageDto.sourceActionId,
        sourceIds: referenceIds,
        style,
        tagIds: createImageDto.tags,
        templateVersion: imageTemplateVersion,
        width,
      });

    await this.imagesService.patch(ingredientData.id, {
      promptId: promptData.id,
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
    organizationId?: string,
  ): Promise<string> {
    if (createImageDto.autoSelectModel) {
      // Auto model routing - let RouterService pick the best model
      const recommendation = await this.routerService.selectModel({
        category: ModelCategory.IMAGE,
        dimensions: {
          height: createImageDto.height,
          width: createImageDto.width,
        },
        organizationId,
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

    // Manual selection runs through the one registry policy (#2422 Phase C):
    // each candidate is honoured only if the registry carries it as an active,
    // non-legacy row, so a request naming a retired key — or a brand still
    // pointing at one — falls through to the registry default instead of being
    // waved past a hard-coded MODEL_KEYS allowlist.
    const resolution = await this.routerService.resolveModelKey({
      candidates: [
        createImageDto.model as string | undefined,
        brand.defaultImageModel as string | undefined,
        organizationSettings?.defaultImageModel as string | undefined,
      ],
      category: ModelCategory.IMAGE,
      organizationId,
    });

    if (resolution.source === 'fallback-constant') {
      this.loggerService.error('Image model resolved from constant fallback', {
        model: resolution.key,
        service: this.constructorName,
      });
    }

    return resolution.key;
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
      this.cancellationService.bindCancelOnAbort({
        abortSignal: context.abortSignal,
        id: context.ingredientData.id.toString(),
        organizationId: context.user.organizationId,
        userId: context.user.userId,
      });
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
        // Error already handled by the provider execution boundary.
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
        { id: context.ingredientData.id },
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
          context.abortSignal,
        );
      return completedIngredients[0];
    }

    // poll-single
    return this.ingredientCompletionService.waitForIngredientCompletion(
      context.ingredientData.id.toString(),
      180000, // 3 minutes timeout
      2000, // 2 seconds poll interval
      IMAGE_POPULATE,
      context.abortSignal,
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
      { id: context.ingredientData.id },
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
}
