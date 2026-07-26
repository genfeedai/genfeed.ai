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
import type { RequestWithContext as Request } from '@api/common/middleware/request-context.middleware';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import { CategoryPrismaUtil } from '@api/helpers/utils/category-prisma/category-prisma.util';
import {
  isImageToVideoRequest,
  resolveGenerationDefaultModel,
} from '@api/helpers/utils/generation-defaults/generation-defaults.util';
import { buildReferenceImageUrls } from '@api/helpers/utils/reference/reference.util';
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
    const publicMetadata = getPublicMetadata(user);
    if (!createVideoDto.prompt && !createVideoDto.text) {
      throw new HttpException(
        {
          detail: 'Prompt is required',
          title: 'Prompt validation failed',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const brand = await this.brandsService.findOne({
      _id: createVideoDto.brand || publicMetadata.brand,
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

    const referenceIds = Array.isArray(createVideoDto.references)
      ? createVideoDto.references.map((id) => id.toString())
      : [];
    const organizationSettings = await this.organizationSettingsService.findOne(
      {
        isDeleted: false,
        organization: publicMetadata.organization,
      },
    );
    const model = await this.resolveVideoModel(
      createVideoDto,
      brand,
      organizationSettings,
      referenceIds,
    );
    const validationOrgId =
      publicMetadata.organization || request.context?.organizationId;
    if (validationOrgId) {
      await this.modelRegistrationService.validateModelForOrg(
        model,
        validationOrgId,
      );
    }

    return {
      brand,
      createVideoDto,
      model,
      publicMetadata,
      referenceIds,
      request,
      user,
    };
  }

  async prepare(
    resolved: ResolvedVideoGenerationRequest,
  ): Promise<VideoGenerationContext> {
    const {
      brand,
      createVideoDto,
      model,
      publicMetadata,
      referenceIds,
      request,
      user,
    } = resolved;
    const width = createVideoDto.width || 1920;
    const height = createVideoDto.height || 1080;
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
          description: brand.description ?? undefined,
          label: brand.label ?? 'Brand',
          primaryColor: brand.primaryColor ?? undefined,
          secondaryColor: brand.secondaryColor ?? undefined,
          text: brand.text ?? undefined,
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
      publicMetadata.organization,
    );
    const promptInput = promptParams as PromptInput;
    const promptData = await this.promptsService.create(
      new PromptEntity({
        blacklists: createVideoDto.blacklist,
        brand: brand.id,
        camera: createVideoDto.camera,
        category: PromptCategory.MODELS_PROMPT_VIDEO,
        mood: createVideoDto.mood,
        organization: publicMetadata.organization,
        original: promptText,
        scene: createVideoDto.scene,
        sounds: createVideoDto.sounds,
        speech: createVideoDto.speech,
        status: PromptStatus.PROCESSING,
        style: createVideoDto.style,
        user: publicMetadata.user,
      }),
    );
    const { metadataData, ingredientData } =
      await this.sharedService.saveDocuments(user, {
        ...createVideoDto,
        bookmark: createVideoDto.bookmark
          ? (createVideoDto.bookmark as string)
          : undefined,
        brand: brand.id,
        category: CategoryPrismaUtil.toIngredientCategory(
          IngredientCategory.VIDEO,
        ),
        extension: MetadataExtension.MP4,
        height,
        model,
        organization: brand.organizationId,
        prompt: promptData.id,
        promptTemplate: templateUsed,
        references: referenceIds.length > 0 ? referenceIds : undefined,
        status: IngredientStatus.PROCESSING,
        style: createVideoDto.style === '' ? null : createVideoDto.style,
        templateVersion,
        width,
      });

    return {
      ...resolved,
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
    if (!resolved.createVideoDto.prompt) {
      return resolved.createVideoDto.text || '';
    }
    const validationOrgId =
      resolved.publicMetadata.organization ||
      resolved.request.context?.organizationId;
    const prompt = await this.promptsService.findOne({
      _id: resolved.createVideoDto.prompt.toString(),
      isDeleted: false,
      ...(validationOrgId ? { organization: validationOrgId } : {}),
    });
    if (!prompt?.id) {
      throw new HttpException(
        {
          detail: 'The referenced prompt could not be found',
          title: 'Prompt not found',
        },
        HttpStatus.NOT_FOUND,
      );
    }
    return prompt.enhanced || prompt.original || '';
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
  ): Promise<string> {
    if (createVideoDto.autoSelectModel) {
      const recommendation = await this.routerService.selectModel({
        category: ModelCategory.VIDEO,
        dimensions: {
          height: createVideoDto.height,
          width: createVideoDto.width,
        },
        duration: createVideoDto.duration,
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

    return resolveGenerationDefaultModel<string>({
      brandDefault: (isImageToVideoRequest({
        endFrame: createVideoDto.endFrame,
        references: referenceIds,
      })
        ? brand.defaultImageToVideoModel
        : brand.defaultVideoModel) as string | undefined,
      explicit: createVideoDto.model as string | undefined,
      organizationDefault: (isImageToVideoRequest({
        endFrame: createVideoDto.endFrame,
        references: referenceIds,
      })
        ? organizationSettings?.defaultImageToVideoModel
        : organizationSettings?.defaultVideoModel) as string | undefined,
      systemDefault: (await this.routerService.getDefaultModel(
        ModelCategory.VIDEO,
      )) as string,
    });
  }
}
