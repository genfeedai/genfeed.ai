import {
  formatCompactPlatformLabel,
  formatPlatformLabel,
  ReleaseStatus,
  type ReleaseTargetSource,
  TargetExecutionState,
  TargetValidationState,
} from '@genfeedai/enums';
import type { IChannelTarget, IReleaseGroup } from '@genfeedai/interfaces';
import type {
  CalendarEventBadge,
  CalendarEventBadgeTone,
  CalendarEventIndicator,
} from '@props/components/calendar.props';
import type { ReleaseTargetHistoryEntry } from '@props/publisher/release-calendar.props';

/**
 * Badge label per release status. `partially-published` is deliberately shown
 * as "partial": the full value overflows a dense week-grid event cell, and the
 * non-functional requirement in #1129 is that a status is never truncated.
 */
const RELEASE_STATUS_LABELS: Record<ReleaseStatus, string> = {
  [ReleaseStatus.CANCELLED]: 'cancelled',
  [ReleaseStatus.DRAFT]: 'draft',
  [ReleaseStatus.FAILED]: 'failed',
  [ReleaseStatus.PARTIALLY_PUBLISHED]: 'partial',
  [ReleaseStatus.PAUSED]: 'paused',
  [ReleaseStatus.PUBLISHED]: 'published',
  [ReleaseStatus.PUBLISHING]: 'publishing',
  [ReleaseStatus.SCHEDULED]: 'scheduled',
};

const RELEASE_STATUS_TONES: Record<ReleaseStatus, CalendarEventBadgeTone> = {
  [ReleaseStatus.CANCELLED]: 'muted',
  [ReleaseStatus.DRAFT]: 'muted',
  [ReleaseStatus.FAILED]: 'danger',
  [ReleaseStatus.PARTIALLY_PUBLISHED]: 'warning',
  [ReleaseStatus.PAUSED]: 'warning',
  [ReleaseStatus.PUBLISHED]: 'success',
  [ReleaseStatus.PUBLISHING]: 'info',
  [ReleaseStatus.SCHEDULED]: 'info',
};

const TARGET_STATE_TONES: Record<TargetExecutionState, CalendarEventBadgeTone> =
  {
    [TargetExecutionState.CANCELLED]: 'muted',
    [TargetExecutionState.DRAFT]: 'muted',
    [TargetExecutionState.FAILED]: 'danger',
    [TargetExecutionState.PAUSED]: 'warning',
    [TargetExecutionState.PUBLISHED]: 'success',
    [TargetExecutionState.PUBLISHING]: 'info',
    [TargetExecutionState.SCHEDULED]: 'info',
    [TargetExecutionState.SKIPPED]: 'muted',
  };

const VALIDATION_TONES: Record<TargetValidationState, CalendarEventBadgeTone> =
  {
    [TargetValidationState.INVALID]: 'danger',
    [TargetValidationState.PENDING]: 'muted',
    [TargetValidationState.VALID]: 'success',
    [TargetValidationState.WARNING]: 'warning',
  };

/** Tone → `Badge` variant. The badge primitive has no `danger`/`muted` variant. */
const BADGE_VARIANTS: Record<
  CalendarEventBadgeTone,
  'destructive' | 'info' | 'secondary' | 'success' | 'warning'
> = {
  danger: 'destructive',
  info: 'info',
  muted: 'secondary',
  success: 'success',
  warning: 'warning',
};

/**
 * In-flight or abandoned releases stay locked. Published cards are draggable —
 * the host asks card-only vs republish instead of silently rewriting history.
 */
const IMMOVABLE_RELEASE_STATUSES = new Set<ReleaseStatus>([
  ReleaseStatus.CANCELLED,
  ReleaseStatus.PUBLISHING,
]);

const IMMOVABLE_TARGET_STATES = new Set<TargetExecutionState>([
  TargetExecutionState.CANCELLED,
  TargetExecutionState.PUBLISHED,
  TargetExecutionState.PUBLISHING,
]);

const LOCKED_DRAG_TARGET_STATES = new Set<TargetExecutionState>([
  TargetExecutionState.CANCELLED,
  TargetExecutionState.PUBLISHING,
  TargetExecutionState.SKIPPED,
]);

const LIVE_RELEASE_STATUSES = new Set<ReleaseStatus>([
  ReleaseStatus.PARTIALLY_PUBLISHED,
  ReleaseStatus.PUBLISHED,
]);

export function badgeVariantForTone(
  tone: CalendarEventBadgeTone,
): 'destructive' | 'info' | 'secondary' | 'success' | 'warning' {
  return BADGE_VARIANTS[tone];
}

export function releaseStatusBadge(release: IReleaseGroup): CalendarEventBadge {
  const status = release.status;
  return {
    label: RELEASE_STATUS_LABELS[status] ?? status,
    tone: RELEASE_STATUS_TONES[status] ?? 'muted',
  };
}

export function targetStateBadge(
  state: TargetExecutionState,
): CalendarEventBadge {
  return { label: state, tone: TARGET_STATE_TONES[state] ?? 'muted' };
}

export function validationBadge(
  state: TargetValidationState,
): CalendarEventBadge {
  return { label: state, tone: VALIDATION_TONES[state] ?? 'muted' };
}

/**
 * JSON:API to-many sideloads sometimes collapse `targets` to a single object
 * or a string. `for...of` / `.find` on those shapes throw and loop the
 * protected-shell ErrorBoundary on `/publishing/calendar`.
 */
export function releaseTargets(
  release: IReleaseGroup | null | undefined,
): IChannelTarget[] {
  return Array.isArray(release?.targets) ? release.targets : [];
}

