/**
 * Reply-bot comment intent (#4866, epic #4863).
 *
 * The persona vocabulary the Replies surface routes on, plus the shape of one
 * classification. A classification says three things a caller needs and must
 * not re-derive: which persona, how the answer was reached, and whether the
 * bot may act on it without a person.
 */

import type { TypedDecisionMode } from './typed-decision.interface';

/**
 * Persona routing vocabulary. Also the option list of the `reply_bot.intent`
 * typed decision, so it stays a bounded Genfeed enum and never free text.
 */
export const REPLY_INTENT_VALUES = [
  'thanks',
  'question',
  'troll',
  'spam',
  'default',
] as const;

export type ReplyIntent = (typeof REPLY_INTENT_VALUES)[number];

/**
 * How the acted-on intent was reached. Persisted next to the intent so an
 * operator can tell a regex skip from a model skip from their own override.
 */
export type ReplyIntentSource = 'regex' | 'decision' | 'human';

export interface IReplyIntentClassification {
  /** Only set when the provider answered; 0..1. */
  confidence?: number;
  intent: ReplyIntent;
  /** Skip the auto-reply outright. Never true together with `isNeedsReview`. */
  isAutoSkip: boolean;
  /**
   * Neither auto-reply nor auto-skip — the comment is queued for a person.
   * This is what a sub-threshold or failed decision buys: an uncertain
   * comment reaches a human instead of being guessed at.
   */
  isNeedsReview: boolean;
  source: ReplyIntentSource;
}

/**
 * Decision state. Comment text, the author's handle, whether the comment
 * carries links and a short caption of the post it sits under — never the
 * brand's private reply instructions.
 */
export interface IReplyIntentClassifyParams {
  authorHandle?: string;
  brandId?: string;
  commentText: string;
  organizationId?: string;
  /** Operator override. Authoritative over the regex and the provider alike. */
  override?: ReplyIntent | null;
  /** Caption of the parent post, truncated by the classifier. */
  postCaption?: string;
  runId?: string;
  userId?: string;
}

/**
 * Resolved rollout gate for the `reply_bot.intent` decision point. #4912
 * replaces this with a settings service; until then it is read from config by
 * one resolver.
 */
export interface IReplyIntentDecisionSettings {
  minConfidence: number;
  mode: TypedDecisionMode;
}
