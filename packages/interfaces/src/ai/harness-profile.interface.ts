import type { IBaseEntity } from '../core/base.interface';

export type HarnessProfileScope = 'brand' | 'channel' | 'company' | 'founder';
export type HarnessProfileStatus = 'active' | 'draft';

export interface IHarnessProfileThesis {
  beliefs?: string[];
  enemies?: string[];
  offers?: string[];
  proofPoints?: string[];
}

export interface IHarnessProfileVoice {
  tone?: string;
  style?: string;
  stance?: string;
  aggression?: string;
  sarcasm?: string;
  vocabulary?: string[];
  bannedPhrases?: string[];
}

export interface IHarnessProfileStructure {
  shortFormSkeleton?: string[];
  longFormSkeleton?: string[];
  lineRules?: string[];
  transitions?: string[];
  endings?: string[];
}

export interface IHarnessProfileExamples {
  good?: string[];
  avoid?: string[];
}

/**
 * Audit trail for anti-examples appended automatically from human review
 * decisions (rejected / request_changes on generated content). Tracked
 * separately from `examples.avoid` (which stays a flat string list so the
 * settings UI keeps editing it as plain text) so the cap/eviction logic in
 * `HarnessReviewFeedbackService` can tell auto-added entries apart from
 * operator/seed-curated ones and never evict the latter.
 */
export interface IHarnessAvoidFeedbackEntry {
  /** Excerpted, length-capped copy of the rejected content. */
  content: string;
  /** Reviewer-supplied rejection feedback, when present. */
  reason?: string;
  /** `${sourceType}:${sourceId}` stamp of the review decision, for audit + dedupe. */
  source: string;
  /** ISO timestamp the entry was recorded. */
  addedAt: string;
  /** True for entries appended by the review-feedback pipeline (evictable). */
  isAutoAdded: boolean;
}

export interface IHarnessProfile extends IBaseEntity {
  organization?: string;
  organizationId?: string;
  createdBy?: string;
  createdById?: string;
  brandId?: string;
  profileType: 'harness';
  label: string;
  description?: string;
  scope: HarnessProfileScope;
  status: HarnessProfileStatus;
  isDefault: boolean;
  platforms: string[];
  handles: Record<string, string>;
  audience: string[];
  thesis: IHarnessProfileThesis;
  voice: IHarnessProfileVoice;
  structure: IHarnessProfileStructure;
  examples: IHarnessProfileExamples;
  /** Auto-added anti-example audit trail. See `IHarnessAvoidFeedbackEntry`. */
  avoidFeedback?: IHarnessAvoidFeedbackEntry[];
  guardrails: string[];
  metadata?: Record<string, unknown>;
}

export type ICreateHarnessProfilePayload = Partial<IHarnessProfile> & {
  brandId: string;
  label: string;
};
