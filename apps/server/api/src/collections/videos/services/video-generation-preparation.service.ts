import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AssetsService } from '@api/collections/assets/services/assets.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { buildPromptBrandingFromBrand } from '@api/collections/brands/utils/brand-context.util';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { ModelRegistrationService } from '@api/collections/models/services/model-registration.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { PromptEntity } from '@api/collections/prompts/entities/prompt.entity';
import { PromptsService } from '@api/collections/prompts/services/prompts.service';
import { CreateVideoDto } from '@api/collections/videos/dto/create-video.dto';
import type {
  PromptInput,
  ResolvedVideoGenerationRequest,
  VideoGenerationContext,
} from '@api/collections/videos/services/video-generation.types';
import {
  brandPromptLabel,
  emptyStyleToNull,
  optionalBrandString,
  pickVideoModelPreference,
} from '@api/collections/videos/services/video-generation-model.util';
import {
  hasStoredPromptId,
  requireVideoPromptInput,
  resolveInlinePromptText,
  resolveStoredPromptText,
} from '@api/collections/videos/services/video-generation-prompt.util';
import type { GenerationPlaceholderScope } from '@api/common/interfaces/generation-placeholder-lifecycle.interface';
import type { RequestWithContext as Request } from '@api/common/middleware/request-context.middleware';
import { CategoryPrismaUtil } from '@api/helpers/utils/category-prisma/category-prisma.util';
import { resolveGenerationDimensions } from '@api/helpers/utils/credits/generation-credit-cost.util';
import {
  isImageToVideoRequest,
  resolveGenerationDefaultModel,
} from '@api/helpers/utils/generation-defaults/generation-defaults.util';
import {
  buildReferenceImageUrl,
  buildReferenceImageUrls,
} from '@api/helpers/utils/reference/reference.util';
import { createRequestAbortSignal } from '@api/helpers/utils/request/request-abort-signal.util';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import {
  GenerationBriefCompileError,
  runVideoGenerationBrief,
  toRedactedVideoGenerationBriefProviderData,
} from '@api/services/generation-brief';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { RouterService } from '@api/services/router/router.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import {
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
  ModelCategory,
  PromptCategory,
  PromptStatus,
} from '@genfeedai/contracts';
import type {
  GenerationBriefReference,
  VideoGenerationBrief,
} from '@genfeedai/contracts/api-types/contracts/generation-brief.contract';
import type { VideoGenerationBriefPersistedEvidence } from '@genfeedai/contracts/api-types/contracts/video-generation-brief-compiler.contract';
import {
  getModelMaxVideoReferences,
  hasVideoReferences,
} from '@genfeedai/contracts/constants';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

export const MISSING_PROMPT_ID_DETAIL =
  'Prompt resolution requires a prompt ID';
export const MAX_SEEDANCE_REFERENCE_VIDEO_SECONDS = 30;

