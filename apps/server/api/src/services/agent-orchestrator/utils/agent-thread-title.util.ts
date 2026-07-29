/**
 * Pure thread-title helpers shared across orchestrator chat paths
 * (sync, stream, plan mode, batch, recurring tasks).
 */

export function buildSeedThreadTitle(content: string): string {
  return content.substring(0, 100).trim();
}

export function buildFallbackThreadTitle(prompt: string): string {
  const fillerPattern =
    /\b(can you|could you|help me|i need|i want|please|let's|lets|show me|tell me|give me|make me|create|generate|draft|write)\b/gi;
  const cleaned = prompt
    .replace(/[`"'“”‘’]/g, ' ')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(fillerPattern, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = cleaned
    .split(' ')
    .filter((word) => word.length > 1)
    .slice(0, 5);

  if (words.length === 0) {
    return buildSeedThreadTitle(prompt);
  }

  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function sanitizeGeneratedThreadTitle(
  title: string,
  prompt: string,
): string {
  const normalized = title
    .replace(/[`"'“”‘’]/g, ' ')
    .replace(/[^\w\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    return buildFallbackThreadTitle(prompt);
  }

  const words = normalized.split(' ').filter(Boolean).slice(0, 5);
  if (words.length < 2) {
    return buildFallbackThreadTitle(prompt);
  }

  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function extractThreadEnvelope(params: {
  assistantContent: string;
  prompt: string;
  seedTitle: string;
}): { content: string; title: string | null } {
  if (!params.seedTitle.trim()) {
    return {
      content: params.assistantContent,
      title: null,
    };
  }

  const trimmed = params.assistantContent.trim();
  const fencedJsonMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fencedJsonMatch?.[1]?.trim() ?? trimmed;
  let parsed: {
    content?: unknown;
    title?: unknown;
  } | null = null;

  if (candidate.startsWith('{') && candidate.endsWith('}')) {
    try {
      parsed = JSON.parse(candidate) as {
        content?: unknown;
        title?: unknown;
      };
    } catch {
      parsed = null;
    }
  }

  const content =
    typeof parsed?.content === 'string' && parsed.content.trim()
      ? parsed.content.trim()
      : params.assistantContent;
  const parsedTitle =
    typeof parsed?.title === 'string' ? parsed.title.trim() : '';

  return {
    content,
    title: parsedTitle
      ? sanitizeGeneratedThreadTitle(parsedTitle, params.prompt)
      : buildFallbackThreadTitle(params.prompt),
  };
}
