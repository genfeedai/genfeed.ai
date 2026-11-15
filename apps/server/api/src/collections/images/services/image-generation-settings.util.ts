import { buildPromptBrandingFromBrand } from '@api/collections/brands/utils/brand-context.util';
import type { CreateImageDto } from '@api/collections/images/dto/create-image.dto';
import type {
  ImageGenerationContext,
  ImageGenerationResolvedBrand,
} from '@api/collections/images/services/image-generation.types';
import { resolveIsGenerationBriefBrandVoiceOn } from '@api/services/generation-brief';
import type { GenerationHarnessReceipt } from '@genfeedai/contracts/interfaces';
import type { LoggerService } from '@libs/logger/logger.service';

export interface ImageGenerationSettingsParams {
  brand: ImageGenerationResolvedBrand;
  createImageDto: CreateImageDto;
  model: string;
  generationHarness: GenerationHarnessReceipt;
}
export interface ImageGenerationSettingsDependencies {
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
export async function prepareImageGenerationSettings(
  params: ImageGenerationSettingsParams,
  dependencies: ImageGenerationSettingsDependencies,
): Promise<ImageGenerationSettingsResult> {
  const { brand, createImageDto, generationHarness, model } = params;
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

  // The pinned revision's brand voice, carried on the enhancement receipt.
  const briefBrandContext = resolveIsGenerationBriefBrandVoiceOn({
    brandingMode: createImageDto.brandingMode,
    isBrandingEnabled: createImageDto.isBrandingEnabled,
  })
    ? generationHarness.brandVoice
    : undefined;

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
