import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { buildPromptBrandingFromBrand } from '@api/collections/brands/utils/brand-context.util';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { ModelRegistrationService } from '@api/collections/models/services/model-registration.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import { PromptEntity } from '@api/collections/prompts/entities/prompt.entity';
import { PromptsService } from '@api/collections/prompts/services/prompts.service';
import { TemplatesService } from '@api/collections/templates/services/templates.service';
import { CreateVideoDto } from '@api/collections/videos/dto/create-video.dto';
import { compileSubmittedAdPreset } from '@api/collections/videos/services/ad-preset-submit.util';
import { assertAudioReferencesSupported } from '@api/collections/videos/services/minimax-h3-reference.util';
import {
  assertSeedanceReferenceBinding,
  bindSeedanceVideoReferences,
  requireSeedanceStoredReferenceKey,
  type SeedanceVideoReferenceEvidence,
  seedanceVideoReferenceLimit,
} from '@api/collections/videos/services/seedance-reference-evidence.util';
import { measureStoredSeedanceVideoReferences } from '@api/collections/videos/services/seedance-reference-measurement.util';
import type {
  PromptInput,
  ResolvedVideoGenerationRequest,
  VideoGenerationContext,
} from '@api/collections/videos/services/video-generation.types';
import {
  collectGenerationSourceIds,
  prepareGenerationBrief,
} from '@api/collections/videos/services/video-generation-brief.util';
import { buildVideoDirection } from '@api/collections/videos/services/video-generation-direction.util';
import {
  brandPromptLabel,
  emptyStyleToNull,
  optionalBrandString,
  pickVideoModelPreference,
} from '@api/collections/videos/services/video-generation-model.util';
import {
  createMissingPromptIdException,
  hasStoredPromptId,
  requireVideoPromptInput,
  resolveInlinePromptText,
  resolveStoredPromptText,
} from '@api/collections/videos/services/video-generation-prompt.util';
import { resolveStoredAudioReferences } from '@api/collections/videos/services/video-generation-reference.util';
import {
  assertReferenceMentionInvariant,
  resolveVideoReferenceMentionBindings,
} from '@api/collections/videos/services/video-reference-mentions';
import { VideoReferenceUrlService } from '@api/collections/videos/services/video-reference-url.service';
import type { GenerationPlaceholderScope } from '@api/common/interfaces/generation-placeholder-lifecycle.interface';
import type { RequestWithContext as Request } from '@api/common/middleware/request-context.middleware';
import type { RequestWithSelectedModel } from '@api/helpers/guards/models/request-with-selected-model.interface';
import { CategoryPrismaUtil } from '@api/helpers/utils/category-prisma/category-prisma.util';
import {
  isImageToVideoRequest,
  resolveGenerationDefaultModel,
} from '@api/helpers/utils/generation-defaults/generation-defaults.util';
import { createRequestAbortSignal } from '@api/helpers/utils/request/request-abort-signal.util';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { toRedactedVideoGenerationBriefProviderData } from '@api/services/generation-brief';
import { MediaPromptEnhancementService } from '@api/services/harness/media-prompt-enhancement.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { RouterService } from '@api/services/router/router.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import {
  IngredientCategory,
  IngredientOrigin,
  IngredientStatus,
  MetadataExtension,
  ModelCategory,
  ModelProvider,
  PromptCategory,
  PromptStatus,
} from '@genfeedai/contracts';
import type { GenerationBriefReference } from '@genfeedai/contracts/api-types/contracts/generation-brief.contract';
import {
  getModelMaxVideoReferences,
  hasVideoReferences,
} from '@genfeedai/contracts/constants';
import { resolveGenerationDimensions } from '@genfeedai/pricing';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

export {
  assertSeedanceReferenceVideoDuration,
  MAX_SEEDANCE_REFERENCE_VIDEO_SECONDS,
} from '@api/collections/videos/services/seedance-reference-evidence.util';

