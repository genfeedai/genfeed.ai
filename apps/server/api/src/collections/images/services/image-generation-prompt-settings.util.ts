import type { CreateImageDto } from '@api/collections/images/dto/create-image.dto';
import { buildFlux3ImageInput } from '@api/services/prompt-builder/builders/replicate/flux-3-image.builder';
import { buildIdeogramImageEditInput } from '@api/services/prompt-builder/builders/replicate/ideogram-image-edit.builder';
import type { PromptBuilderParams } from '@api/services/prompt-builder/interfaces/prompt-builder-params.interface';
import type { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { ModelCategory } from '@genfeedai/contracts';
import {
  type ImageEditSize,
  isFlux3ImageModel,
  MODEL_KEYS,
  MODEL_OUTPUT_CAPABILITIES,
} from '@genfeedai/contracts/constants';
import { isRecord } from '@genfeedai/utils/data/extract.util';

type ImagePromptSettings = Pick<
  CreateImageDto,
  'aspectRatio' | 'height' | 'outputs' | 'quality' | 'resolution' | 'width'
>;

/** Settings shared by the prospective quote and the provider dispatch. */
export function imageGenerationPromptSettings(
  model: string,
  settings: ImagePromptSettings,
  inputSchema?: unknown,
): Pick<
  PromptBuilderParams,
  | 'aspectRatio'
  | 'height'
  | 'modelInputSchema'
  | 'outputs'
  | 'quality'
  | 'resolution'
  | 'width'
> {
  return {
    aspectRatio: settings.aspectRatio,
    height: settings.height,
    modelInputSchema: isRecord(inputSchema) ? inputSchema : undefined,
    outputs: MODEL_OUTPUT_CAPABILITIES[model]?.isBatchSupported
      ? Number(settings.outputs) || 1
      : 1,
    quality: settings.quality,
    resolution: settings.resolution,
    width: settings.width,
  };
}

/**
 * Models whose builder refuses to run without a reference image. The tariff
 * does not depend on which image it is, so a quote builds with this stand-in;
 * it is never fetched or sent to a provider.
 */
const QUOTE_STAND_IN_REFERENCES: Readonly<Record<string, readonly string[]>> = {
  [MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_CHARACTER]: [
    'https://quote.invalid/character-reference.png',
  ],
};

/** Build locally, without templates or provider calls; missing inputs stay unquotable. */
export async function buildImageQuoteProviderInput(
  builder: PromptBuilderService,
  model: string,
  settings: ImagePromptSettings,
  inputSchema?: unknown,
  references: string[] = [],
  editSize?: ImageEditSize,
): Promise<Record<string, unknown> | undefined> {
  try {
    if (editSize !== undefined) {
      if (!references.length) return undefined;
      return isFlux3ImageModel(model)
        ? buildFlux3ImageInput(
            '',
            references,
            settings.resolution ?? '1k',
            settings.aspectRatio ?? 'auto',
          )
        : buildIdeogramImageEditInput(
            '',
            { sourceUrls: references, size: editSize },
            settings.outputs ?? 1,
          );
    }
    const built = await builder.buildPrompt(model, {
      ...imageGenerationPromptSettings(model, settings, inputSchema),
      brandingMode: 'off',
      modelCategory: ModelCategory.IMAGE,
      prompt: '',
      references: references.length
        ? references
        : [...(QUOTE_STAND_IN_REFERENCES[model] ?? [])],
      useTemplate: false,
    });
    return built.input as unknown as Record<string, unknown>;
  } catch {
    // Preserve legacy tariffs while strict variant quotes reject absent evidence.
    return undefined;
  }
}