export function assertSeedanceReferenceVideoDuration(
  durations: readonly number[],
): void {
  if (
    durations.reduce((total, duration) => total + duration, 0) >
    MAX_SEEDANCE_REFERENCE_VIDEO_SECONDS
  ) {
    throw new HttpException(
      {
        detail: `Seedance reference videos may total at most ${MAX_SEEDANCE_REFERENCE_VIDEO_SECONDS} seconds`,
        title: 'Invalid video reference duration',
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}

export function createMissingPromptIdException(): HttpException {
  return new HttpException(
    {
      detail: MISSING_PROMPT_ID_DETAIL,
      title: 'Prompt validation failed',
    },
    HttpStatus.BAD_REQUEST,
  );
}

@Injectable()
export class VideoGenerationPreparationService {
  constructor(
    private readonly assetsService: AssetsService,
    private readonly brandsService: BrandsService,
    private readonly configService: ConfigService,
    private readonly filesClientService: FilesClientService,
    private readonly ingredientsService: IngredientsService,
    private readonly loggerService: LoggerService,
    private readonly modelRegistrationService: ModelRegistrationService,
    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly promptBuilderService: PromptBuilderService,
    private readonly promptsService: PromptsService,
    private readonly routerService: RouterService,
    private readonly sharedService: SharedService,
  ) {}

  async resolve(
    user: User,
    createVideoDto: CreateVideoDto,
    request: Request,
  ): Promise<ResolvedVideoGenerationRequest> {
    if (!requireVideoPromptInput(createVideoDto)) {
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
    const videoReferenceIds = createVideoDto.videoReferences ?? [];
    if (videoReferenceIds.length > 0 && !hasVideoReferences(model)) {
      throw new HttpException(
        {
          detail:
            'The selected model accepts stills only and cannot use video references',
          title: 'Unsupported video reference',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (videoReferenceIds.length > getModelMaxVideoReferences(model)) {
      throw new HttpException(
        {
          detail: `The selected model accepts at most ${getModelMaxVideoReferences(model)} video references`,
          title: 'Too many video references',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    const validationOrgId =
      user.organizationId || request.context?.organizationId;
    const registeredModel = validationOrgId
      ? await this.modelRegistrationService.validateModelForOrg(
          model,
          validationOrgId,
        )
      : undefined;
    const rawInputSchema = registeredModel?.providerInputSchema;
    const modelInputSchema =
      rawInputSchema &&
      typeof rawInputSchema === 'object' &&
      !Array.isArray(rawInputSchema)
        ? (rawInputSchema as Record<string, unknown>)
        : undefined;

    return {
      brand,
      createVideoDto,
      model,
      modelEndpoint: registeredModel?.endpoint || model,
      modelInputSchema,
      modelProvider: registeredModel?.provider,
      modelSchemaFamily: registeredModel?.providerSchemaFamily ?? undefined,
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
    const { height, width } = resolveGenerationDimensions(
      createVideoDto.width,
      createVideoDto.height,
    );
    const { endFrameUrl, referenceImageUrls } =
      await this.resolveReferenceUrls(resolved);
    const promptText = await this.resolvePromptText(resolved);

    const {
      brief: generationBrief,
      dispatch: rawCompiledDispatch,
      evidence: briefEvidence,
      generationSource,
    } = this.compileVideoGenerationBrief({
      createVideoDto,
      height,
      model,
      promptOriginalText: promptText,
      referenceIds,
      runReferences,
      width,
    });
    const compiledDispatch = rawCompiledDispatch
      ? await this.resolveCompiledDispatchReferenceUrls(
          rawCompiledDispatch,
          user.organizationId,
        )
      : undefined;

    let promptParams: Record<string, unknown>;
    let templateUsed: string | undefined;
    let templateVersion: number | undefined;
    if (compiledDispatch) {
      promptParams = compiledDispatch as unknown as Record<string, unknown>;
    } else {
      const built = await this.buildPromptParams({
        endFrameUrl,
        height,
        promptText,
        referenceImageUrls,
        resolved,
        width,
      });
      promptParams = built.promptParams;
      templateUsed = built.templateUsed;
      templateVersion = built.templateVersion;
    }
    const promptInput = promptParams as PromptInput;
    const promptData = await this.promptsService.create(
      new PromptEntity({
        blacklists: createVideoDto.blacklist,
        brandId: brand.id,
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
    const { metadataData, ingredientData } =
      await this.sharedService.createMediaDocuments(user, {
        bookmarkId: createVideoDto.bookmark
          ? (createVideoDto.bookmark as string)
          : undefined,
        brandId: brand.id,
        category: CategoryPrismaUtil.toIngredientCategory(
          IngredientCategory.VIDEO,
        ),
        duration: createVideoDto.duration,
        extension: MetadataExtension.MP4,
        generationPrompt: promptText,
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
        promptId: promptData.id,
        promptTemplate: templateUsed,
        providerData: toRedactedVideoGenerationBriefProviderData(briefEvidence),
        resolution: createVideoDto.resolution,
        scope: createVideoDto.scope,
        sourceActionId: createVideoDto.sourceActionId,
        sourceIds: [
          ...new Set([
            ...referenceIds,
            ...(createVideoDto.endFrame ? [createVideoDto.endFrame] : []),
            ...(createVideoDto.videoReferences ?? []),
          ]),
        ],
        status: IngredientStatus.PROCESSING,
        style: emptyStyleToNull(createVideoDto.style),
        tagIds: createVideoDto.tags,
        templateVersion,
        width,
      });

    return {
      ...resolved,
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
          ((request as unknown as { selectedModel?: { category?: string } })
            .selectedModel?.category as ModelCategory) || ModelCategory.VIDEO,
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

  private compileVideoGenerationBrief(params: {
    createVideoDto: CreateVideoDto;
    height: number;
    model: string;
    promptOriginalText: string;
    referenceIds: string[];
    runReferences?: readonly GenerationBriefReference[];
    width: number;
  }): {
    brief?: VideoGenerationBrief;
    dispatch?: Record<string, unknown>;
    evidence: VideoGenerationBriefPersistedEvidence;
    generationSource: string;
  } {
    const composition = [
      params.createVideoDto.camera,
      params.createVideoDto.lens,
    ]
      .filter((value): value is string => Boolean(value?.trim()))
      .join(', ');
    const avoid = [
      ...(params.createVideoDto.blacklist ?? []),
      ...(params.createVideoDto.negativePrompt
        ? [params.createVideoDto.negativePrompt]
        : []),
    ];

    try {
      return runVideoGenerationBrief({
        audioDirection: params.createVideoDto.speech,
        avoid,
        brandingMode: params.createVideoDto.brandingMode,
        composition,
        durationSeconds: params.createVideoDto.duration,
        fidelityMode: params.createVideoDto.fidelityMode,
        endFrameId: params.createVideoDto.endFrame,
        height: params.height,
        isBrandingEnabled: params.createVideoDto.isBrandingEnabled,
        lighting: params.createVideoDto.lighting,
        model: params.model,
        motion: params.createVideoDto.cameraMovement,
        objective: params.promptOriginalText,
        referenceIds: params.referenceIds,
        references: params.runReferences,
        resolution: params.createVideoDto.resolution,
        scene: params.createVideoDto.scene,
        seed: params.createVideoDto.seed,
        surface: 'studio',
        visualDirection:
          params.createVideoDto.style || params.createVideoDto.mood,
        videoReferenceIds: params.createVideoDto.videoReferences,
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

  private async resolveCompiledDispatchReferenceUrls(
    dispatch: Record<string, unknown>,
    organizationId: string,
  ): Promise<Record<string, unknown>> {
    const resolveUrl = async (
      referenceId: string,
      role: string,
    ): Promise<string> => {
      const url = await buildReferenceImageUrl({
        assetsService: this.assetsService,
        configService: this.configService,
        ingredientsService: this.ingredientsService,
        loggerService: this.loggerService,
        organizationId,
        referenceId,
      });
      if (!url) {
        throw new HttpException(
          {
            detail: `Could not resolve a source URL for the ${role} reference`,
            title: 'Generation brief reference resolution failed',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      return url;
    };

    const stringFields = [
      'first_frame_image',
      'last_frame_image',
      'image',
      'image_url',
      'start_image',
      'input_reference',
      'last_frame',
      'end_image',
      'last_image',
    ] as const;
    const videoStringFields = ['reference_video'] as const;
    const arrayFields = [
      'image_urls',
      'reference_image_urls',
      'reference_images',
    ] as const;
    const videoArrayFields = [
      'reference_video_urls',
      'reference_videos',
    ] as const;

    const resolved: Record<string, unknown> = { ...dispatch };

    for (const field of stringFields) {
      const value = dispatch[field];
      if (typeof value === 'string' && value.length > 0) {
        resolved[field] = await resolveUrl(value, field);
      }
    }

    for (const field of arrayFields) {
      const value = dispatch[field];
      if (Array.isArray(value)) {
        resolved[field] = await Promise.all(
          value
            .filter((entry): entry is string => typeof entry === 'string')
            .map((entry) => resolveUrl(entry, field)),
        );
      }
    }

    for (const field of videoStringFields) {
      const value = dispatch[field];
      if (typeof value === 'string' && value.length > 0) {
        resolved[field] = (
          await this.resolveVideoReference(value, organizationId, field)
        ).url;
      }
    }

    for (const field of videoArrayFields) {
      const value = dispatch[field];
      if (Array.isArray(value)) {
        const references = await Promise.all(
          value
            .filter((entry): entry is string => typeof entry === 'string')
            .map((entry) =>
              this.resolveVideoReference(entry, organizationId, field),
            ),
        );
        if (field === 'reference_videos') {
          assertSeedanceReferenceVideoDuration(
            references.map((reference) => reference.duration),
          );
        }
        resolved[field] = references.map((reference) => reference.url);
      }
    }

    return resolved;
  }

  private async resolveVideoReference(
    referenceId: string,
    organizationId: string,
    role: string,
  ): Promise<{ duration: number; url: string }> {
    const ingredient = await this.ingredientsService.findOne(
      {
        category: IngredientCategory.VIDEO,
        id: referenceId,
        isDeleted: false,
        organizationId,
      },
      [{ path: 'metadata', select: ['duration'] }],
    );
    if (!ingredient?.id) {
      throw new HttpException(
        {
          detail: `Could not resolve a stored video for the ${role} reference`,
          title: 'Generation brief reference resolution failed',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    const duration = ingredient.metadata?.duration;
    if (
      typeof duration !== 'number' ||
      !Number.isFinite(duration) ||
      duration < 3 ||
      duration > 10
    ) {
      throw new HttpException(
        {
          detail: `The ${role} reference must be a video between 3 and 10 seconds`,
          title: 'Invalid video reference duration',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    return {
      duration,
      url: await this.filesClientService.getPresignedDownloadUrl(
        String(ingredient.id),
        'videos',
      ),
    };
  }

  private async resolveReferenceUrls(
    resolved: ResolvedVideoGenerationRequest,
  ): Promise<{ endFrameUrl?: string; referenceImageUrls: string[] }> {
    const referenceImageUrls = await buildReferenceImageUrls({
      assetsService: this.assetsService,
      configService: this.configService,
      ingredientsService: this.ingredientsService,
      loggerService: this.loggerService,
      organizationId: resolved.user.organizationId,
      referenceIds: resolved.referenceIds,
    });
    if (!resolved.createVideoDto.endFrame) {
      return { referenceImageUrls };
    }
    const endFrameUrls = await buildReferenceImageUrls({
      assetsService: this.assetsService,
      configService: this.configService,
      ingredientsService: this.ingredientsService,
      loggerService: this.loggerService,
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
