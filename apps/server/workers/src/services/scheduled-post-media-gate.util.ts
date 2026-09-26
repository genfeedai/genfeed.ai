import type { PostEntity } from '@api/collections/posts/entities/post.entity';
import type { PostDocument } from '@api/collections/posts/post.schema';
import {
  type ChannelValidationMedia,
  toValidationMedia,
} from '@api/collections/posts/services/channel-target-schedule-validation.util';
import {
  formatMediaReadinessBlockers,
  readBlockingDiagnostics,
  readWarningDiagnostics,
} from '@api/services/media-readiness/media-readiness.evaluator';
import type { MediaReadinessReport } from '@genfeedai/contracts/api-types/contracts';
import type { MediaReadinessDiagnostic } from '@genfeedai/contracts/api-types/contracts/media-readiness.contract';
import { planThreadChildDelivery } from '@workers/services/thread-comment-schedule.util';

/**
 * Asset collection and diagnostic triage for the scheduled publish path's
 * media gate (#4878).
 *
 * Extracted from `ScheduledPostDeliveryService` so the delivery service keeps
 * only the decision — fail the channel or dispatch — and this module owns
 * which assets the gate covers and how a report is read.
 */

export type { ChannelValidationMedia };

/** A thread child paired with the scheduling fields the planner reads. */
export type PlannedThreadChild = {
  child: PostDocument;
  id: string;
  order: number;
  threadDelayMinutes?: number | null;
};

export type MediaGateOutcome = {
  blockers: MediaReadinessDiagnostic[];
  /** The failing check's code, for the channel target error. */
  code: string;
  /** Operator-facing reason, empty when nothing blocks. */
  message: string;
  warnings: MediaReadinessDiagnostic[];
};

// `toValidationMedia` moved to the API layer (#5193) so the schedule-time
// choke point and this publish-time re-check share one Post → media mapping.
export { toValidationMedia };

export function toPlannedThreadChildren(
  children: PostDocument[],
): PlannedThreadChild[] {
  return children.map((child) => ({
    child,
    id: child.id.toString(),
    order: (child as unknown as { order?: number }).order ?? 0,
    threadDelayMinutes: (
      child as unknown as { threadDelayMinutes?: number | null }
    ).threadDelayMinutes,
  }));
}

/**
 * The follow-ups that go out with the parent, in the same provider operation.
 * Immediacy is decided by the configured delays alone, so planning against the
 * current time gives the same split `deliverThreadChildren` will make once the
 * parent's publish time is known.
 */
export function readImmediateThreadChildren(post: PostEntity): PostDocument[] {
  const children = (post.children || []) as unknown as PostDocument[];
  if (children.length === 0) {
    return [];
  }
  return planThreadChildDelivery(
    toPlannedThreadChildren(children),
    new Date(),
  ).immediate.map((entry) => entry.child);
}

/**
 * Every asset the upcoming provider operation will carry: the parent's, plus
 * the immediate thread children's. Delayed children are parked and re-gated
 * when their own delivery runs, so including them would let a follow-up
 * scheduled for later block the parent.
 */
export function collectMediaGateAssetIds(post: PostEntity): string[] {
  return Array.from(
    new Set(
      [post, ...readImmediateThreadChildren(post)].flatMap((candidate) =>
        (toValidationMedia(candidate) ?? []).flatMap((item) =>
          item.id ? [item.id] : [],
        ),
      ),
    ),
  );
}

export function readMediaGateOutcome(
  report: MediaReadinessReport,
): MediaGateOutcome {
  const blockers = readBlockingDiagnostics(report);
  return {
    blockers,
    code: blockers[0]?.code ?? 'media_not_ready',
    message: formatMediaReadinessBlockers(blockers),
    warnings: readWarningDiagnostics(report),
  };
}
