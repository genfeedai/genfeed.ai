/**
 * Pure keyword-heuristic recommendation engine for the Unified Generation
 * Setup. Runs on every prompt/type change on both composers — deterministic
 * and side-effect free so it is trivial to debounce and unit test; the
 * caller (`applyGenerationSetupRecommendation`) is the only place state is
 * written.
 *
 * Field vocabulary matches {@link GenerationSetupValues}. Aspect ratio /
 * duration defaults are local to this package (not imported from
 * `packages/pages/studio/generate/utils/studio-generate-settings.ts`, which
 * would invert the package dependency direction) — see
 * `GENERATION_SETUP_DEFAULT_ASPECT_RATIO_BY_TYPE` below.
 */
import { RouterPriority } from '@genfeedai/enums';
import type {
  GenerationSetupFieldKey,
  GenerationSetupRecommendation,
  GenerationSetupRecommendationInput,
  GenerationSetupValues,
} from '@genfeedai/interfaces/studio/generation-setup.interface';
import type { StudioGenerateType } from '@genfeedai/interfaces/studio/studio-generate.interface';

/** Default aspect ratio per type when the prompt gives no framing hint. */
export const GENERATION_SETUP_DEFAULT_ASPECT_RATIO_BY_TYPE: Partial<
  Record<StudioGenerateType, string>
> = {
  image: '1:1',
  video: '16:9',
};

const DEFAULT_ASPECT_RATIO = '1:1';
const DEFAULT_VIDEO_DURATION_SECONDS = 5;
const QUICK_VIDEO_DURATION_SECONDS = 4;
const VARIATION_OUTPUTS = 4;
const SINGLE_OUTPUT = 1;

const VIDEO_TYPE_KEYWORDS = [
  'motion',
  'animate',
  'animation',
  'clip',
  'film',
  'footage',
];
const VERTICAL_ASPECT_KEYWORDS = [
  'story',
  'stories',
  'reel',
  'reels',
  'tiktok',
  'vertical',
  'portrait',
];
const WIDE_ASPECT_KEYWORDS = [
  'banner',
  'wide',
  'cinematic',
  'landscape',
  'thumbnail',
];
const SQUARE_ASPECT_KEYWORDS = ['logo', 'avatar', 'icon', 'profile'];
const QUICK_DURATION_KEYWORDS = ['quick', 'loop', 'teaser'];
const QUALITY_KEYWORDS = ['photoreal', 'photorealistic', 'product shot'];
const SPEED_KEYWORDS = ['draft', 'quick'];
const COST_KEYWORDS = ['cheap', 'budget'];
const VARIATION_KEYWORDS = ['variations', 'variation', 'options', 'versions'];

function normalizePrompt(prompt: string): string {
  return prompt.trim().toLowerCase();
}

function matchesAny(prompt: string, keywords: string[]): boolean {
  return keywords.some((keyword) => prompt.includes(keyword));
}

interface FieldRecommendation<K extends GenerationSetupFieldKey> {
  reason: string;
  value: GenerationSetupValues[K];
}

function resolveType(
  input: GenerationSetupRecommendationInput,
  prompt: string,
): {
  recommendation?: FieldRecommendation<'type'>;
  resolvedType: StudioGenerateType;
} {
  if (input.lockedType) {
    // The surface fixes the type via its own switcher — the agent never
    // gets to override it, so `type` is not part of the recommendation.
    return { resolvedType: input.lockedType };
  }

  const isVideo = matchesAny(prompt, VIDEO_TYPE_KEYWORDS);
  const value: StudioGenerateType = isVideo ? 'video' : 'image';
  const reason = isVideo
    ? 'Prompt describes motion, so this switches to video'
    : 'Defaulting to a still image for this prompt';

  return { recommendation: { reason, value }, resolvedType: value };
}

function resolveAspectRatio(
  input: GenerationSetupRecommendationInput,
  prompt: string,
  resolvedType: StudioGenerateType,
): FieldRecommendation<'aspectRatio'> | undefined {
  if (!input.capabilities.hasAspectRatio) {
    return undefined;
  }

  if (matchesAny(prompt, VERTICAL_ASPECT_KEYWORDS)) {
    return {
      reason: 'Vertical framing matches story/reel-style prompts',
      value: '9:16',
    };
  }

  if (matchesAny(prompt, WIDE_ASPECT_KEYWORDS)) {
    return {
      reason: 'Wide framing matches cinematic/banner-style prompts',
      value: '16:9',
    };
  }

  if (matchesAny(prompt, SQUARE_ASPECT_KEYWORDS)) {
    return {
      reason: 'Square framing matches logo/avatar-style prompts',
      value: '1:1',
    };
  }

  const fallback =
    GENERATION_SETUP_DEFAULT_ASPECT_RATIO_BY_TYPE[resolvedType] ??
    DEFAULT_ASPECT_RATIO;

  return {
    reason: `Default aspect ratio for ${resolvedType}`,
    value: fallback,
  };
}

