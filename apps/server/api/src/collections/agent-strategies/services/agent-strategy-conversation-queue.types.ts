import type { AgentStrategyOpportunityStatus } from '@api/collections/agent-strategies/schemas/agent-strategy-policy.schema';

/** The X post a reply would answer, kept exactly as it was read. */
export interface ConversationSource {
  authorName?: string;
  authorUsername: string;
  content: string;
  /** ISO time the post was published on X. */
  createdAt: string;
  id: string;
  replyCount?: number;
  url: string;
}

/** The brand and connected account a queue belongs to. */
export interface ConversationScope {
  brandId: string;
  credentialId?: string;
}

export type ConversationQueueState =
  | 'dismissed'
  | 'drafted'
  | 'expired'
  | 'new'
  | 'replied';

export interface ConversationScore {
  contributionScore: number;
  priorityScore: number;
  /** Why this post is in the queue, in words the reviewer reads. */
  reason: string;
  recencyScore: number;
  relevanceScore: number;
}

/** What is kept in the opportunity's `metadata.conversation`. */
export interface ConversationMetadata {
  draft?: { turboRunId: string };
  reply?: ConversationReceipt;
  scope: ConversationScope;
  score: ConversationScore;
  source: ConversationSource;
}

/** Proof that the reply went out: the post the platform returned. */
export interface ConversationReceipt {
  externalPostId: string;
  repliedAt: string;
  url?: string;
}

export interface ConversationQueueItem {
  draft?: { turboRunId: string };
  expiresAt: string | null;
  id: string;
  priorityScore: number;
  reason: string;
  scope: ConversationScope;
  source: ConversationSource;
  state: ConversationQueueState;
}

export interface ConversationScoringContext {
  /** The handle of the connected account: it never replies to itself. */
  ownHandle?: string;
  now: Date;
  topics: string[];
}

/** Everything a reply draft is written from; nothing else is sent. */
export interface ConversationDraftContext {
  opportunityId: string;
  reason: string;
  scope: ConversationScope;
  source: ConversationSource;
}

export interface ConversationIngestResult {
  /** Queued, dismissed, answered or expired before: never queued twice. */
  alreadySeen: number;
  ineligible: number;
  queued: number;
  /** Eligible, but the queue has no room for it. */
  skippedForRoom: number;
}

export const CONVERSATION_STATE_STATUS: Record<
  ConversationQueueState,
  AgentStrategyOpportunityStatus
> = {
  dismissed: 'discarded',
  drafted: 'approved',
  expired: 'expired',
  new: 'queued',
  replied: 'published',
};
