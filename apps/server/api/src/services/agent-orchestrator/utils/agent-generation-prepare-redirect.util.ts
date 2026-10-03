import {
  type CuratedActionName,
  isMediaGenerationType,
  MEDIA_GENERATION_TOOL_NAME,
  type MediaGenerationType,
  type VisualMediaGenerationType,
} from '@genfeedai/actions';
import {
  AgentGenerationMode,
  isExplicitAgentMediaGenerationMode,
} from '@genfeedai/contracts';

/** Per-kind visual names models still emit; recovered onto `generate`. */
const DIRECT_VISUAL_GENERATION_TOOLS = new Set<string>([
  'generate_as_identity',
  'generate_image',
  'generate_video',
]);

const NON_MEDIA_GENERATE_TOOLS = new Set<string>([
  'generate_ad_pack',
  'generate_content',
  'generate_content_batch',
  'generate_monthly_content',
  'generate_music',
  'generate_onboarding_content',
]);

/**
 * Gemini/OpenAI-compat vendors prefix tool names (`default_api.generate`).
 * The last dotted segment is the catalog name we actually dispatch.
 */
export function normalizeRequestedAgentToolName(toolName: string): string {
  const trimmed = toolName.trim();
  const separator = trimmed.lastIndexOf('.');
  if (separator >= 0 && separator < trimmed.length - 1) {
    return trimmed.slice(separator + 1);
  }
  return trimmed;
}

