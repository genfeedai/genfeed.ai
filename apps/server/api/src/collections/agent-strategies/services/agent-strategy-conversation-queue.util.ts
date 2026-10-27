import type { AgentStrategyOpportunityDocument } from '@api/collections/agent-strategies/schemas/agent-strategy-opportunity.schema';
import type { AgentStrategyOpportunityStatus } from '@api/collections/agent-strategies/schemas/agent-strategy-policy.schema';
import {
  CONVERSATION_STATE_STATUS,
  type ConversationMetadata,
  type ConversationQueueItem,
  type ConversationQueueState,
  type ConversationScope,
  type ConversationScore,
  type ConversationScoringContext,
  type ConversationSource,
} from '@api/collections/agent-strategies/services/agent-strategy-conversation-queue.types';

/** A post older than this is no longer a conversation worth joining. */
export const CONVERSATION_FRESHNESS_HOURS = 48;
/** Open items kept per queue; the rest wait until some are decided. */
export const CONVERSATION_QUEUE_LIMIT = 25;

const HOUR_MS = 3_600_000;
const MIN_TOKEN_LENGTH = 4;
/** A post with this many replies is a crowd; a reply there is rarely read. */
const CROWDED_REPLY_COUNT = 50;
const THIN_CONTENT_LENGTH = 40;

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= MIN_TOKEN_LENGTH);
}

function ageHours(source: ConversationSource, now: Date): number {
  return (now.getTime() - new Date(source.createdAt).getTime()) / HOUR_MS;
}

function recencyOf(hours: number): number {
  return Math.max(
    0,
    Math.round(100 * (1 - hours / CONVERSATION_FRESHNESS_HOURS)),
  );
}

function priorityOf(
  score: Pick<ConversationScore, 'contributionScore' | 'relevanceScore'>,
  recencyScore: number,
): number {
  return Math.round(
    0.5 * score.relevanceScore +
      0.3 * recencyScore +
      0.2 * score.contributionScore,
  );
}

function describeAge(hours: number): string {
  return hours < 1 ? 'under an hour ago' : `${Math.floor(hours)}h ago`;
}

export function isOwnPost(source: ConversationSource, ownHandle?: string) {
  return (
    Boolean(ownHandle) &&
    source.authorUsername.replace(/^@/, '').toLowerCase() ===
      ownHandle?.replace(/^@/, '').toLowerCase()
  );
}

/** Topics the post speaks to: the topic's phrase, or any of its longer words. */
function matchedTopics(content: string, topics: string[]): string[] {
  const lowerContent = content.toLowerCase();
  const contentTokens = new Set(tokens(content));
  return topics.filter((topic) => {
    const phrase = topic.trim().toLowerCase();
    return (
      phrase.length > 0 &&
      (lowerContent.includes(phrase) ||
        tokens(phrase).some((token) => contentTokens.has(token)))
    );
  });
}

/**
 * Ranks one post for the queue, or returns `null` when it does not belong:
 * not fresh, our own post, a repost, or not about any topic of the brand.
 * Relevance and recency come from the post and the brand's topics; the
 * contribution score is a heuristic for whether a reply has room to add
 * something (a question to answer, a thread not yet crowded).
 */
export function scoreConversation(
  source: ConversationSource,
  context: ConversationScoringContext,
): ConversationScore | null {
  const hours = ageHours(source, context.now);
  if (
    Number.isNaN(hours) ||
    hours < 0 ||
    hours >= CONVERSATION_FRESHNESS_HOURS ||
    isOwnPost(source, context.ownHandle) ||
    /^RT @/i.test(source.content.trim())
  ) {
    return null;
  }

  const matches = matchedTopics(source.content, context.topics);
  if (matches.length === 0) {
    return null;
  }

  const relevanceScore = Math.round(
    (matches.length / context.topics.length) * 100,
  );
  const recencyScore = recencyOf(hours);
  const asksQuestion = source.content.includes('?');
  const isCrowded = (source.replyCount ?? 0) >= CROWDED_REPLY_COUNT;
  const isThin = source.content.trim().length < THIN_CONTENT_LENGTH;
  const contributionScore = Math.max(
    0,
    Math.min(
      100,
      50 + (asksQuestion ? 30 : 0) - (isCrowded ? 30 : 0) - (isThin ? 20 : 0),
    ),
  );
  const notes = [
    `About ${matches.join(', ')}`,
    `posted ${describeAge(hours)}`,
    asksQuestion ? 'asks a question' : null,
    isCrowded ? 'busy thread' : null,
  ].filter((note): note is string => Boolean(note));

  return {
    contributionScore,
    priorityScore: priorityOf(
      { contributionScore, relevanceScore },
      recencyScore,
    ),
    reason: notes.join(' · '),
    recencyScore,
    relevanceScore,
  };
}

export function isSameScope(
  left: ConversationScope,
  right: ConversationScope,
): boolean {
  return (
    left.brandId === right.brandId &&
    (left.credentialId ?? null) === (right.credentialId ?? null)
  );
}

export function isFresh(source: ConversationSource, now: Date): boolean {
  const hours = ageHours(source, now);
  return !Number.isNaN(hours) && hours < CONVERSATION_FRESHNESS_HOURS;
}

export function freshnessDeadline(source: ConversationSource): Date {
  return new Date(
    new Date(source.createdAt).getTime() +
      CONVERSATION_FRESHNESS_HOURS * HOUR_MS,
  );
}

export function topicFor(source: ConversationSource): string {
  const excerpt = source.content.replace(/\s+/g, ' ').trim().slice(0, 100);
  return `Reply to @${source.authorUsername}: ${excerpt}`;
}

export function stateForStatus(
  status: AgentStrategyOpportunityStatus | string,
): ConversationQueueState | null {
  const entry = (
    Object.entries(CONVERSATION_STATE_STATUS) as Array<
      [ConversationQueueState, AgentStrategyOpportunityStatus]
    >
  ).find(([, mapped]) => mapped === status);
  return entry ? entry[0] : null;
}

/** The queue metadata of an opportunity, or `null` when it is not a queue row. */
export function readConversation(
  opportunity: AgentStrategyOpportunityDocument,
): ConversationMetadata | null {
  const value = opportunity.metadata?.conversation;
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !('source' in value) ||
    !('scope' in value) ||
    !('score' in value)
  ) {
    return null;
  }
  return value as ConversationMetadata;
}

/**
 * The reviewer's view of an opportunity. Freshness is re-read here so a post
 * keeps ranking by how old it is now, not by how old it was when queued.
 */
export function toQueueItem(
  opportunity: AgentStrategyOpportunityDocument,
  now: Date,
): ConversationQueueItem | null {
  const conversation = readConversation(opportunity);
  const state = stateForStatus(opportunity.status);
  if (!conversation || !state) {
    return null;
  }
  const recencyScore = recencyOf(ageHours(conversation.source, now));
  return {
    ...(conversation.draft ? { draft: conversation.draft } : {}),
    expiresAt: opportunity.expiresAt
      ? new Date(opportunity.expiresAt).toISOString()
      : null,
    id: opportunity.id,
    priorityScore: priorityOf(conversation.score, recencyScore),
    reason: conversation.score.reason,
    scope: conversation.scope,
    source: conversation.source,
    state,
  };
}
