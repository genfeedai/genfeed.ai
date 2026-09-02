import {
  TargetExecutionState,
  TargetValidationState,
} from '@genfeedai/contracts';
import type {
  IChannelTarget,
  IReleaseGroup,
} from '@genfeedai/contracts/interfaces';
import type {
  ReleaseRailOutcomeSummary,
  ReleaseRailTargetTone,
} from '@props/publisher/release-rail.props';

const DEFAULT_VISIBLE_TARGET_CAP = 6;

/**
 * The release's next meaningful instant: the earliest still-upcoming
 * scheduled time across its targets, or — when nothing is scheduled — the
 * latest time a target actually published. Returns `null` when the release
 * has neither.
 */
export function releaseNextInstant(release: IReleaseGroup): string | null {
  const targets = release.targets ?? [];
  const now = Date.now();

  const upcoming = [
    release.scheduledAt,
    ...targets.map((target) => target.scheduledAt),
  ]
    .filter((value): value is string => Boolean(value))
    .filter((value) => Date.parse(value) >= now)
    .sort((left, right) => Date.parse(left) - Date.parse(right));

  if (upcoming.length > 0) {
    return upcoming[0] ?? null;
  }

  const published = [
    release.publishedAt,
    ...targets.map((target) => target.publishedAt),
  ]
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => Date.parse(right) - Date.parse(left));

  return published[0] ?? null;
}

/** Visual tone for one channel target chip, derived from its lifecycle. */
export function targetTone(target: IChannelTarget): ReleaseRailTargetTone {
  if (target.validationState === TargetValidationState.INVALID) {
    return 'destructive';
  }
  if (target.validationState === TargetValidationState.WARNING) {
    return 'warning';
  }

  switch (target.executionState) {
    case TargetExecutionState.PUBLISHED:
      return 'success';
    case TargetExecutionState.FAILED:
      return 'destructive';
    case TargetExecutionState.PUBLISHING:
    case TargetExecutionState.SCHEDULED:
      return 'info';
    case TargetExecutionState.DRAFT:
    case TargetExecutionState.PAUSED:
    case TargetExecutionState.CANCELLED:
    case TargetExecutionState.SKIPPED:
      return 'secondary';
    default:
      return 'secondary';
  }
}

/** Roll-up of published / failed / still-pending targets for a release. */
export function releaseOutcomeSummary(
  release: IReleaseGroup,
): ReleaseRailOutcomeSummary {
  const targets = release.targets ?? [];
  return targets.reduce<ReleaseRailOutcomeSummary>(
    (summary, target) => {
      if (target.executionState === TargetExecutionState.PUBLISHED) {
        return { ...summary, published: summary.published + 1 };
      }
      if (target.executionState === TargetExecutionState.FAILED) {
        return { ...summary, failed: summary.failed + 1 };
      }
      if (
        target.executionState === TargetExecutionState.CANCELLED ||
        target.executionState === TargetExecutionState.SKIPPED
      ) {
        return summary;
      }
      return { ...summary, pending: summary.pending + 1 };
    },
    { failed: 0, pending: 0, published: 0 },
  );
}

/** Split a release's targets into the ones shown inline and the overflow count. */
export function visibleTargets(
  targets: IChannelTarget[] | undefined,
  cap: number = DEFAULT_VISIBLE_TARGET_CAP,
): { overflow: number; visible: IChannelTarget[] } {
  const all = targets ?? [];
  if (all.length <= cap) {
    return { overflow: 0, visible: all };
  }
  return { overflow: all.length - cap, visible: all.slice(0, cap) };
}