function compactToolName(toolName: string): string {
  return toolName.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isVoiceGenerateLike(normalizedName: string): boolean {
  if (normalizedName === 'generate_voice') {
    return true;
  }
  if (NON_MEDIA_GENERATE_TOOLS.has(normalizedName)) {
    return false;
  }

  const compact = compactToolName(normalizedName);
  const hasVoiceSurface =
    compact.includes('tts') ||
    compact.includes('speech') ||
    compact.includes('voice') ||
    compact.includes('voiceover');
  const hasGenerateIntent =
    compact.includes('audio') ||
    compact.includes('generat') ||
    compact.includes('speech') ||
    compact.includes('tts') ||
    compact.includes('voiceover');

  return hasVoiceSurface && hasGenerateIntent;
}

function isVisualGenerateLike(normalizedName: string): boolean {
  if (DIRECT_VISUAL_GENERATION_TOOLS.has(normalizedName)) {
    return true;
  }
  if (NON_MEDIA_GENERATE_TOOLS.has(normalizedName)) {
    return false;
  }

  const compact = compactToolName(normalizedName);
  if (
    compact.includes('content') ||
    compact.includes('music') ||
    compact.includes('voice') ||
    compact.includes('workflow')
  ) {
    return false;
  }

  const hasGenerateIntent =
    compact.includes('generat') ||
    compact.includes('text2') ||
    compact.includes('txt2');
  const hasVisualSurface =
    compact.includes('avatar') ||
    compact.includes('identity') ||
    compact.includes('image') ||
    compact.includes('img') ||
    compact.includes('video');

  return hasGenerateIntent && hasVisualSurface;
}

export function isIdentityGenerationToolName(toolName: string): boolean {
  const normalized = normalizeRequestedAgentToolName(toolName);
  if (normalized === 'generate_as_identity') {
    return true;
  }
  return compactToolName(normalized).includes('identity');
}

export function inferPrepareGenerationType(
  toolName: string,
): AgentGenerationMode.IMAGE | AgentGenerationMode.VIDEO | undefined {
  const normalized = normalizeRequestedAgentToolName(toolName);
  if (normalized === 'generate_image') {
    return AgentGenerationMode.IMAGE;
  }
  if (
    normalized === 'generate_as_identity' ||
    normalized === 'generate_video'
  ) {
    return AgentGenerationMode.VIDEO;
  }

  const compact = compactToolName(normalized);
  if (compact.includes('image') || compact.includes('img')) {
    return AgentGenerationMode.IMAGE;
  }
  if (
    compact.includes('avatar') ||
    compact.includes('identity') ||
    compact.includes('video')
  ) {
    return AgentGenerationMode.VIDEO;
  }

  return undefined;
}

interface GenerationRedirectOptions {
  generationMode?: AgentGenerationMode | string;
  requestedGenerationType?: unknown;
  /** `type` of a canonical `generate` call. */
  requestedMediaType?: unknown;
}

export interface GenerationRedirect {
  toolName: CuratedActionName;
  /** `type` to set when the redirect lands on `generate`. */
  mediaType?: MediaGenerationType;
}

function toVisualMediaType(
  mode: AgentGenerationMode.IMAGE | AgentGenerationMode.VIDEO,
): VisualMediaGenerationType {
  return mode === AgentGenerationMode.VIDEO ? 'video' : 'image';
}

export function resolveVisualGenerationType(
  toolName: string,
  options: GenerationRedirectOptions,
): VisualMediaGenerationType | undefined {
  if (isExplicitAgentMediaGenerationMode(options.generationMode)) {
    return toVisualMediaType(options.generationMode);
  }
  if (
    typeof options.requestedGenerationType === 'string' &&
    isExplicitAgentMediaGenerationMode(options.requestedGenerationType)
  ) {
    return toVisualMediaType(options.requestedGenerationType);
  }
  const inferred = inferPrepareGenerationType(toolName);
  return inferred ? toVisualMediaType(inferred) : undefined;
}

/**
 * The composer owns media review and settings now, so visual generation is a
 * direct `generate` call. Recover prepare calls, vendor-prefixed calls, and
 * per-kind names models still emit (`generate_image`, `txt2video`) onto
 * `generate` with the matching `type`, and keep voice on the voice-clone
 * confirmation flow. An explicit composer mode wins over the model's type.
 */
export function getGenerationPreparationRedirect(
  toolName: string,
  allowedTools: Set<CuratedActionName>,
  options: GenerationRedirectOptions = {},
): GenerationRedirect | null {
  const normalized = normalizeRequestedAgentToolName(toolName);
  const hasVisualGenerationSurface =
    allowedTools.has('prepare_generation') ||
    allowedTools.has(MEDIA_GENERATION_TOOL_NAME);

  if (normalized === MEDIA_GENERATION_TOOL_NAME) {
    const requested = isMediaGenerationType(options.requestedMediaType)
      ? options.requestedMediaType
      : undefined;
    if (requested === 'voice' && allowedTools.has('prepare_voice_clone')) {
      return { toolName: 'prepare_voice_clone' };
    }
    if (
      (requested === 'image' || requested === 'video') &&
      hasVisualGenerationSurface
    ) {
      const resolved = isExplicitAgentMediaGenerationMode(
        options.generationMode,
      )
        ? toVisualMediaType(options.generationMode)
        : requested;
      if (
        resolved !== requested ||
        !allowedTools.has(MEDIA_GENERATION_TOOL_NAME)
      ) {
        return { mediaType: resolved, toolName: MEDIA_GENERATION_TOOL_NAME };
      }
    }
    return null;
  }

  if (
    hasVisualGenerationSurface &&
    (normalized === 'prepare_generation' || isVisualGenerateLike(normalized))
  ) {
    const mediaType = resolveVisualGenerationType(normalized, options);
    if (mediaType) {
      return { mediaType, toolName: MEDIA_GENERATION_TOOL_NAME };
    }
  }

  if (
    allowedTools.has('prepare_voice_clone') &&
    isVoiceGenerateLike(normalized)
  ) {
    return { toolName: 'prepare_voice_clone' };
  }

  if (allowedTools.has(MEDIA_GENERATION_TOOL_NAME)) {
    if (normalized === 'generate_music') {
      return { mediaType: 'music', toolName: MEDIA_GENERATION_TOOL_NAME };
    }
    if (isVoiceGenerateLike(normalized)) {
      return { mediaType: 'voice', toolName: MEDIA_GENERATION_TOOL_NAME };
    }
  }

  return null;
}
