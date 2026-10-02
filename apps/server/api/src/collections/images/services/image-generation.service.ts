import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CreateImageDto } from '@api/collections/images/dto/create-image.dto';
import { EditImageDto } from '@api/collections/images/dto/edit-image.dto';
import type {
  ImageEditingContext,
  ImageGenerationCompletionPlan,
  ImageGenerationContext,
  ImageGenerationPreparedInputs,
  ImageGenerationResolvedBrand,
} from '@api/collections/images/services/image-generation.types';
import { ImageGenerationAdmissionService } from '@api/collections/images/services/image-generation-admission.service';
import {
  type ImageGenerationPersistenceParams,
  type ImageGenerationPersistenceResult,
  persistImageDocuments,
} from '@api/collections/images/services/image-generation-persistence.util';
import { ImageGenerationProviderDispatchService } from '@api/collections/images/services/image-generation-provider-dispatch.service';
import {
  type ImageGenerationSettingsParams,
  type ImageGenerationSettingsResult,
  prepareImageGenerationSettings,
} from '@api/collections/images/services/image-generation-settings.util';
import { ImagesService } from '@api/collections/images/services/images.service';
import { resolveImageGenerationModel } from '@api/collections/images/services/resolve-image-generation-model.util';
import { IngredientGenerationCancellationService } from '@api/collections/ingredients/services/ingredient-generation-cancellation.service';
import { ModelRegistrationService } from '@api/collections/models/services/model-registration.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { PromptsService } from '@api/collections/prompts/services/prompts.service';
import { TemplatesService } from '@api/collections/templates/services/templates.service';
import type {
  GenerationPlaceholderCreatedCallback,
  GenerationPlaceholderScope,
} from '@api/common/interfaces/generation-placeholder-lifecycle.interface';
import type { RequestWithContext as Request } from '@api/common/middleware/request-context.middleware';
import type { DeferredCreditsRequest } from '@api/helpers/utils/credits/generation-credit-cost.util';
import { createRequestAbortSignal } from '@api/helpers/utils/request/request-abort-signal.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import {
  GenerationBriefCompileError,
  type ImageGenerationBriefDispatch,
  runImageGenerationBrief,
} from '@api/services/generation-brief';
import { rawPromptBriefEvidence } from '@api/services/generation-brief/redact-generation-brief-evidence';
import { MediaPromptEnhancementService } from '@api/services/harness/media-prompt-enhancement.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { RouterService } from '@api/services/router/router.service';
import { IngredientCompletionService } from '@api/shared/services/poll-until/ingredient-completion.service';
import { PollTimeoutException } from '@api/shared/services/poll-until/poll-until.exception';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import { IngredientCategory, ModelCategory } from '@genfeedai/contracts';
import type {
  ImageGenerationBrief,
  ImageGenerationBriefReference,
} from '@genfeedai/contracts/api-types/contracts/generation-brief.contract';
import {
  buildGenerationBriefExemptionSource,
  type GenerationBriefPersistedEvidence,
} from '@genfeedai/contracts/api-types/contracts/generation-brief-compiler.contract';
import {
  isFlux3ImageModel,
  isImageEditModel,
  readImageEditingRecipe,
} from '@genfeedai/contracts/constants';
import type {
  GenerationHarnessReceipt,
  JsonApiSingleResponse,
} from '@genfeedai/contracts/interfaces';
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
    private readonly templatesService: TemplatesService,
    private readonly enhancementService: MediaPromptEnhancementService,
  ) {}

  async editImage(
    user: User,
    imageId: string,
    dto: EditImageDto,
    request: Request,
    onPlaceholderCreated?: GenerationPlaceholderCreatedCallback,
  ): Promise<JsonApiSingleResponse> {
    const brandId = dto.brandId || user.brandId;
    if (!brandId)
      throw new HttpException(
        'Select a brand before editing',
        HttpStatus.BAD_REQUEST,
      );
    if (dto.model && !isImageEditModel(dto.model))
      throw new HttpException(
        'This model does not support instruction-based image editing',
        HttpStatus.BAD_REQUEST,
      );
    const resolvedModel =
      dto.model ??
      (
        await this.routerService.resolveModelKey({
          category: ModelCategory.IMAGE_EDIT,
          organizationId: user.organizationId,
        })
      ).key;
    const admittedDto = Object.assign(new EditImageDto(), dto, {
      model: resolvedModel,
    });
    const editing = await this.admissionService.admitImageEdit(
      imageId,
      admittedDto,
      user.organizationId,
      brandId,
    );
    const normalized = Object.assign(new CreateImageDto(), {
      text: dto.prompt.trim(),
      brandId,
      model: resolvedModel,
      references: editing.sourceIds,
      parentId: imageId,
      width: editing.width,
      height: editing.height,
      outputs: dto.outputs ?? 1,
      seed: dto.seed,
      quality: isFlux3ImageModel(resolvedModel) ? undefined : 'medium',
      resolution: dto.resolution,
      aspectRatio: dto.aspectRatio,
      harness: false,
      brandingMode: 'off',
      useTemplate: false,
      sourceActionId: dto.sourceActionId,
      waitForCompletion: dto.waitForCompletion,
    });
    return this.generateImage(
      user,
      normalized,
      request,
      onPlaceholderCreated,
      undefined,
      undefined,
      undefined,
      editing,
    );
  }

  async generateImage(
    user: User,
    createImageDto: CreateImageDto,
    request: Request,
    onPlaceholderCreated?: GenerationPlaceholderCreatedCallback,
    placeholderScope?: GenerationPlaceholderScope,
    onCreditsPrepared?: () => Promise<void>,
    runReferences?: readonly ImageGenerationBriefReference[],
    editing?: ImageEditingContext,
  ): Promise<JsonApiSingleResponse> {
    const {
      brand,
      model,
      modelEndpoint,
      modelInputSchema,
      modelProvider,
      modelSchemaFamily,
      promptOriginalText,
    } = await this.resolveAndValidate(
      user,
      createImageDto,
      request,
      editing ? ModelCategory.IMAGE_EDIT : ModelCategory.IMAGE,
    );

    const accepted = await this.reuseAcceptedGeneration(
      user,
      createImageDto,
      request,
      model,
      onCreditsPrepared,
      editing,
    );
    if (accepted) return accepted;

    const {
      referenceIds,
      referenceImageUrls,
      referenceImageUrl,
      generationHarness,
    } = await this.prepareImageGenerationInputs(
      user,
      createImageDto,
      request,
      brand.id,
      model,
      promptOriginalText,
      editing,
    );

    const {
      brandPromptBranding,
      promptBuilderBrand,
      width,
      height,
      style,
      outputs,
      briefBrandContext,
    } = await this.prepareImageGenerationSettings({
      brand,
      createImageDto,
      organizationId: user.organizationId,
      model,
    });

    const compiledBrief = editing
      ? {
          evidence: undefined,
          dispatch: undefined,
          brief: undefined,
          generationSource: 'image-edit',
        }
      : await this.compileImageGenerationBrief({
          briefBrandContext,
          createImageDto,
          height,
          model,
          generationHarness,
          organizationId: user.organizationId,
          referenceIds,
          runReferences,
          style,
          width,
        });

    const { promptData, metadataData, ingredientData, providerInput } =
      await this.persistImageDocuments({
        editing,
        brand,
        brandPromptBranding,
        briefEvidence: compiledBrief.evidence,
        compiledDispatch: compiledBrief.dispatch,
        createImageDto,
        generationSource: compiledBrief.generationSource,
        generationHarness,
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

    const context: ImageGenerationContext = {
      editing,
      generationHarness,
      providerInput,
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
      websocketUrl: WebSocketPaths.image(ingredientData.id),
      width,
      abortSignal: createRequestAbortSignal(request),
    };

    return this.dispatchAndFinish(
      context,
      onPlaceholderCreated,
      onCreditsPrepared,
    );
  }

  private async reuseAcceptedGeneration(
    user: User,
    createImageDto: CreateImageDto,
    request: Request,
    model: string,
    onCreditsPrepared?: () => Promise<void>,
    editing?: ImageEditingContext,
  ): Promise<JsonApiSingleResponse | null> {
    if (editing) editing.recipe.model = model;
    if (isFlux3ImageModel(model))
      this.admissionService.assertFlux3Controls(createImageDto);
    const accepted = await this.admissionService.findReusableIngredient(
      createImageDto.sourceActionId,
      user.organizationId,
    );
    if (accepted) {
      const providerData = accepted.metadata?.providerData;
      const acceptedEdit = readImageEditingRecipe(
        typeof providerData === 'object' && providerData !== null
          ? (providerData as Record<string, unknown>).imageEdit
          : undefined,
      );
      if (
        (editing &&
          (accepted.brandId !== (createImageDto.brandId || user.brandId) ||
            accepted.metadata?.model !== model ||
            accepted.parentId !== createImageDto.parentId ||
            accepted.generationPrompt !== createImageDto.text ||
            JSON.stringify(acceptedEdit) !==
              JSON.stringify(readImageEditingRecipe(editing.recipe)))) ||
        (!editing && acceptedEdit)
      ) {
        throw new HttpException(
          'This action already belongs to a different image request.',
          HttpStatus.CONFLICT,
        );
      }
      await this.admissionService.ensureCredits(
        createImageDto,
        model,
        user.organizationId,
        request,
        onCreditsPrepared,
      );
      let pendingIngredientIds: string[] | undefined;
      if (editing && createImageDto.sourceActionId) {
        const batch = await this.imagesService.findAll(
          {
            organizationId: user.organizationId,
            brandId: accepted.brandId,
            category: IngredientCategory.IMAGE,
            isDeleted: false,
            sourceActionId: createImageDto.sourceActionId,
            parentId: accepted.parentId,
            generationSource: 'image-edit',
          },
          {
            pagination: false,
            populate: IMAGE_POPULATE,
            sort: { createdAt: 1 },
          },
          false,
        );
        pendingIngredientIds = batch.docs
          .filter((output) => {
            const data = output.metadata?.providerData;
            const recipe = readImageEditingRecipe(
              typeof data === 'object' && data !== null
                ? (data as Record<string, unknown>).imageEdit
                : undefined,
            );
            return (
              output.generationPrompt === createImageDto.text &&
              JSON.stringify(recipe) === JSON.stringify(acceptedEdit)
            );
          })
          .map((output) => output.id.toString());
        if (pendingIngredientIds.length !== editing.recipe.outputs)
          throw new HttpException(
            'This editing batch is still being admitted. Retry shortly.',
            HttpStatus.CONFLICT,
          );
      }
      return serializeSingle(request, IngredientSerializer, {
        ...accepted,
        ...(pendingIngredientIds ? { pendingIngredientIds } : {}),
      });
    }
    return null;
  }

  private async enhanceGenerationPrompt(
    user: User,
    createImageDto: CreateImageDto,
    request: Request,
    brandId: string,
    model: string,
    promptOriginalText: string,
  ) {
    const generationHarness = await this.enhancementService.enhance({
      actorUserId: user.userId ?? user.id,
      organizationId: user.organizationId,
      brandId,
      prompt: promptOriginalText,
      contentType: 'image',
      model,
      harness: createImageDto.harness,
      ...(createImageDto.knowledge
        ? { knowledgeSelection: createImageDto.knowledge }
        : {}),
      promptId: createImageDto.promptId,
      ...(createImageDto.requestedSkillSlugs?.length
        ? { requestedSkillSlugs: createImageDto.requestedSkillSlugs }
        : {}),
    });
    if (request.generationOriginalPrompt !== undefined) {
      if (
        generationHarness.status === 'skipped' &&
        request.generationOriginalPrompt !== promptOriginalText
      ) {
        throw new HttpException(
          'Remove selected context or enable prompt enhancement.',
          HttpStatus.BAD_REQUEST,
        );
      }
      generationHarness.originalPrompt = request.generationOriginalPrompt;
    }
    return generationHarness;
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
        context.compiledDispatch ?? context.providerInput,
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
    modelCategory: ModelCategory = ModelCategory.IMAGE,
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

    const model = await resolveImageGenerationModel(
      {
        routerService: this.routerService,
        loggerService: this.loggerService,
        constructorName: this.constructorName,
      },
      createImageDto,
      promptOriginalText,
      brand,
      organizationSettings,
      user.organizationId,
      modelCategory,
    );

    if (modelCategory === ModelCategory.IMAGE_EDIT && !isImageEditModel(model))
      throw new HttpException(
        'The configured editing model is unavailable. Select a supported editing model.',
        HttpStatus.BAD_REQUEST,
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
    if (registeredModel && registeredModel.category !== modelCategory)
      throw new HttpException(
        'Select a model for this image operation.',
        HttpStatus.BAD_REQUEST,
      );
    if (isFlux3ImageModel(model))
      this.admissionService.assertFlux3Controls(createImageDto);
    const approvedQuote = (request as unknown as DeferredCreditsRequest)
      .creditsConfig?.approvedImageQuote;
    if (approvedQuote) {
      if (!validationOrgId) {
        throw new HttpException(
          'An organization is required to honor an approved image quote.',
          HttpStatus.CONFLICT,
        );
      }
      if (
        model !== approvedQuote.model ||
        registeredModel?.key !== approvedQuote.model
      ) {
        throw new HttpException(
          'The approved image model changed. Request a fresh quote.',
          HttpStatus.CONFLICT,
        );
      }
      await this.admissionService.assertApprovedQuote(
        createImageDto,
        model,
        validationOrgId,
        request,
      );
    }
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
  private async compileImageGenerationBrief(params: {
    briefBrandContext?: string;
    createImageDto: CreateImageDto;
    height: number;
    model: string;
    generationHarness: GenerationHarnessReceipt;
    organizationId: string;
    referenceIds: string[];
    runReferences?: readonly ImageGenerationBriefReference[];
    style?: string;
    width: number;
  }): Promise<{
    brief?: ImageGenerationBrief;
    dispatch?: ImageGenerationBriefDispatch;
    evidence: GenerationBriefPersistedEvidence;
    generationSource: string;
  }> {
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
      const compiled = runImageGenerationBrief({
        avoid,
        brandContext: params.briefBrandContext,
        brandingMode: params.createImageDto.brandingMode,
        composition,
        fidelityMode: params.createImageDto.fidelityMode,
        height: params.height,
        isBrandingEnabled: params.createImageDto.isBrandingEnabled,
        lighting: params.createImageDto.lighting,
        model: params.model,
        objective: params.generationHarness.enhancedPrompt,
        quality: params.createImageDto.quality,
        referenceIds: params.referenceIds,
        references: params.runReferences,
        scene: params.createImageDto.scene,
        seed: params.createImageDto.seed,
        surface: 'studio',
        visualDirection: params.style || params.createImageDto.style,
        width: params.width,
      });
      if (
        params.generationHarness.status === 'skipped' ||
        params.generationHarness.status === 'failed'
      ) {
        if (compiled.dispatch)
          compiled.dispatch.prompt = params.generationHarness.originalPrompt;
        compiled.evidence = rawPromptBriefEvidence(compiled.evidence);
        compiled.generationSource = buildGenerationBriefExemptionSource(
          'raw_prompt_requested',
        );
      }

      compiled.dispatch = await this.admissionService.resolveDispatchReferences(
        compiled,
        params.organizationId,
      );

      return compiled;
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

  private prepareImageGenerationSettings(
    params: ImageGenerationSettingsParams,
  ): Promise<ImageGenerationSettingsResult> {
    return prepareImageGenerationSettings(params, {
      templatesService: this.templatesService,
      loggerService: this.loggerService,
    });
  }

  private persistImageDocuments(
    params: ImageGenerationPersistenceParams,
  ): Promise<ImageGenerationPersistenceResult> {
    return persistImageDocuments(params, {
      promptsService: this.promptsService,
      promptBuilderService: this.promptBuilderService,
      sharedService: this.sharedService,
      imagesService: this.imagesService,
    });
  }

  private async prepareImageGenerationInputs(
    user: User,
    createImageDto: CreateImageDto,
    request: Request,
    brandId: string,
    model: string,
    promptOriginalText: string,
    editing?: ImageEditingContext,
  ): Promise<ImageGenerationPreparedInputs> {
    const referenceIds = (createImageDto.references ?? []).map(String);

    const referenceImageUrls =
      editing?.sourceUrls ??
      (isFlux3ImageModel(model)
        ? await this.admissionService.resolveFlux3References(
            user.organizationId,
            brandId,
            referenceIds,
          )
        : await this.admissionService.resolveReferenceImageUrls(
            user.organizationId,
            referenceIds,
          ));

    const referenceImageUrl: string | null = referenceImageUrls[0] || null;

    const generationHarness: GenerationHarnessReceipt = editing
      ? {
          originalPrompt: promptOriginalText,
          enhancedPrompt: promptOriginalText,
          status: 'skipped',
          source: 'request',
          brandId: brandId,
          appliedPacks: [],
        }
      : await this.enhanceGenerationPrompt(
          user,
          createImageDto,
          request,
          brandId,
          model,
          promptOriginalText,
        );

    return {
      referenceIds,
      referenceImageUrls,
      referenceImageUrl,
      generationHarness,
    };
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
          context.editing && typeof completed === 'object' && completed !== null
            ? {
                ...completed,
                pendingIngredientIds: context.pendingIngredientIds,
              }
            : completed,
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