@Injectable()
export class VideoGenerationPreparationService {
  constructor(
    private readonly referenceUrls: VideoReferenceUrlService,
    private readonly brandsService: BrandsService,
    private readonly configService: ConfigService,
    private readonly filesClientService: FilesClientService,
    private readonly ingredientsService: IngredientsService,
    private readonly loggerService: LoggerService,
    private readonly modelRegistrationService: ModelRegistrationService,
    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly personasService: PersonasService,
    private readonly promptBuilderService: PromptBuilderService,
    private readonly promptsService: PromptsService,
    private readonly routerService: RouterService,
    private readonly sharedService: SharedService,
    private readonly templatesService: TemplatesService,
    private readonly enhancementService: MediaPromptEnhancementService,
  ) {}

  async resolve(
    user: User,
    createVideoDto: CreateVideoDto,
    request: RequestWithSelectedModel<Request>,
  ): Promise<ResolvedVideoGenerationRequest> {
    if (!createVideoDto.adPreset && !requireVideoPromptInput(createVideoDto)) {
      throw new HttpException(
        {
          detail: 'Prompt is required',
          title: 'Prompt validation failed',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const brand = await this.brandsService.findOne({
      id: createVideoDto.brandId || user.brandId,
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

    const referenceIds = Array.isArray(createVideoDto.references)
      ? createVideoDto.references.map((id) => id.toString())
      : [];
    // A character the active brand can no longer use is refused here, before
    // any output or credit charge (#6040).
    const { grantedAvatarOwners, personaId } =
      await this.personasService.resolveCharacterReferences({
        brandId: brand.id,
        ingredientIds: [
          ...referenceIds,
          ...(createVideoDto.endFrame ? [String(createVideoDto.endFrame)] : []),
          ...(createVideoDto.videoReferences ?? []).map(String),
        ],
        organizationId: user.organizationId,
        path: 'video',
      });
    const organizationSettings = await this.organizationSettingsService.findOne(
      {
        organizationId: user.organizationId,
      },
    );
    const model = await this.resolveVideoModel(
      createVideoDto,
      brand,
      organizationSettings,
      referenceIds,
      user.organizationId,
    );
    const validationOrgId =
      user.organizationId || request.context?.organizationId;
    const registeredModel = validationOrgId
      ? await this.modelRegistrationService.validateModelForOrg(
          model,
          validationOrgId,
        )
      : undefined;
    createVideoDto = await compileSubmittedAdPreset({
      dto: createVideoDto,
      ingredients: this.ingredientsService,
      organizationId: user.organizationId,
      brandId: brand.id,
      model,
    });
    const nativeReferenceLimit =
      registeredModel?.provider === ModelProvider.FAL
        ? seedanceVideoReferenceLimit(registeredModel.endpoint ?? '')
        : null;
    assertAudioReferencesSupported(
      model,
      createVideoDto.audioReferences ?? [],
      registeredModel?.provider,
    );
    const videoReferenceIds = createVideoDto.videoReferences ?? [];
    if (
      videoReferenceIds.length > 0 &&
      !nativeReferenceLimit &&
      !hasVideoReferences(model)
    ) {
      throw new HttpException(
        {
          detail:
            'The selected model accepts stills only and cannot use video references',
          title: 'Unsupported video reference',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    const videoReferenceLimit =
      nativeReferenceLimit ?? getModelMaxVideoReferences(model);
    if (videoReferenceIds.length > videoReferenceLimit) {
      throw new HttpException(
        {
          detail: `The selected model accepts at most ${videoReferenceLimit} video references`,
          title: 'Too many video references',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    const audioReferenceUrls = await resolveStoredAudioReferences(
      this.ingredientsService,
      this.filesClientService,
      user.organizationId,
      createVideoDto.audioReferences ?? [],
    );
    const rawInputSchema = registeredModel?.providerInputSchema;
    const modelInputSchema =
      rawInputSchema &&
      typeof rawInputSchema === 'object' &&
      !Array.isArray(rawInputSchema)
        ? (rawInputSchema as Record<string, unknown>)
        : undefined;

    return {
      audioReferenceUrls,
      brand,
      createVideoDto,
      model,
      modelEndpoint: registeredModel?.endpoint || model,
      modelInputSchema,
      modelProvider: registeredModel?.provider,
      modelSchemaFamily: registeredModel?.providerSchemaFamily ?? undefined,
      grantedAvatarOwners,
      personaId,
      referenceIds,
      request,
      user,
    };
  }

  async prepare(
    resolved: ResolvedVideoGenerationRequest,
    placeholderScope?: GenerationPlaceholderScope,
    runReferences?: readonly GenerationBriefReference[],
  ): Promise<VideoGenerationContext> {
    const { brand, createVideoDto, model, referenceIds, request, user } =
      resolved;
    const nativeVideoReferences = await this.resolveNativeReferences(resolved);
    const { height, width } = resolveGenerationDimensions(
      createVideoDto.width,
      createVideoDto.height,
    );
    const { endFrameUrl, referenceImageUrls } =
      await this.resolveReferenceUrls(resolved);
    const promptText = await this.resolvePromptText(resolved);
    const positionalReferences = resolveVideoReferenceMentionBindings({
      model,
      text: promptText,
      imageReferenceIds: referenceIds,
      videoReferenceIds: createVideoDto.videoReferences,
      audioReferenceIds: createVideoDto.audioReferences,
      endFrameId: createVideoDto.endFrame,
      hasEditMask:
        createVideoDto.maskId != null || createVideoDto.editMask != null,
      runReferences,
    });
    const generationHarness = await this.enhanceGenerationPrompt(
      user,
      createVideoDto,
      request,
      brand.id,
      model,
      promptText,
    );

    const {
      compiledDispatch,
      brief: generationBrief,
      evidence: briefEvidence,
      generationSource,
    } = await prepareGenerationBrief(
      {
        configService: this.configService,
        filesClientService: this.filesClientService,
        ingredientsService: this.ingredientsService,
        loggerService: this.loggerService,
        referenceUrls: this.referenceUrls,
        templatesService: this.templatesService,
      },
      {
        generationHarness,
        height,
        resolved,
        runReferences: runReferences ?? positionalReferences,
        width,
      },
    );

    const { promptParams, templateUsed, templateVersion } =
      await this.resolvePromptParams({
        compiledDispatch,
        endFrameUrl,
        height,
        promptText: generationHarness.enhancedPrompt,
        referenceImageUrls,
        resolved,
        width,
      });
    if (nativeVideoReferences)
      promptParams.video_urls = nativeVideoReferences.map(
        (reference) => reference.url,
      );
    if (
      generationHarness.status === 'applied' &&
      typeof promptParams.prompt === 'string'
    ) {
      generationHarness.enhancedPrompt = promptParams.prompt;
    }
    promptParams.prompt = generationHarness.enhancedPrompt;
    assertReferenceMentionInvariant({
      originalText: promptText,
      preparedText: generationHarness.enhancedPrompt,
    });
    const promptInput = promptParams as PromptInput;
    const promptData = await this.createGenerationPrompt(resolved, promptText);
    const { metadataData, ingredientData } =
      await this.sharedService.createMediaDocuments(user, {
        origin: IngredientOrigin.GENERATED,
        bookmarkId: createVideoDto.bookmark
          ? (createVideoDto.bookmark as string)
          : undefined,
        brandId: brand.id,
        category: CategoryPrismaUtil.toIngredientCategory(
          IngredientCategory.VIDEO,
        ),
        duration: createVideoDto.duration,
        extension: MetadataExtension.MP4,
        generationPrompt: generationHarness.enhancedPrompt,
        generationHarness,
        generationSeed: createVideoDto.seed,
        generationSource,
        groupId: placeholderScope?.groupId,
        groupIndex: placeholderScope?.groupIndex,
        hasAudio: createVideoDto.isAudioEnabled,
        height,
        isDefault: createVideoDto.isDefault,
        language: createVideoDto.language,
        model,
        negativePrompt: createVideoDto.negativePrompt,
        organizationId: brand.organizationId,
        personaId: resolved.personaId,
        promptId: promptData.id,
        promptTemplate: templateUsed,
        providerData: toRedactedVideoGenerationBriefProviderData(briefEvidence),
        resolution: createVideoDto.resolution,
        scope: createVideoDto.scope,
        sourceActionId: createVideoDto.sourceActionId,
        sourceIds: collectGenerationSourceIds(createVideoDto, referenceIds),
        status: IngredientStatus.PROCESSING,
        style: emptyStyleToNull(createVideoDto.style),
        tagIds: createVideoDto.tags,
        templateVersion,
        width,
      });

    return {
      ...resolved,
      nativeVideoReferences,
      generationHarness,
      abortSignal: createRequestAbortSignal(request),
      briefEvidence,
      compiledDispatch,
      generationBrief,
      generationSource,
      height,
      ingredientData,
      metadataData,
      pendingIngredientIds: [ingredientData.id.toString()],
      promptData,
      promptInput,
      promptParams,
      referenceImageUrls,
      width,
    };
  }

  private async resolveNativeReferences(
    resolved: ResolvedVideoGenerationRequest,
  ): Promise<SeedanceVideoReferenceEvidence[] | undefined> {
    const { modelProvider, modelEndpoint, createVideoDto, user } = resolved;
    const endpoint = modelEndpoint ?? '';
    if (
      modelProvider !== ModelProvider.FAL ||
      !seedanceVideoReferenceLimit(endpoint) ||
      !createVideoDto.videoReferences?.length
    )
      return undefined;
    return measureStoredSeedanceVideoReferences(
      {
        files: this.filesClientService,
        findStoredVideo: async (id, organizationId) => {
          const ingredient = await this.ingredientsService.findOne({
            id,
            organizationId,
            isDeleted: false,
            category: IngredientCategory.VIDEO,
          });
          return ingredient ? { s3Key: ingredient.s3Key ?? null } : null;
        },
      },
      {
        endpoint,
        organizationId: user.organizationId,
        assetIds: createVideoDto.videoReferences.map(String),
      },
    );
  }

  async assertFreshNativeVideoReferences(
    context: VideoGenerationContext,
  ): Promise<void> {
    const references = context.nativeVideoReferences;
    if (!references?.length) return;
    const endpoint = context.modelEndpoint ?? '';
    const organizationId = context.user.organizationId;
    const fresh: SeedanceVideoReferenceEvidence[] = [];
    for (const reference of references) {
      const ingredient = await this.ingredientsService.findOne({
        id: reference.assetId,
        organizationId,
        isDeleted: false,
        category: IngredientCategory.VIDEO,
      });
      requireSeedanceStoredReferenceKey(ingredient?.s3Key, reference.sourceKey);
      const url =
        await this.filesClientService.getPresignedDownloadUrlForObjectKey(
          reference.sourceKey,
        );
      const fingerprint = await this.filesClientService.fingerprintMedia(url);
      fresh.push({
        ...reference,
        sourceVersion: fingerprint.assetHash,
        sizeBytes: fingerprint.sizeBytes,
      });
    }
    assertSeedanceReferenceBinding(
      bindSeedanceVideoReferences(endpoint, organizationId, references),
      bindSeedanceVideoReferences(endpoint, organizationId, fresh),
    );
  }

  private createGenerationPrompt(
    resolved: ResolvedVideoGenerationRequest,
    promptText: string,
  ) {
    const { createVideoDto, user } = resolved;
    return this.promptsService.create(
      new PromptEntity({
        blacklists: createVideoDto.blacklist,
        brandId: resolved.brand.id,
        camera: createVideoDto.camera,
        category: PromptCategory.MODELS_PROMPT_VIDEO,
        mood: createVideoDto.mood,
        organizationId: user.organizationId,
        original: promptText,
        scene: createVideoDto.scene,
        sounds: createVideoDto.sounds,
        speech: createVideoDto.speech,
        status: PromptStatus.PROCESSING,
        style: createVideoDto.style,
        userId: user.userId ?? user.id,
      }),
    );
  }

  private async enhanceGenerationPrompt(
    user: User,
    createVideoDto: CreateVideoDto,
    request: Request,
    brandId: string,
    model: string,
    promptText: string,
  ) {
    const generationHarness = await this.enhancementService.enhance({
      actorUserId: user.userId ?? user.id,
      isApiKey: user.isApiKey,
      apiKeyId: user.apiKeyId,
      scopes: user.scopes,
      organizationId: user.organizationId,
      brandId,
      prompt: promptText,
      contentType: 'video',
      creativeDirection: buildVideoDirection(createVideoDto).enhancer,
      model,
      harness: createVideoDto.harness,
      ...(createVideoDto.brandMode
        ? { brandMode: createVideoDto.brandMode }
        : {}),
      ...(createVideoDto.promptAuthor
        ? { promptAuthor: createVideoDto.promptAuthor }
        : {}),
      ...(createVideoDto.knowledge
        ? { knowledgeSelection: createVideoDto.knowledge }
        : {}),
      promptId: createVideoDto.promptId,
      ...(createVideoDto.requestedSkillSlugs?.length
        ? { requestedSkillSlugs: createVideoDto.requestedSkillSlugs }
        : {}),
    });
    if (request.generationOriginalPrompt !== undefined) {
      if (
        generationHarness.status === 'skipped' &&
        request.generationOriginalPrompt !== promptText
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

  private async resolvePromptParams(params: {
    compiledDispatch?: Record<string, unknown>;
    endFrameUrl?: string;
    height: number;
    promptText: string;
    referenceImageUrls: string[];
    resolved: ResolvedVideoGenerationRequest;
    width: number;
  }): Promise<{
    promptParams: Record<string, unknown>;
    templateUsed?: string;
    templateVersion?: number;
  }> {
    const { compiledDispatch, ...buildParams } = params;
    if (compiledDispatch) return { promptParams: compiledDispatch };
    return this.buildPromptParams(buildParams);
  }

  private async buildPromptParams(params: {
    endFrameUrl?: string;
    height: number;
    promptText: string;
    referenceImageUrls: string[];
    resolved: ResolvedVideoGenerationRequest;
    width: number;
  }): Promise<{
    promptParams: Record<string, unknown>;
    templateUsed?: string;
    templateVersion?: number;
  }> {
    const {
      endFrameUrl,
      height,
      promptText,
      referenceImageUrls,
      resolved,
      width,
    } = params;
    const { brand, createVideoDto, model, request, user } = resolved;
    const built = await this.promptBuilderService.buildPrompt(
      model,
      {
        audioReferences: resolved.audioReferenceUrls
          ? [...resolved.audioReferenceUrls.values()]
          : undefined,
        audioUrl: createVideoDto.audioUrl,
        blacklist: createVideoDto.blacklist,
        brand: {
          description: optionalBrandString(brand.description),
          label: brandPromptLabel(brand.label),
          primaryColor: optionalBrandString(brand.primaryColor),
          secondaryColor: optionalBrandString(brand.secondaryColor),
          text: optionalBrandString(brand.text),
        },
        branding: buildPromptBrandingFromBrand(brand),
        brandingMode: createVideoDto.brandingMode,
        camera: createVideoDto.camera,
        cameraMovement: createVideoDto.cameraMovement,
        duration: createVideoDto.duration,
        endFrame: endFrameUrl,
        fontFamily: createVideoDto.fontFamily,
        height,
        isAudioEnabled: createVideoDto.isAudioEnabled,
        isBrandingEnabled: createVideoDto.isBrandingEnabled,
        lens: createVideoDto.lens,
        lighting: createVideoDto.lighting,
        modelInputSchema: resolved.modelInputSchema,
        modelCategory:
          (request.selectedModel?.category as ModelCategory) ||
          ModelCategory.VIDEO,
        mood: createVideoDto.mood,
        outputs: createVideoDto.outputs,
        prompt: promptText,
        promptTemplate: createVideoDto.promptTemplate,
        references: referenceImageUrls,
        resolution: createVideoDto.resolution,
        scene: createVideoDto.scene,
        seed: createVideoDto.seed,
        sounds: createVideoDto.sounds,
        speech: createVideoDto.speech,
        style: createVideoDto.style,
        tags: createVideoDto.tags?.map((tag) => tag.toString()),
        useTemplate: createVideoDto.useTemplate,
        width,
      },
      user.organizationId,
    );
    return {
      promptParams: built.input,
      templateUsed: built.templateUsed,
      templateVersion: built.templateVersion,
    };
  }

  private async resolveReferenceUrls(
    resolved: ResolvedVideoGenerationRequest,
  ): Promise<{ endFrameUrl?: string; referenceImageUrls: string[] }> {
    const referenceImageUrls = await this.referenceUrls.resolveUrls({
      grantedOwners: resolved.grantedAvatarOwners,
      organizationId: resolved.user.organizationId,
      referenceIds: resolved.referenceIds,
    });
    if (!resolved.createVideoDto.endFrame) {
      return { referenceImageUrls };
    }
    const endFrameUrls = await this.referenceUrls.resolveUrls({
      grantedOwners: resolved.grantedAvatarOwners,
      organizationId: resolved.user.organizationId,
      referenceIds: [resolved.createVideoDto.endFrame],
    });
    return { endFrameUrl: endFrameUrls[0], referenceImageUrls };
  }

  private async resolvePromptText(
    resolved: ResolvedVideoGenerationRequest,
  ): Promise<string> {
    const promptId = resolved.createVideoDto.promptId;
    const inlineText = resolveInlinePromptText(
      promptId,
      resolved.createVideoDto.text,
    );
    if (inlineText !== undefined) {
      return inlineText;
    }
    if (!promptId) {
      throw createMissingPromptIdException();
    }
    const validationOrgId =
      resolved.user.organizationId || resolved.request.context?.organizationId;
    const prompt = await this.promptsService.findOne({
      id: promptId.toString(),
      ...(validationOrgId ? { organizationId: validationOrgId } : {}),
    });
    if (!hasStoredPromptId(prompt)) {
      throw new HttpException(
        {
          detail: 'The referenced prompt could not be found',
          title: 'Prompt not found',
        },
        HttpStatus.NOT_FOUND,
      );
    }
    return resolveStoredPromptText(prompt);
  }

  private async resolveVideoModel(
    createVideoDto: CreateVideoDto,
    brand: {
      defaultImageToVideoModel?: unknown;
      defaultVideoModel?: unknown;
    },
    organizationSettings: {
      defaultImageToVideoModel?: unknown;
      defaultVideoModel?: unknown;
    } | null,
    referenceIds: string[],
    organizationId?: string,
  ): Promise<string> {
    if (createVideoDto.autoSelectModel) {
      const recommendation = await this.routerService.selectModel({
        category: ModelCategory.VIDEO,
        dimensions: {
          height: createVideoDto.height,
          width: createVideoDto.width,
        },
        duration: createVideoDto.duration,
        organizationId,
        prioritize: createVideoDto.prioritize || 'balanced',
        prompt: createVideoDto.text || '',
        requiresEndFrame: Boolean(createVideoDto.endFrame),
        speech: createVideoDto.speech,
      });
      this.loggerService.log(
        'Auto model routing selected',
        recommendation.reason,
      );
      return recommendation.selectedModel as string;
    }

    const isImageToVideo = isImageToVideoRequest({
      endFrame: createVideoDto.endFrame,
      references: referenceIds,
    });
    return resolveGenerationDefaultModel<string>({
      brandDefault: pickVideoModelPreference(isImageToVideo, brand),
      explicit: createVideoDto.model as string | undefined,
      organizationDefault: pickVideoModelPreference(
        isImageToVideo,
        organizationSettings,
      ),
      systemDefault: (await this.routerService.getDefaultModel(
        ModelCategory.VIDEO,
      )) as string,
    });
  }
}
