/**
 * Brand-voice text for the generation-brief path (brief-compiled image and
 * video models), rendered from the approved Brand OS revision the generation
 * is pinned to, never from the live brand row (#10186). One mechanism: the
 * enhancement receipt carries the text, so Studio, agent and MCP requests for
 * the same brand resolve the same words.
 *
 * Tone, voice, audience and values only. Hashtags and taglines are left out:
 * an image or video model renders them as on-screen text.
 */
import type { BrandIdentitySnapshotV1 } from '@genfeedai/contracts/interfaces';

/**
 * Every capability profile's `prompt.maxCharacters` is 10,000+, so this cap
 * is a defensive margin, never the limiting factor in ordinary use.
 */
const GENERATION_BRIEF_BRAND_CONTEXT_MAX_CHARACTERS = 500;

/**
 * Branding is on unless the request turned it off (`brandingMode: 'off'` or
 * `isBrandingEnabled: false`). Unset means on, so a request that never sets
 * the field (MCP, agent) gets the same brand inputs as the Studio, which
 * defaults it to `brand`.
 *
 * Deliberately independent of fidelity mode: avoid terms can force `guided`
 * while Brand voice is off.
 */
export function resolveIsGenerationBriefBrandVoiceOn(input: {
  brandingMode?: 'off' | 'brand';
  isBrandingEnabled?: boolean;
}): boolean {
  return input.brandingMode !== 'off' && input.isBrandingEnabled !== false;
}

function truncateBrandContext(text: string): string {
  if (text.length <= GENERATION_BRIEF_BRAND_CONTEXT_MAX_CHARACTERS) {
    return text;
  }
  return `${text.slice(0, GENERATION_BRIEF_BRAND_CONTEXT_MAX_CHARACTERS - 1).trimEnd()}…`;
}

/** Brand-voice text from a resolved snapshot, or `undefined` when it holds none. */
export function renderGenerationBriefBrandVoice(
  snapshot: Pick<BrandIdentitySnapshotV1, 'identity' | 'voice'>,
): string | undefined {
  const { identity, voice } = snapshot;
  const lines = [
    voice.tone ? `Tone: ${voice.tone}` : '',
    voice.style ? `Voice: ${voice.style}` : '',
    voice.audience.length > 0 ? `Audience: ${voice.audience.join(', ')}` : '',
    voice.values.length > 0 ? `Values: ${voice.values.join(', ')}` : '',
  ].filter(Boolean);
  if (lines.length === 0) return undefined;
  return truncateBrandContext(
    [`Brand voice for ${identity.name}:`, ...lines].join('\n'),
  );
}
