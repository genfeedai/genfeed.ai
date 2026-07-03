import type { ReleaseStatus, TargetExecutionState } from '@genfeedai/enums';
import type { IBaseEntity } from '../core/base.interface';
import type { IBrand, IOrganization, IUser } from '../index';
import type { IChannelTarget } from './channel-target.interface';
import type { IRecurrenceRule } from './recurrence-rule.interface';
import type { IReleaseAttachment } from './release-attachment.interface';
import type { IScheduleStatusTransition } from './status-transition.interface';

/** A media asset referenced by the release's base content. */
export interface IReleaseMediaReference {
  /** Canonical asset id in the media library. */
  assetId: string;
  /** Resolved URL, when hydrated for a response. */
  url?: string | null;
  /** Coarse media kind (image, video, ...); free-form to stay provider-agnostic. */
  kind?: string | null;
  /** Ordering within the release's media set. */
  order?: number;
}

/**
 * Roll-up of channel-target execution states for a release, keyed by
 * {@link TargetExecutionState} value. Lets the calendar and API render status
 * counts (e.g. "3 published, 1 failed") without loading every target.
 */
export type IReleaseTargetSummary = Partial<
  Record<TargetExecutionState, number>
> & {
  /** Total number of channel targets in the release. */
  total: number;
};

/**
 * The canonical scheduler domain object: one composed piece of content and its
 * fan-out across channels. A single serialized `IReleaseGroup` is designed to
 * drive composer review, calendar read models, worker state updates, and public
 * API status responses — the "one typed scheduler response" from #1124.
 *
 * Ownership is the canonical `users.id` via {@link ownerId}; `organizationId`
 * preserves the enterprise multi-tenancy guard where that product boundary
 * applies (single-tenant deployments simply always use the same org).
 */
export interface IReleaseGroup extends IBaseEntity {
  title: string;
  /** Shared base content fanned out to targets (before per-channel overrides). */
  baseContent: string;
  media: IReleaseMediaReference[];
  /** IANA timezone identifier (e.g. `Europe/Amsterdam`) — never a fixed offset. */
  timezone: string;
  /** Canonical `users.id` of the owner. */
  ownerId: string;
  owner?: IUser;
  organizationId: string;
  organization?: IOrganization;
  brandId?: string | null;
  brand?: IBrand;
  status: ReleaseStatus;
  /** Release-level desired publish time (ISO 8601); targets may override. */
  scheduledAt?: string | null;
  /** ISO 8601 timestamp the release reached a terminal published state. */
  publishedAt?: string | null;
  /** Recurrence rule for evergreen/repeating releases, when applicable. */
  recurrence?: IRecurrenceRule | null;
  /**
   * Idempotency key for release creation, so a retried create request resolves
   * to the same release instead of a duplicate.
   */
  idempotencyKey?: string | null;
  /** Channel destinations; hydrated in serialized responses. */
  targets?: IChannelTarget[];
  /** Denormalized execution-state roll-up for calendar/list views. */
  targetSummary?: IReleaseTargetSummary;
  /** Release-scoped attachments (global signature, shared first comment). */
  attachments?: IReleaseAttachment[];
  /** Audit trail of release-level status changes. */
  statusTransitions?: IScheduleStatusTransition[];
}
