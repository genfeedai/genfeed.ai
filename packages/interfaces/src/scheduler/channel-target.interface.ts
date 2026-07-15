import type {
  CredentialPlatform,
  TargetExecutionState,
  TargetValidationState,
} from '@genfeedai/enums';
import type { IBaseEntity } from '../core/base.interface';
import type { ICredential } from '../organization/credential.interface';
import type { IPublishingProviderReadiness } from '../publisher/publishing-readiness.interface';
import type { IReleaseAttachment } from './release-attachment.interface';
import type { IScheduleStatusTransition } from './status-transition.interface';

/**
 * Provider-specific settings for a channel target (privacy, mentions, link
 * behavior, location, media options, ...). Kept as an open, string-keyed map so
 * the shared contract stays platform-agnostic — the per-platform capability
 * schema (owned by a later issue in #1123) narrows and validates these values.
 * `unknown` (never `any`) forces callers to narrow before use.
 */
export type ChannelTargetSettings = Record<string, unknown>;

/**
 * Structured failure detail for a channel target, surfaced to the calendar and
 * public API so operators can tell retryable provider hiccups from permanent
 * failures without reading raw logs.
 */
export interface IChannelTargetError {
  /** Stable machine code (provider error code or internal classification). */
  code: string;
  /** Human-readable message safe to show in the UI. */
  message: string;
  /** Whether the scheduler may retry this target. */
  isRetryable: boolean;
  /** ISO 8601 timestamp of when the failure was recorded. */
  failedAt?: string | null;
  /** Raw provider payload for debugging; narrow before use. */
  providerDetail?: unknown;
}

/**
 * One channel destination within a release group: a single platform + credential
 * pairing with its own desired time, provider settings, validation result, and
 * execution outcome. This is the unit a worker updates as it publishes.
 */
export interface IChannelTarget extends IBaseEntity {
  /** Release group this target belongs to. */
  releaseId: string;
  platform: CredentialPlatform;
  /** Credential used to publish; relation is hydrated in serialized responses. */
  credentialId: string;
  credential?: ICredential;
  /** Desired publish time (ISO 8601); may override the release-level time. */
  scheduledAt?: string | null;
  /** IANA timezone identifier the `scheduledAt` value is anchored to. */
  timezone: string;
  /** Provider-specific overrides for this target. */
  settings: ChannelTargetSettings;
  validationState: TargetValidationState;
  /** Non-empty when `validationState` is `WARNING` or `INVALID`. */
  validationIssues: string[];
  /**
   * Provider credential/setup readiness surfaced before scheduling. This
   * contains only sanitized diagnostics; raw provider payloads stay out of the
   * public scheduler response.
   */
  readiness?: IPublishingProviderReadiness | null;
  executionState: TargetExecutionState;
  /** Provider's ID for the published item (used for analytics reconciliation). */
  externalProviderId?: string | null;
  /** Provider's short code / permalink slug, when distinct from the ID. */
  externalShortcode?: string | null;
  /** Public URL of the published item, once known. */
  url?: string | null;
  error?: IChannelTargetError | null;
  /** Attempts made so far; drives retry/backoff decisions. */
  retryCount: number;
  /** ISO 8601 timestamp of the most recent publish attempt. */
  lastAttemptAt?: string | null;
  /** ISO 8601 timestamp the target reached `PUBLISHED`. */
  publishedAt?: string | null;
  /** Durable workflow execution backing the latest scheduled run, when present. */
  workflowExecutionId?: string | null;
  /**
   * Idempotency key scoping a single publish attempt for this target, so worker
   * retries never double-post.
   */
  idempotencyKey?: string | null;
  /** Ordering of this target within the release (for UI + deterministic runs). */
  order: number;
  /** Per-target attachments (first comment, thread, signature). */
  attachments?: IReleaseAttachment[];
  /** Audit trail of execution-state changes for this target. */
  statusTransitions?: IScheduleStatusTransition[];
}
