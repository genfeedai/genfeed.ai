import type { AgentChatContext } from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import {
  isUntrustedFramingTitle,
  stripUntrustedContentFraming,
} from '@api/services/agent-orchestrator/utils/agent-untrusted-content.util';

/**
 * Pure thread-title helpers shared across orchestrator chat paths
 * (sync, stream, plan mode, batch, recurring tasks).
 */

export type AgentThreadTitlePersistence = {
  findOne: (query: Record<string, unknown>) => Promise<unknown>;
  updateThreadMetadata: (
    threadId: string,
    organizationId: string,
    metadata: { title: string },
  ) => Promise<unknown>;
};

export function buildSeedThreadTitle(content: string): string {
  // Trim first so leading/trailing whitespace does not steal budget from the cap.
  // Never title from the model-facing untrusted-data fence.
  return stripUntrustedContentFraming(content).substring(0, 100);
}

export function buildFallbackThreadTitle(prompt: string): string {
  const fillerPattern =
    /\b(can you|could you|help me|i need|i want|please|let's|lets|show me|tell me|give me|make me|create|generate|draft|write)\b/gi;
  const cleaned = stripUntrustedContentFraming(prompt)
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
    return buildSeedThreadTitle(stripUntrustedContentFraming(prompt));
  }

  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function sanitizeGeneratedThreadTitle(
  title: string,
  prompt: string,
): string {
  if (isUntrustedFramingTitle(title)) {
    return buildFallbackThreadTitle(prompt);
  }

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

/**
 * Persist a generated title only while the thread still holds the seed title
 * (first-message naming race-safe). Returns the persisted title, or null when
 * nothing changed, so callers can push it to live clients.
 */
export async function maybeUpdateThreadTitle(params: {
  agentThreadsService: AgentThreadTitlePersistence;
  context: AgentChatContext;
  seedTitle: string;
  threadId: string;
  title: string | null;
}): Promise<string | null> {
  const seedTitle = params.seedTitle.trim();
  const nextTitle = params.title?.trim() ?? '';

  if (!seedTitle || !nextTitle || nextTitle === seedTitle) {
    return null;
  }

  const thread = (await params.agentThreadsService.findOne({
    id: params.threadId,
    organizationId: params.context.organizationId,
    userId: {
      in: [params.context.userId],
    },
  })) as { title?: string } | null;

  const currentTitle =
    typeof thread?.title === 'string' ? thread.title.trim() : '';
  if (currentTitle !== seedTitle) {
    return null;
  }

  await params.agentThreadsService.updateThreadMetadata(
    params.threadId,
    params.context.organizationId,
    { title: nextTitle },
  );
  return nextTitle;
}
