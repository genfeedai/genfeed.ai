/**
 * A week of releases scheduled over MCP with one approval (#10134). The MCP
 * client sends `releases` to `create_scheduled_release`; one approval covers
 * the batch, a person reviews every post on the web, and approving there makes
 * the server schedule the releases itself.
 */

/** Most releases one `create_scheduled_release` batch may carry. */
export const SCHEDULED_RELEASE_BATCH_MAX = 50;

/** Most posts an MCP client card shows in full; a larger batch is reviewed on the web. */
export const SCHEDULED_RELEASE_BATCH_PREVIEW_MAX = 3;

/** Days a pending MCP approval waits before it is closed as expired. */
export const MCP_APPROVAL_EXPIRY_DAYS = 7;

/** Why an expired approval was closed; recorded as its result. */
export const MCP_APPROVAL_EXPIRED_REASON = 'expired';

export interface IScheduledReleaseBatchItemError {
  /** Position of the release in the request's `releases`. */
  index: number;
  message: string;
}

export interface IScheduledReleaseBatchCreatedRelease {
  index: number;
  releaseId: string;
}

export interface IScheduledReleaseBatchResult {
  created: IScheduledReleaseBatchCreatedRelease[];
  errors: IScheduledReleaseBatchItemError[];
}

export interface IScheduledReleaseBatchMedia {
  kind: 'image' | 'video' | 'audio';
  /** Slide order, from 0. */
  order: number;
  url: string | null;
}

export interface IScheduledReleaseBatchPost {
  accountHandle: string | null;
  accountLabel: string | null;
  /** Position in the approval's `releases`; the key for removing a post. */
  index: number;
  media: IScheduledReleaseBatchMedia[];
  platform: string;
  /** The text this channel publishes (the target caption, else the release text). */
  text: string;
  scheduledAt: string | null;
  timezone: string | null;
  title: string;
  /** Set once the post was scheduled. */
  releaseId: string | null;
  /** Set when the post could not be scheduled. */
  error: string | null;
  /** True when a reviewer removed the post before approving. */
  isRemoved: boolean;
}

export type ScheduledReleaseBatchStatus =
  | 'pending'
  | 'scheduling'
  | 'scheduled'
  | 'partially_scheduled'
  | 'declined'
  | 'expired';

/** Everything the web review shows for one batch approval. */
export interface IScheduledReleaseBatchReview {
  approvalId: string;
  brandLabel: string | null;
  expiresAt: string | null;
  posts: IScheduledReleaseBatchPost[];
  requestedAt: string;
  requestedByLabel: string | null;
  status: ScheduledReleaseBatchStatus;
  total: number;
}

/** The tool whose approval can carry a batch. */
export const SCHEDULED_RELEASE_TOOL_NAME = 'create_scheduled_release';

/**
 * The releases of a batch call, or null when the call is not a batch. A batch
 * is `create_scheduled_release` with `releases`; `release` stays one release.
 */
export function readScheduledReleaseBatch(
  toolName: string,
  args: unknown,
): unknown[] | null {
  if (toolName !== SCHEDULED_RELEASE_TOOL_NAME) return null;
  if (typeof args !== 'object' || args === null || Array.isArray(args)) {
    return null;
  }
  const { releases } = args as { releases?: unknown };
  return Array.isArray(releases) ? releases : null;
}

/** What an MCP client is told about a batch waiting for approval. */
export interface IScheduledReleaseBatchPending {
  /** Releases left out because they were invalid, by position in the request. */
  invalid: IScheduledReleaseBatchItemError[];
  /** True when the batch fits the preview, so it can be approved in the chat. */
  isApprovableHere: boolean;
  /** At most {@link SCHEDULED_RELEASE_BATCH_PREVIEW_MAX} posts, each in full. */
  posts: IScheduledReleaseBatchPost[];
  /** Releases queued for approval. */
  total: number;
}
