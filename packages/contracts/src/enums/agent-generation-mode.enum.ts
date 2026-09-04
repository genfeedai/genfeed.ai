/**
 * Per-turn media routing on the Agent composer send boundary.
 *
 * Domain-only — not a Prisma enum. `AUTO` is conversation (the model picks
 * tools). `IMAGE` / `VIDEO` skip the LLM and run `confirm_generate_media`.
 */
export enum AgentGenerationMode {
  AUTO = 'auto',
  IMAGE = 'image',
  VIDEO = 'video',
}

export function isExplicitAgentMediaGenerationMode(
  mode: AgentGenerationMode | string | undefined | null,
): mode is AgentGenerationMode.IMAGE | AgentGenerationMode.VIDEO {
  return (
    mode === AgentGenerationMode.IMAGE || mode === AgentGenerationMode.VIDEO
  );
}

const VIDEO_PROMPT_PATTERNS: readonly RegExp[] = [
  /\b(generate|create|make|render)\b[\s\S]{0,48}\b(video|clip|film|animation|footage)\b/i,
  /\b(animate|animation|footage)\b/i,
  /\b(video|film)\s+of\b/i,
];

const IMAGE_PROMPT_PATTERNS: readonly RegExp[] = [
  /\b(generate|create|make|render|draw)\b[\s\S]{0,48}\b(image|picture|photo|pic|illustration|artwork)\b/i,
  /\b(image|picture|photo|illustration|artwork)\s+of\b/i,
  /\bphotoreal(istic)?\b/i,
  /^(imagine|visualize)\b(?!\s+(if|we|you|that|this)\b)/i,
];

/**
 * Keyword classifier for Auto-mode turns. Locked IMAGE/VIDEO still wins;
 * this only promotes Auto → media when the prompt is unambiguously a generate
 * request, so the LLM never has to pick `prepare_generation` vs a handoff tool.
 */
export function inferAgentMediaGenerationModeFromPrompt(
  prompt: string | undefined | null,
): AgentGenerationMode.IMAGE | AgentGenerationMode.VIDEO | undefined {
  const text = prompt?.trim() ?? '';
  if (!text) {
    return undefined;
  }
  if (VIDEO_PROMPT_PATTERNS.some((pattern) => pattern.test(text))) {
    return AgentGenerationMode.VIDEO;
  }
  if (IMAGE_PROMPT_PATTERNS.some((pattern) => pattern.test(text))) {
    return AgentGenerationMode.IMAGE;
  }
  return undefined;
}

export function resolveAgentTurnGenerationMode(params: {
  generationMode?: AgentGenerationMode | string | null;
  prompt?: string | null;
}): AgentGenerationMode {
  if (isExplicitAgentMediaGenerationMode(params.generationMode)) {
    return params.generationMode;
  }
  return (
    inferAgentMediaGenerationModeFromPrompt(params.prompt) ??
    AgentGenerationMode.AUTO
  );
}
