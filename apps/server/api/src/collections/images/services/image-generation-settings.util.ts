import { buildPromptBrandingFromBrand } from '@api/collections/brands/utils/brand-context.util';
import type { CreateImageDto } from '@api/collections/images/dto/create-image.dto';
import type {
  ImageGenerationContext,
  ImageGenerationResolvedBrand,
} from '@api/collections/images/services/image-generation.types';
import type { TemplatesService } from '@api/collections/templates/services/templates.service';
import {
  resolveGenerationBriefBrandContext,
  resolveIsGenerationBriefBrandVoiceOn,
} from '@api/services/generation-brief';
import type { LoggerService } from '@libs/logger/logger.service';

export interface ImageGenerationSettingsParams {
  brand: ImageGenerationResolvedBrand;
  createImageDto: CreateImageDto;
  organizationId: string;
  model: string;
}
export interface ImageGenerationSettingsDependencies {
  templatesService: TemplatesService;
  loggerService: LoggerService;
}
export interface ImageGenerationSettingsResult {
  brandPromptBranding: ImageGenerationContext['brandPromptBranding'];
  promptBuilderBrand: ImageGenerationContext['promptBuilderBrand'];
  width: number;
  height: number;
  style: string | undefined;
  outputs: number;
  briefBrandContext: string | undefined;
}
interface ImageGenerationBriefBrandContextParams {
  brandPromptBranding: ReturnType<typeof buildPromptBrandingFromBrand>;
  createImageDto: CreateImageDto;
  organizationId: string;
  promptBuilderBrand: ImageGenerationContext['promptBuilderBrand'];
}
export async function prepareImageGenerationSettings(
  params: ImageGenerationSettingsParams,
  dependencies: ImageGenerationSettingsDependencies,
): Promise<ImageGenerationSettingsResult> {
  const { brand, createImageDto, organizationId, model } = params;
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

  dependencies.loggerService.debug('Image generation request received', {
    model,
    outputs,
    rawOutputs: createImageDto.outputs,
  });

  const briefBrandContext = await resolveBriefBrandContext(
    {
      brandPromptBranding,
      createImageDto,
      organizationId: organizationId,
      promptBuilderBrand,
    },
    dependencies,
  );

  return {
    brandPromptBranding,
    promptBuilderBrand,
    width,
    height,
    style,
    outputs,
    briefBrandContext,
  };
}

async function resolveBriefBrandContext(
  params: ImageGenerationBriefBrandContextParams,
  dependencies: ImageGenerationSettingsDependencies,
): Promise<string | undefined> {
  const {
    brandPromptBranding,
    createImageDto,
    organizationId,
    promptBuilderBrand,
  } = params;

  if (
    !resolveIsGenerationBriefBrandVoiceOn({
      brandingMode: createImageDto.brandingMode,
      isBrandingEnabled: createImageDto.isBrandingEnabled,
    })
  ) {
    return undefined;
  }

  try {
    return await resolveGenerationBriefBrandContext({
      brand: promptBuilderBrand,
      branding: brandPromptBranding,
      organizationId,
      templatesService: dependencies.templatesService,
    });
  } catch (error: unknown) {
    dependencies.loggerService.error(
      'Failed to resolve brand context for the generation brief; proceeding without it',
      { error, organizationId },
    );
    return undefined;
  }
}
