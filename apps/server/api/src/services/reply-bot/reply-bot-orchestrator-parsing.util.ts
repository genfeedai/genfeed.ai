/**
 * Pure request/state parsing helpers for `ReplyBotOrchestratorService`.
 * Extracted from the service class (none of these touch `this`) to keep the
 * service file from growing past its runtime-complexity ratchet baseline.
 */

import type { ReplyCandidate } from '@api/services/reply-bot/reply-candidate-prefilter.service';
import type { BotActivitySkipReason } from '@genfeedai/contracts';
import type {
  ReplyIntent,
  ReplyIntentSource,
} from '@genfeedai/contracts/interfaces';
import { readRecord } from '@genfeedai/utils/data/extract.util';

export function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Reply bot action requires ${field}`);
  }
  return value;
}

export function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function mergeReplyContext(
  botContext: string | undefined,
  candidateContext: string | undefined,
): string | undefined {
  return (
    [botContext, candidateContext].filter(Boolean).join('\n\n') || undefined
  );
}

export function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export type SerializedReplyCandidate = Omit<ReplyCandidate, 'createdAt'> & {
  createdAt: string;
};
export type ReplyBotRequest = {
  botConfigId: string;
  credentialId: string;
  organizationId: string;
};
export type ReplyBotContentRequest = ReplyBotRequest & {
  content: SerializedReplyCandidate;
};
export type ReplyBotContentResult = {
  dmSent: boolean;
  error?: boolean;
  replySent: boolean;
  skipped: boolean;
};
export type ReplyBotContentState = ReplyBotContentRequest & {
  activityId?: string;
  dmDelayMs: number;
  dmItems: ReplyBotDmRequest[];
  dmText?: string;
  error?: string;
  intent?: ReplyIntent;
  /** Present only when a decision answered; 0..1 (#4866). */
  intentConfidence?: number;
  intentSource?: ReplyIntentSource;
  /** Reply drafted for a person to post; nothing was sent to the platform. */
  isAwaitingApproval?: boolean;
  replyContentId?: string;
  replyContentUrl?: string;
  replySent: boolean;
  replyText?: string;
  skipReason?: BotActivitySkipReason;
  skipped: boolean;
  test?: boolean;
};
export type ReplyBotDmRequest = ReplyBotRequest & {
  activityId: string;
  dmText: string;
  recipientId: string;
  commentId?: string;
  replyContentId?: string;
  replyContentUrl?: string;
  replyText?: string;
};
export type ReplyBotDmState = ReplyBotDmRequest & {
  dmContentId?: string;
  error?: string;
  success: boolean;
};
export type ForEachResult<T> = {
  count: number;
  results: Array<{ index: number; result: T }>;
};

export function readBotRequest(value: unknown): ReplyBotRequest {
  const request = readRecord(value);
  return {
    botConfigId: requiredString(request.botConfigId, 'botConfigId'),
    credentialId: requiredString(request.credentialId, 'credentialId'),
    organizationId: requiredString(request.organizationId, 'organizationId'),
  };
}

export function readContentRequest(value: unknown): ReplyBotContentRequest {
  const request = readRecord(value);
  return {
    ...readBotRequest(request),
    content: request.content as SerializedReplyCandidate,
  };
}

export function readContentState(
  input: Record<string, unknown>,
): ReplyBotContentState {
  const state = readRecord(input.state);
  return (
    Object.keys(state).length > 0 ? state : input
  ) as ReplyBotContentState;
}

export function readDmRequest(value: unknown): ReplyBotDmRequest {
  const request = readRecord(value);
  const replyContentId = optionalString(request.replyContentId);
  const replyContentUrl = optionalString(request.replyContentUrl);
  const replyText = optionalString(request.replyText);
  return {
    ...readBotRequest(request),
    activityId: requiredString(request.activityId, 'activityId'),
    dmText: requiredString(request.dmText, 'dmText'),
    recipientId: requiredString(request.recipientId, 'recipientId'),
    commentId: optionalString(request.commentId),
    ...(replyContentId === undefined ? {} : { replyContentId }),
    ...(replyContentUrl === undefined ? {} : { replyContentUrl }),
    ...(replyText === undefined ? {} : { replyText }),
  };
}

export function readDmState(input: Record<string, unknown>): ReplyBotDmState {
  const state = readRecord(input.state);
  return (Object.keys(state).length > 0 ? state : input) as ReplyBotDmState;
}

export function readForEachResult<T>(value: unknown): ForEachResult<T> {
  const result = readRecord(value);
  return {
    count: numberValue(result.count),
    results: Array.isArray(result.results)
      ? (result.results as ForEachResult<T>['results'])
      : [],
  };
}

export function serializeCandidate(
  candidate: ReplyCandidate,
): SerializedReplyCandidate {
  return { ...candidate, createdAt: candidate.createdAt.toISOString() };
}

export function deserializeCandidate(
  candidate: SerializedReplyCandidate,
): ReplyCandidate {
  return { ...candidate, createdAt: new Date(candidate.createdAt) };
}
