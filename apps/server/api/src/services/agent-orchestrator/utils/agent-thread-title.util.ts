import type { AgentChatContext } from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import { findTrailingJsonObject } from '@api/services/agent-orchestrator/utils/agent-plan-question.util';
import {
  isUntrustedFramingTitle,
  stripUntrustedContentFraming,
} from '@api/services/agent-orchestrator/utils/agent-untrusted-content.util';

const QUOTE_CHARS_PATTERN = /[`"'“”‘’]/g;
const NON_ALPHANUMERIC_CHARS_PATTERN = /[^a-zA-Z0-9\s]/g;
const WHITESPACE_RUNS_PATTERN = /\s+/g;
const TITLE_UNSAFE_CHARS_PATTERN = /[^\w\s'-]/g;
const FENCED_JSON_PATTERN = /^```(?:json)?\s*([\s\S]*?)\s*```$/i;

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
    .replace(QUOTE_CHARS_PATTERN, ' ')
    .replace(NON_ALPHANUMERIC_CHARS_PATTERN, ' ')
    .replace(fillerPattern, ' ')
    .replace(WHITESPACE_RUNS_PATTERN, ' ')
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
    .replace(QUOTE_CHARS_PATTERN, ' ')
    .replace(TITLE_UNSAFE_CHARS_PATTERN, ' ')
    .replace(WHITESPACE_RUNS_PATTERN, ' ')
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

const REPLY_ENVELOPE_KEYS: ReadonlySet<string> = new Set([
  'content',
  'explanation',
  'steps',
  'summary',
  'title',
]);

interface ReplyEnvelope {
  content?: unknown;
  explanation?: unknown;
  steps?: unknown;
  summary?: unknown;
  title?: unknown;
}

function readEnvelopeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Splits a reply into the prose around its title/content/plan envelope and the
 * envelope itself. A model asked for JSON often opens with a sentence ("I'll
 * check your review queue first.") and then the object; the object must not
 * reach the transcript as text. A reply that is only JSON keeps the old rule
 * (anything with a `content` string unwraps); an object after prose counts as
 * an envelope only when every key belongs to one.
 */
function isReplyEnvelope(parsed: ReplyEnvelope): boolean {
  return (
    Object.keys(parsed).every((key) => REPLY_ENVELOPE_KEYS.has(key)) &&
    (typeof parsed.content === 'string' || Array.isArray(parsed.steps))
  );
}

function splitReplyEnvelope(
  assistantContent: string,
  options: { isLenient: boolean },
): {
  envelope: ReplyEnvelope | null;
  prose: string;
} {
  const trimmed = assistantContent.trim();
  const fencedJsonMatch = trimmed.match(FENCED_JSON_PATTERN);
  const candidate = fencedJsonMatch?.[1]?.trim() ?? trimmed;

  if (candidate.startsWith('{') && candidate.endsWith('}')) {
    try {
      const parsed = JSON.parse(candidate) as ReplyEnvelope;
      return options.isLenient || isReplyEnvelope(parsed)
        ? { envelope: parsed, prose: '' }
        : { envelope: null, prose: trimmed };
    } catch {
      return { envelope: null, prose: trimmed };
    }
  }

  const embedded = findTrailingJsonObject(candidate);
  if (!embedded) {
    return { envelope: null, prose: trimmed };
  }
  const parsed = JSON.parse(embedded) as ReplyEnvelope;
  return isReplyEnvelope(parsed)
    ? {
        envelope: parsed,
        prose: candidate.slice(0, candidate.length - embedded.length).trim(),
      }
    : { envelope: null, prose: trimmed };
}

export function extractThreadEnvelope(params: {
  assistantContent: string;
  prompt: string;
  seedTitle: string;
}): { content: string; title: string | null } {
  // The first reply is asked for a title/content envelope, so any JSON object
  // with a `content` string unwraps. Later replies only lose an object that is
  // shaped like an envelope, so JSON the user asked for survives.
  const { envelope, prose } = splitReplyEnvelope(params.assistantContent, {
    isLenient: Boolean(params.seedTitle.trim()),
  });
  const envelopeText = readEnvelopeText(envelope?.content);
  const content = envelope
    ? [
        ...new Set(
          [
            prose,
            envelopeText ||
              readEnvelopeText(envelope.summary) ||
              readEnvelopeText(envelope.explanation),
          ].filter(Boolean),
        ),
      ].join('\n\n') || params.assistantContent
    : params.assistantContent;

  if (!params.seedTitle.trim()) {
    return { content, title: null };
  }

  const parsedTitle = readEnvelopeText(envelope?.title);

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
