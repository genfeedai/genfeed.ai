/**
 * Brand-voice text for the generation-brief path (brief-compiled image and
 * video models). Reuses the same `system.brand-context` prompt template that
 * `PromptBuilderService.buildBrandContext` renders for the non-brief
 * (template) path, so brand wording stays one system of record regardless of
 * which path a model takes (#4676).
 *
 * Deliberately independent of fidelity mode: `runImageGenerationBrief` /
 * `runVideoGenerationBrief` can force `fidelityMode` to `guided` purely
 * because operator `avoid` terms are present, even while Brand voice is off.
 * Callers gate this resolver with {@link resolveIsGenerationBriefBrandVoiceOn}
 * — never with the resolved fidelity mode — so branding never leaks when the
 * user turned it off.
 */
import type { TemplatesService } from '@api/collections/templates/services/templates.service';

const GENERATION_BRIEF_BRAND_CONTEXT_TEMPLATE_KEY = 'system.brand-context';

/**
 * Every capability profile's `prompt.maxCharacters` is 10,000+, so this cap
 * is a defensive margin against an unusually long brand-context template —
 * never the limiting factor in ordinary use (PRD risk: injecting brand
 * context "must not break per-model brief limits").
 */
const GENERATION_BRIEF_BRAND_CONTEXT_MAX_CHARACTERS = 500;

export interface GenerationBriefBrandContextBrand {
  description?: string;
  label?: string;
  text?: string;
}

export interface GenerationBriefBrandContextBranding {
  audience?: string;
  hashtags?: string[];
  taglines?: string[];
  tone?: string;
  values?: string[];
  voice?: string;
}

/**
 * Mirrors the brand-on condition `resolveImageGenerationFidelityMode` /
 * `resolveVideoGenerationFidelityMode` use for the `guided` fidelity floor,
 * without their `avoid`-driven override — brand context must depend solely
 * on the Brand voice setting (#4676 FR3).
 */
export function resolveIsGenerationBriefBrandVoiceOn(input: {
  brandingMode?: 'off' | 'brand';
  isBrandingEnabled?: boolean;
}): boolean {
  if (input.brandingMode === 'off') {
    return false;
  }
  return input.brandingMode === 'brand' || input.isBrandingEnabled === true;
}

function truncateBrandContext(text: string): string {
  if (text.length <= GENERATION_BRIEF_BRAND_CONTEXT_MAX_CHARACTERS) {
    return text;
  }
  return `${text.slice(0, GENERATION_BRIEF_BRAND_CONTEXT_MAX_CHARACTERS - 1).trimEnd()}…`;
}

/**
 * Resolves rendered brand-voice text, or `undefined` when there is no brand
 * name or no active `system.brand-context` template — mirrors
 * `PromptBuilderService.buildBrandContext`'s tolerant fallback (an inactive
 * or missing template degrades to no brand context rather than failing
 * generation).
 */
export async function resolveGenerationBriefBrandContext(params: {
  brand?: GenerationBriefBrandContextBrand;
  branding?: GenerationBriefBrandContextBranding;
  organizationId?: string;
  templatesService: TemplatesService;
}): Promise<string | undefined> {
  const { brand, branding, organizationId, templatesService } = params;
  if (!brand?.label) {
    return undefined;
  }

  const variables: Record<string, unknown> = { brandName: brand.label };
  if (brand.description) {
    variables.brandDescription = brand.description;
  }
  if (brand.text) {
    variables.brandText = brand.text;
  }
  if (branding?.tone) {
    variables.brandTone = branding.tone;
  }
  if (branding?.voice) {
    variables.brandVoice = branding.voice;
  }
  if (branding?.audience) {
    variables.brandAudience = branding.audience;
  }
  if (branding?.values?.length) {
    variables.brandValues = branding.values.join(', ');
  }
  if (branding?.taglines?.length) {
    variables.brandTaglines = branding.taglines.join(', ');
  }
  if (branding?.hashtags?.length) {
    variables.brandHashtags = branding.hashtags.join(' ');
  }

  const template = await templatesService.getPromptByKey(
    GENERATION_BRIEF_BRAND_CONTEXT_TEMPLATE_KEY,
    organizationId,
  );
  if (!template?.isActive || typeof template.content !== 'string') {
    return undefined;
  }

  const rendered = templatesService
    .renderPrompt(template.content, variables)
    .trim();
  if (!rendered) {
    return undefined;
  }

  return truncateBrandContext(rendered);
}
