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

  const sampleOutput = voice.sampleOutput?.trim();
  const branding: PromptBranding = {
    ...(voice.audience?.length ? { audience: voice.audience.join(', ') } : {}),
    ...(voice.doNotSoundLike?.length
      ? { doNotSoundLike: voice.doNotSoundLike }
      : {}),
    ...(voice.hashtags?.length ? { hashtags: voice.hashtags } : {}),
    ...(voice.messagingPillars?.length
      ? { messagingPillars: voice.messagingPillars }
      : {}),
    ...(sampleOutput ? { sampleOutput } : {}),
    ...(voice.taglines?.length ? { taglines: voice.taglines } : {}),
    ...(voice.tone ? { tone: voice.tone } : {}),
    ...(voice.values?.length ? { values: voice.values } : {}),
    ...(voice.style ? { voice: voice.style } : {}),
  };

  return Object.values(branding).some(Boolean) ? branding : undefined;
};

export const buildBrandVoiceSummary = (
  brand: Pick<Brand, 'agentConfig'> | null | undefined,
): Record<string, string | string[]> | null => {
  const voice = buildPromptBrandingFromBrand(brand);
  return voice ?? null;
};
