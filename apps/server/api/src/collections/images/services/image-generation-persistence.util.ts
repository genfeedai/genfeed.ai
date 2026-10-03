import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { buildPromptBrandingFromBrand } from '@api/collections/brands/utils/brand-context.util';
import type { CreateImageDto } from '@api/collections/images/dto/create-image.dto';
import type {
  ImageEditingContext,
  ImageGenerationContext,
  ImageGenerationResolvedBrand,
  ImageGenerationResolvedPrompt,
  ImageGenerationSavedIngredient,
  ImageGenerationSavedMetadata,
} from '@api/collections/images/services/image-generation.types';
import type { ImagesService } from '@api/collections/images/services/images.service';
import { PromptEntity } from '@api/collections/prompts/entities/prompt.entity';
import type { PromptsService } from '@api/collections/prompts/services/prompts.service';
import type { GenerationPlaceholderScope } from '@api/common/interfaces/generation-placeholder-lifecycle.interface';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import { toRedactedGenerationBriefProviderData } from '@api/services/generation-brief';
import type { ImageGenerationBriefDispatch } from '@api/services/generation-brief/image-generation-brief-registry';
import { buildFlux3ImageInput } from '@api/services/prompt-builder/builders/replicate/flux-3-image.builder';
import { buildIdeogramImageEditInput } from '@api/services/prompt-builder/builders/replicate/ideogram-image-edit.builder';
import type { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import type { SharedService } from '@api/shared/services/shared/shared.service';
import {
  IngredientCategory,
  IngredientOrigin,
  MetadataExtension,
  ModelCategory,
  PromptCategory,
  PromptStatus,
} from '@genfeedai/contracts';
import type { GenerationBriefPersistedEvidence } from '@genfeedai/contracts/api-types/contracts/generation-brief-compiler.contract';
import {
  isFlux3ImageModel,
  MODEL_OUTPUT_CAPABILITIES,
} from '@genfeedai/contracts/constants';
import type { GenerationHarnessReceipt } from '@genfeedai/contracts/interfaces';

export interface ImageGenerationPersistenceParams {
  editing?: ImageEditingContext;
  brand: ImageGenerationResolvedBrand;
  brandPromptBranding: ReturnType<typeof buildPromptBrandingFromBrand>;
  briefEvidence?: GenerationBriefPersistedEvidence;
  compiledDispatch?: ImageGenerationBriefDispatch;
  createImageDto: CreateImageDto;
  generationSource: string;
  generationHarness: GenerationHarnessReceipt;
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
}
export interface ImageGenerationPersistenceResult {
  ingredientData: ImageGenerationSavedIngredient;
  metadataData: ImageGenerationSavedMetadata;
  promptData: ImageGenerationResolvedPrompt;
  providerInput?: Record<string, unknown>;
}
export interface ImageGenerationPersistenceDependencies {
  promptsService: PromptsService;
  promptBuilderService: PromptBuilderService;
  sharedService: SharedService;
  imagesService: ImagesService;
  /** Character whose reference image drives this generation (FR10), if any. */
  resolveCharacterPersonaId?: (
    referenceIds: string[],
  ) => Promise<string | null>;
}
export async function resolveGenerationPrompt(
  promptsService: PromptsService,
  user: User,
  createImageDto: CreateImageDto,
  model: string,
  promptOriginalText: string,
): Promise<ImageGenerationResolvedPrompt> {
  const submittedPromptId = isEntityId(createImageDto.promptId)
    ? createImageDto.promptId
    : undefined;
  const submittedPrompt = submittedPromptId
    ? await promptsService.findOne({
        id: submittedPromptId,
        isDeleted: false,
        organizationId: user.organizationId,
        userId: user.userId ?? user.id,
      })
    : null;
  const isReviewedPrompt =
    submittedPrompt?.status === PromptStatus.GENERATED &&
    !submittedPrompt.isSkipEnhancement &&
    submittedPrompt.enhanced === promptOriginalText;
  return isReviewedPrompt
    ? submittedPrompt
    : submittedPrompt
      ? await promptsService.patch(submittedPrompt.id, {
          model,
          status: PromptStatus.PROCESSING,
        })
      : await promptsService.create(
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
}

function buildLegacyImagePromptInput(
  params: ImageGenerationPersistenceParams,
): Parameters<PromptBuilderService['buildPrompt']>[1] {
  const {
    createImageDto,
    promptBuilderBrand,
    brandPromptBranding,
    height,
    modelInputSchema,
    model,
    generationHarness,
    referenceImageUrls,
    style,
    width,
  } = params;
  return {
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
    resolution: createImageDto.resolution,
    aspectRatio: createImageDto.aspectRatio,
    modelCategory: ModelCategory.IMAGE,
    mood: createImageDto.mood,
    outputs: MODEL_OUTPUT_CAPABILITIES[model]?.isBatchSupported
      ? Number(createImageDto.outputs) || 1
      : 1,
    prompt: generationHarness.enhancedPrompt,
    promptTemplate: createImageDto.promptTemplate,
    references: referenceImageUrls,
    scene: createImageDto.scene,
    seed: createImageDto.seed,
    style: style || createImageDto.style || 'realistic',
    tags: createImageDto.tags?.map((tag) => tag.toString()) || [],
    useTemplate: createImageDto.useTemplate,
    width,
  };
}
export async function persistImageDocuments(
  params: ImageGenerationPersistenceParams,
  dependencies: ImageGenerationPersistenceDependencies,
): Promise<ImageGenerationPersistenceResult> {
  const {
    brand,
    briefEvidence,
    compiledDispatch,
    createImageDto,
    generationSource,
    generationHarness,
    height,
    model,
    promptOriginalText,
    user,
    referenceIds,
    referenceImageUrls,
    placeholderScope,
    style,
    width,
  } = params;
  const editing = params.editing;

  const promptData = await resolveGenerationPrompt(
    dependencies.promptsService,
    user,
    createImageDto,
    model,
    promptOriginalText,
  );

  let providerInput: Record<string, unknown> | undefined =
    editing && isFlux3ImageModel(model)
      ? buildFlux3ImageInput(
          generationHarness.enhancedPrompt,
          referenceImageUrls,
          createImageDto.resolution ?? '1k',
          createImageDto.aspectRatio ?? 'auto',
        )
      : editing
        ? buildIdeogramImageEditInput(
            generationHarness.enhancedPrompt,
            editing,
            createImageDto.outputs ?? 1,
            createImageDto.seed,
          )
        : undefined;
  let imageTemplateUsed: string | undefined;
  let imageTemplateVersion: number | undefined;
  if (!compiledDispatch && !editing) {
    const builtPrompt = await dependencies.promptBuilderService.buildPrompt(
      model,
      buildLegacyImagePromptInput(params),
      user.organizationId,
    );
    providerInput = builtPrompt.input;
    imageTemplateUsed = builtPrompt.templateUsed;
    imageTemplateVersion = builtPrompt.templateVersion;
  }

  const compiledPrompt = compiledDispatch?.prompt ?? providerInput?.prompt;
  if (
    generationHarness.status === 'applied' &&
    typeof compiledPrompt === 'string'
  ) {
    generationHarness.enhancedPrompt = compiledPrompt;
  }
  if (providerInput) providerInput.prompt = generationHarness.enhancedPrompt;

  const { metadataData, ingredientData } =
    await dependencies.sharedService.createMediaDocuments(user, {
      origin: IngredientOrigin.GENERATED,
      brandId: brand.id,
      category: IngredientCategory.IMAGE,
      extension: MetadataExtension.JPEG,
      generationPrompt: generationHarness.enhancedPrompt,
      generationHarness,
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
      providerData: editing
        ? { imageEdit: { ...editing.recipe } }
        : briefEvidence
          ? toRedactedGenerationBriefProviderData(briefEvidence)
          : {},
      scope: createImageDto.scope,
      sourceActionId: createImageDto.sourceActionId,
      sourceIds: referenceIds,
      style,
      tagIds: createImageDto.tags,
      templateVersion: imageTemplateVersion,
      width,
    });

  const personaId = editing
    ? null
    : ((await dependencies.resolveCharacterPersonaId?.(referenceIds)) ?? null);
  await dependencies.imagesService.patch(ingredientData.id, {
    promptId: promptData.id,
    ...(personaId ? { personaId } : {}),
  });

  return { ingredientData, metadataData, promptData, providerInput };
}
