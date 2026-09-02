import { AgentToolName } from '@genfeedai/interfaces';

const DIRECT_VISUAL_GENERATION_TOOLS = new Set<string>([
  AgentToolName.GENERATE_AS_IDENTITY,
  AgentToolName.GENERATE_IMAGE,
  AgentToolName.GENERATE_VIDEO,
]);

const NON_MEDIA_GENERATE_TOOLS = new Set<string>([
  AgentToolName.GENERATE_AD_PACK,
  AgentToolName.GENERATE_CONTENT,
  AgentToolName.GENERATE_CONTENT_BATCH,
  AgentToolName.GENERATE_MONTHLY_CONTENT,
  AgentToolName.GENERATE_MUSIC,
  AgentToolName.GENERATE_ONBOARDING_CONTENT,
]);

/**
 * Gemini/OpenAI-compat vendors prefix tool names (`default_api.generate_image`).
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
  if (normalizedName === AgentToolName.GENERATE_VOICE) {
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

export function inferPrepareGenerationType(
  toolName: string,
): 'image' | 'video' | undefined {
  const normalized = normalizeRequestedAgentToolName(toolName);
  if (normalized === AgentToolName.GENERATE_IMAGE) {
    return 'image';
  }
  if (
    normalized === AgentToolName.GENERATE_AS_IDENTITY ||
    normalized === AgentToolName.GENERATE_VIDEO
  ) {
    return 'video';
  }

  const compact = compactToolName(normalized);
  if (compact.includes('image') || compact.includes('img')) {
    return 'image';
  }
  if (
    compact.includes('avatar') ||
    compact.includes('identity') ||
    compact.includes('video')
  ) {
    return 'video';
  }

  return undefined;
}

interface GenerationRedirectOptions {
  generationMode?: 'auto' | 'image' | 'video';
  requestedGenerationType?: unknown;
}

function resolveVisualGenerationType(
  toolName: string,
  options: GenerationRedirectOptions,
): 'image' | 'video' | undefined {
  if (
    options.generationMode === 'image' ||
    options.generationMode === 'video'
  ) {
    return options.generationMode;
  }
  if (
    options.requestedGenerationType === 'image' ||
    options.requestedGenerationType === 'video'
  ) {
    return options.requestedGenerationType;
  }
  return inferPrepareGenerationType(toolName);
}

/**
 * The composer owns media review and settings now, so visual generation is a
 * direct action. Recover both prepare calls and vendor-prefixed direct calls to
 * the concrete executor tool while retaining voice clone's confirmation flow.
 */
export function getGenerationPreparationRedirect(
  toolName: string,
  allowedTools: Set<AgentToolName>,
  options: GenerationRedirectOptions = {},
): AgentToolName | null {
  const normalized = normalizeRequestedAgentToolName(toolName);
  const isPrepareVisual = normalized === AgentToolName.PREPARE_GENERATION;
  const hasVisualGenerationSurface =
    allowedTools.has(AgentToolName.PREPARE_GENERATION) ||
    allowedTools.has(AgentToolName.GENERATE_IMAGE) ||
    allowedTools.has(AgentToolName.GENERATE_VIDEO);

  if (
    hasVisualGenerationSurface &&
    (isPrepareVisual || isVisualGenerateLike(normalized))
  ) {
    const generationType = resolveVisualGenerationType(normalized, options);
    const directTool =
      generationType === 'video'
        ? AgentToolName.GENERATE_VIDEO
        : generationType === 'image'
          ? AgentToolName.GENERATE_IMAGE
          : null;
    if (
      directTool &&
      (directTool !== normalized || !allowedTools.has(directTool))
    ) {
      return directTool;
    }
  }

  if (
    allowedTools.has(AgentToolName.PREPARE_VOICE_CLONE) &&
    isVoiceGenerateLike(normalized)
  ) {
    return AgentToolName.PREPARE_VOICE_CLONE;
  }

  return null;
}
