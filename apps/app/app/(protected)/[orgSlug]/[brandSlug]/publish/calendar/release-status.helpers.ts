import {
  ReleaseStatus,
  type ReleaseTargetSource,
  TargetExecutionState,
  TargetValidationState,
} from '@genfeedai/enums';
import type { IChannelTarget, IReleaseGroup } from '@genfeedai/interfaces';
import type {
  CalendarEventBadge,
  CalendarEventBadgeTone,
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
 * Release states that can no longer be moved. Dragging a published or cancelled
 * release would imply a reschedule the backend will reject, so the calendar
 * never offers it.
 */
const IMMOVABLE_RELEASE_STATUSES = new Set<ReleaseStatus>([
  ReleaseStatus.CANCELLED,
  ReleaseStatus.PUBLISHED,
  ReleaseStatus.PUBLISHING,
]);

const IMMOVABLE_TARGET_STATES = new Set<TargetExecutionState>([
  TargetExecutionState.CANCELLED,
  TargetExecutionState.PUBLISHED,
  TargetExecutionState.PUBLISHING,
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
 * A release can be dragged to a new slot only when every one of its targets is
 * still movable. Moving a release whose targets have already gone out would
 * silently rewrite history for the ones that published.
 */
export function isReleaseReschedulable(release: IReleaseGroup): boolean {
  if (IMMOVABLE_RELEASE_STATUSES.has(release.status)) {
    return false;
  }

  return (release.targets ?? []).every((target) =>
    isTargetReschedulable(target),
  );
}

export function isTargetReschedulable(target: IChannelTarget): boolean {
  return !IMMOVABLE_TARGET_STATES.has(target.executionState);
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
  for (const target of release.targets ?? []) {
    if (target.source) {
      seen.add(target.source);
    }
  }

  return [...seen];
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
