import type { ReleaseStatus, TargetExecutionState } from '../..';
import type { IBaseEntity } from '../core/base.interface';
import type { IBrand, IOrganization, IUser } from '../index';
import type {
  IChannelTarget,
  IChannelTargetAnalyticsCollection,
  IChannelTargetAnalyticsSnapshot,
} from './channel-target.interface';
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

/** Metrics that are definitionally comparable across scheduler providers. */
export type SchedulerAnalyticsComparisonMetric =
  | 'views'
  | 'likes'
  | 'comments'
  | 'shares'
  | 'saves'
  | 'engagementRate';

export type IReleaseTargetAnalyticsMetrics = Pick<
  IChannelTargetAnalyticsSnapshot,
  SchedulerAnalyticsComparisonMetric
>;

/**
 * Read-only evidence for one release target. Snapshot identity and collection
 * metadata remain attached to the metrics so recommendations cannot silently
 * combine observations from different collection windows.
 */
export interface IReleaseTargetAnalyticsComparison {
  collection: IChannelTargetAnalyticsCollection;
  metrics: IReleaseTargetAnalyticsMetrics | null;
  platform: IChannelTarget['platform'];
  releaseId: string;
  snapshotIdentity: {
    snapshotDate: string;
    updatedAt: string;
  } | null;
  targetId: string;
}

export type ReleaseAnalyticsComparisonState =
  | 'ready'
  | 'mixed'
  | 'empty'
  | 'stale'
  | 'error';

/**
 * Canonical release-level analytics read model shared by API, app, MCP, and
 * workflow recommendation inputs. No raw provider response is exposed.
 */
export interface IReleaseAnalyticsComparison {
  metricDefinitions: readonly SchedulerAnalyticsComparisonMetric[];
  releaseId: string;
  state: ReleaseAnalyticsComparisonState;
  targets: IReleaseTargetAnalyticsComparison[];
}

/** Agent-side attribution persisted with every post target in a release. */
export interface PostGroupCreateProvenance {
  agentContextSource?: string;
  agentContextVersion?: number;
  workflowExecutionId?: string;
  agentStrategyId?: string;
  agentThreadId?: string;
  autoPublishPolicyId?: string;
  contentRunId?: string;
  postingSetId?: string;
  source?: string;
  sourceActionId?: string;
}

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
  /** Publish content campaign this release belongs to, when planned in one. */
  campaignId?: string | null;
  /** Derived from the complete set of active top-level channel targets. */
  status: ReleaseStatus;
  /** Release-level desired publish time (ISO 8601); targets may override. */
  scheduledAt?: string | null;
  /** ISO 8601 timestamp the release reached a terminal published state. */
  publishedAt?: string | null;
  /** Recurrence rule for evergreen/repeating releases, when applicable. */
  recurrence?: IRecurrenceRule | null;
  /** Posting set that expanded into this release, when created from a saved set. */
  postingSetId?: string | null;
  /** RSS source that produced this release, when created from a feed item. */
  rssSourceId?: string | null;
  rssFeedItemId?: string | null;
  /**
   * Idempotency key for release creation, so a retried create request resolves
   * to the same release instead of a duplicate.
   */
  idempotencyKey?: string | null;
  /** Channel destinations; hydrated in serialized responses. */
  targets?: IChannelTarget[];
  /** Denormalized execution-state roll-up for calendar/list views. */
  targetSummary?: IReleaseTargetSummary;
  /**
   * Stored background color of the first tag on the release's first target
   * post. Null when the release is untagged. Calendar cards use this on the
   * next load after a tag color edit; missing ghosts never receive it.
   */
  firstTagColor?: string | null;
  /** Per-target, snapshot-bound analytics comparison for read-only consumers. */
  analyticsComparison: IReleaseAnalyticsComparison;
  /** Release-scoped attachments (global signature, shared first comment). */
  attachments?: IReleaseAttachment[];
  /** Legacy release-level audit entries; current status remains target-derived. */
  statusTransitions?: IScheduleStatusTransition[];
}