/** Earliest instant a release occupies, so a target-only schedule still lands. */
export function releaseScheduledInstant(
  release: IReleaseGroup,
): string | undefined {
  return (
    release.scheduledAt ??
    releaseTargets(release).find((target) => target.scheduledAt)?.scheduledAt ??
    undefined
  );
}

/**
 * In-place reschedule without a republish prompt: draft, scheduled, and paused
 * releases whose targets have not gone live. The drawer still uses this so a
 * published post cannot be rewritten from the datetime picker.
 */
export function isReleaseReschedulable(release: IReleaseGroup): boolean {
  if (IMMOVABLE_RELEASE_STATUSES.has(release.status)) {
    return false;
  }

  if (LIVE_RELEASE_STATUSES.has(release.status)) {
    return false;
  }

  return releaseTargets(release).every((target) =>
    isTargetReschedulable(target),
  );
}

/**
 * Calendar drag eligibility. Published and past-due queued cards are movable;
 * the drop handler asks before persisting. Cancelled and in-flight stays locked.
 */
export function isReleaseDraggable(release: IReleaseGroup): boolean {
  if (IMMOVABLE_RELEASE_STATUSES.has(release.status)) {
    return false;
  }

  const targets = releaseTargets(release);
  if (
    targets.some(
      (target) => target.executionState === TargetExecutionState.PUBLISHING,
    )
  ) {
    return false;
  }

  if (
    targets.length > 0 &&
    targets.every((target) =>
      LOCKED_DRAG_TARGET_STATES.has(target.executionState),
    )
  ) {
    return false;
  }

  return true;
}

export function isTargetReschedulable(target: IChannelTarget): boolean {
  return !IMMOVABLE_TARGET_STATES.has(target.executionState);
}

export function hasLivePublishedTarget(release: IReleaseGroup): boolean {
  if (LIVE_RELEASE_STATUSES.has(release.status)) {
    return true;
  }

  return releaseTargets(release).some(
    (target) => target.executionState === TargetExecutionState.PUBLISHED,
  );
}

/**
 * Dragging these asks card-only vs publish-again: already-live posts, and
 * queued items whose scheduled time has already passed.
 */
export function isReleaseDragConfirmRequired(
  release: IReleaseGroup,
  now: Date = new Date(),
): boolean {
  if (!isReleaseDraggable(release)) {
    return false;
  }

  if (hasLivePublishedTarget(release)) {
    return true;
  }

  if (
    release.status !== ReleaseStatus.SCHEDULED &&
    release.status !== ReleaseStatus.PAUSED
  ) {
    return false;
  }

  const instant = releaseScheduledInstant(release);
  if (!instant) {
    return false;
  }

  const scheduledTime = Date.parse(instant);
  return Number.isFinite(scheduledTime) && scheduledTime <= now.getTime();
}

/**
 * Readiness blocks scheduling only when the provider explicitly says so. An
 * absent readiness record means "not evaluated", which the backend gate treats
 * as permitted — the UI must not invent a block the API would not apply.
 */
export function isTargetBlockedByReadiness(target: IChannelTarget): boolean {
  return target.readiness?.canSchedule === false;
}

export function releaseSources(release: IReleaseGroup): ReleaseTargetSource[] {
  const seen = new Set<ReleaseTargetSource>();
  for (const target of releaseTargets(release)) {
    if (target.source) {
      seen.add(target.source);
    }
  }

  return [...seen];
}

/** Distinct channel platforms represented by one release-group calendar item. */
export function releasePlatformIndicators(
  release: IReleaseGroup,
): CalendarEventIndicator[] {
  const seen = new Set<string>();
  const indicators: CalendarEventIndicator[] = [];

  for (const target of releaseTargets(release)) {
    if (seen.has(target.platform)) {
      continue;
    }

    seen.add(target.platform);
    const label = formatPlatformLabel(target.platform) ?? target.platform;
    indicators.push({
      label,
      shortLabel: formatCompactPlatformLabel(target.platform) ?? label,
    });
  }

  return indicators;
}

function pushEntry(
  entries: ReleaseTargetHistoryEntry[],
  at: string | null | undefined,
  label: string,
  detail?: string,
): void {
  if (!at) {
    return;
  }

  entries.push(detail ? { at, detail, label } : { at, label });
}

/**
 * Execution history for one channel target.
 *
 * Prefers the durable transition log when the API supplies one. It currently
 * does not — only releases and publish approvals persist `statusTransitions` —
 * so the fallback reconstructs the same story from the columns that *are*
 * durable rather than leaving the drawer empty.
 */
export function targetHistory(
  target: IChannelTarget,
): ReleaseTargetHistoryEntry[] {
  const transitions = target.statusTransitions ?? [];
  if (transitions.length > 0) {
    return transitions
      .map((transition) => ({
        at: transition.at,
        ...(transition.reason ? { detail: transition.reason } : {}),
        label: transition.from
          ? `${transition.from} → ${transition.to}`
          : transition.to,
      }))
      .sort((left, right) => left.at.localeCompare(right.at));
  }

  const entries: ReleaseTargetHistoryEntry[] = [];
  pushEntry(entries, target.createdAt, 'Created');
  pushEntry(entries, target.scheduledAt, 'Scheduled');
  pushEntry(
    entries,
    target.lastAttemptAt,
    'Publish attempt',
    target.retryCount > 0 ? `Retry ${target.retryCount}` : undefined,
  );
  pushEntry(entries, target.error?.failedAt, 'Failed', target.error?.message);
  pushEntry(entries, target.publishedAt, 'Published');

  return entries.sort((left, right) => left.at.localeCompare(right.at));
}
