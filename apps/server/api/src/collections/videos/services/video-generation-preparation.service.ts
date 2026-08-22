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
import { buildReferenceImageUrls } from '@api/helpers/utils/reference/reference.util';
import { createRequestAbortSignal } from '@api/helpers/utils/request/request-abort-signal.util';
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
} from '@genfeedai/enums';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

export const MISSING_PROMPT_ID_DETAIL =
  'Prompt resolution requires a prompt ID';

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
      input: promptParams,
      templateUsed,
      templateVersion,
    } = await this.promptBuilderService.buildPrompt(
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
        resolution: createVideoDto.resolution,
        scope: createVideoDto.scope,
        sourceIds: referenceIds,
        status: IngredientStatus.PROCESSING,
        style: emptyStyleToNull(createVideoDto.style),
        tagIds: createVideoDto.tags,
        templateVersion,
        width,
      });

    return {
      ...resolved,
      abortSignal: createRequestAbortSignal(request),
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

  private async resolveReferenceUrls(
    resolved: ResolvedVideoGenerationRequest,
  ): Promise<{ endFrameUrl?: string; referenceImageUrls: string[] }> {
    const referenceImageUrls = await buildReferenceImageUrls({
      assetsService: this.assetsService,
      configService: this.configService,
      ingredientsService: this.ingredientsService,
      loggerService: this.loggerService,
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
