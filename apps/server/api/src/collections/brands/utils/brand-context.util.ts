import type {
  Brand,
  BrandAgentConfig,
} from '@api/collections/brands/schemas/brand.schema';
import type { PromptBuilderParams } from '@api/services/prompt-builder/interfaces/prompt-builder-params.interface';

type PromptBranding = NonNullable<PromptBuilderParams['branding']>;

export const buildPromptBrandingFromBrand = (
  brand: Pick<Brand, 'agentConfig'> | null | undefined,
): PromptBranding | undefined => {
  const agentConfig =
    brand?.agentConfig &&
    typeof brand.agentConfig === 'object' &&
    !Array.isArray(brand.agentConfig)
      ? (brand.agentConfig as BrandAgentConfig)
      : undefined;
  const voice = agentConfig?.voice;

  if (!voice) {
    return undefined;
  }

  const branding: PromptBranding = {
    audience: voice.audience?.length ? voice.audience.join(', ') : undefined,
    doNotSoundLike: voice.doNotSoundLike?.length
      ? voice.doNotSoundLike
      : undefined,
    hashtags: voice.hashtags?.length ? voice.hashtags : undefined,
    messagingPillars: voice.messagingPillars?.length
      ? voice.messagingPillars
      : undefined,
    sampleOutput: voice.sampleOutput?.trim() || undefined,
    taglines: voice.taglines?.length ? voice.taglines : undefined,
    tone: voice.tone,
    values: voice.values?.length ? voice.values : undefined,
    voice: voice.style,
  };

  return Object.values(branding).some(Boolean) ? branding : undefined;
};

export const buildBrandVoiceSummary = (
  brand: Pick<Brand, 'agentConfig'> | null | undefined,
): Record<string, string | string[]> | null => {
  const voice = buildPromptBrandingFromBrand(brand);
  return voice ?? null;
};
