import type { Brand } from '@api/collections/brands/schemas/brand.schema';
import { resolveEffectiveBrandAgentConfig } from '@api/collections/brands/utils/brand-agent-config-resolution.util';

/**
 * The brand voice a skill rewrites in, as one line, or an empty string when
 * the brand has no voice configured. Uses the platform override when the
 * request names a platform.
 */
export function summarizeBrandVoice(
  brand: Pick<Brand, 'agentConfig'>,
  platform?: string,
): string {
  const { voice } = resolveEffectiveBrandAgentConfig({ brand, platform });
  if (!voice) return '';

  const parts = [
    voice.tone ? `tone: ${voice.tone}` : '',
    voice.style ? `style: ${voice.style}` : '',
    voice.audience?.length ? `audience: ${voice.audience.join(', ')}` : '',
    voice.values?.length ? `values: ${voice.values.join(', ')}` : '',
    voice.doNotSoundLike?.length
      ? `never sound like: ${voice.doNotSoundLike.join(', ')}`
      : '',
    voice.bannedPhrases?.length
      ? `banned phrases: ${voice.bannedPhrases.join(', ')}`
      : '',
    voice.writingRules?.length
      ? `writing rules: ${voice.writingRules.join('; ')}`
      : '',
  ];

  return parts.filter(Boolean).join('; ');
}