function resolveDuration(
  input: GenerationSetupRecommendationInput,
  prompt: string,
  resolvedType: StudioGenerateType,
): FieldRecommendation<'duration'> | undefined {
  if (resolvedType !== 'video' || !input.capabilities.hasDuration) {
    return undefined;
  }

  if (matchesAny(prompt, QUICK_DURATION_KEYWORDS)) {
    return {
      reason: 'Short-form phrasing suggests a quick clip',
      value: QUICK_VIDEO_DURATION_SECONDS,
    };
  }

  return {
    reason: 'Default duration for video',
    value: DEFAULT_VIDEO_DURATION_SECONDS,
  };
}

function resolveModelKey(
  input: GenerationSetupRecommendationInput,
): FieldRecommendation<'modelKey'> | undefined {
  if (!input.capabilities.hasModelSelection) {
    return undefined;
  }

  return {
    reason: 'Auto-routes to the best model for this prompt',
    value: '',
  };
}

function resolvePriority(
  input: GenerationSetupRecommendationInput,
  prompt: string,
): FieldRecommendation<'prioritize'> | undefined {
  if (!input.capabilities.hasModelSelection) {
    return undefined;
  }

  if (input.hasZeroCredits) {
    return {
      reason:
        "You're on the free tier, so this routes to the most cost-efficient model",
      value: RouterPriority.COST,
    };
  }

  if (matchesAny(prompt, QUALITY_KEYWORDS)) {
    return {
      reason: 'Photoreal output benefits from the highest-quality model',
      value: RouterPriority.QUALITY,
    };
  }

  if (matchesAny(prompt, COST_KEYWORDS)) {
    return {
      reason: 'Budget phrasing favors the most cost-efficient model',
      value: RouterPriority.COST,
    };
  }

  if (matchesAny(prompt, SPEED_KEYWORDS)) {
    return {
      reason: 'Draft phrasing favors a faster model',
      value: RouterPriority.SPEED,
    };
  }

  return {
    reason: 'Balanced quality and speed for this prompt',
    value: RouterPriority.BALANCED,
  };
}

function resolveOutputs(
  input: GenerationSetupRecommendationInput,
  prompt: string,
): FieldRecommendation<'outputs'> | undefined {
  if (!input.capabilities.hasOutputs) {
    return undefined;
  }

  if (matchesAny(prompt, VARIATION_KEYWORDS)) {
    return {
      reason: 'Prompt asks for multiple variations',
      value: VARIATION_OUTPUTS,
    };
  }

  return {
    reason: 'Single output unless you ask for variations',
    value: SINGLE_OUTPUT,
  };
}

function resolveBrandingMode(
  input: GenerationSetupRecommendationInput,
): FieldRecommendation<'brandingMode'> | undefined {
  if (!input.capabilities.hasBrandEnrichment) {
    return undefined;
  }

  return {
    reason: 'Applies your brand voice and visual references',
    value: 'brand',
  };
}

function resolvePromptEnhance(): FieldRecommendation<'isPromptEnhanceEnabled'> {
  return {
    reason: 'Agent expands your prompt with brand + look context',
    value: true,
  };
}

/**
 * Recommends a partial {@link GenerationSetupValues} plus a matching reason
 * per recommended key. Every returned key carries a reason — the caller
 * (`applyRecommendation`) already filters out fields the operator or a
 * pinned preset owns, so this function never needs to know provenance.
 */
export function recommendGenerationSetup(
  input: GenerationSetupRecommendationInput,
): GenerationSetupRecommendation {
  const prompt = normalizePrompt(input.prompt);
  const values: Partial<GenerationSetupValues> = {};
  const reasons: Partial<Record<GenerationSetupFieldKey, string>> = {};

  function apply<K extends GenerationSetupFieldKey>(
    key: K,
    field: FieldRecommendation<K> | undefined,
  ): void {
    if (!field) {
      return;
    }
    values[key] = field.value;
    reasons[key] = field.reason;
  }

  const { recommendation: typeRecommendation, resolvedType } = resolveType(
    input,
    prompt,
  );
  apply('type', typeRecommendation);
  apply('aspectRatio', resolveAspectRatio(input, prompt, resolvedType));
  apply('duration', resolveDuration(input, prompt, resolvedType));
  apply('modelKey', resolveModelKey(input));
  apply('prioritize', resolvePriority(input, prompt));
  apply('outputs', resolveOutputs(input, prompt));
  apply('brandingMode', resolveBrandingMode(input));
  apply('isPromptEnhanceEnabled', resolvePromptEnhance());

  return { reasons, values };
}
