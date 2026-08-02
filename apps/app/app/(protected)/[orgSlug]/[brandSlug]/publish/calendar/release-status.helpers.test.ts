import {
  ReleaseStatus,
  ReleaseTargetSource,
  TargetExecutionState,
  TargetValidationState,
} from '@genfeedai/enums';
import type { IChannelTarget, IReleaseGroup } from '@genfeedai/interfaces';
import { describe, expect, it } from 'vitest';
import {
  badgeVariantForTone,
  isReleaseReschedulable,
  isTargetBlockedByReadiness,
  isTargetReschedulable,
  releaseSources,
  releaseStatusBadge,
  targetHistory,
  targetStateBadge,
  validationBadge,
} from './release-status.helpers';

function target(overrides: Partial<IChannelTarget> = {}): IChannelTarget {
  return {
    executionState: TargetExecutionState.SCHEDULED,
    id: 'target-1',
    retryCount: 0,
    source: ReleaseTargetSource.MANUAL,
    validationIssues: [],
    validationState: TargetValidationState.VALID,
    ...overrides,
  } as IChannelTarget;
}

function release(overrides: Partial<IReleaseGroup> = {}): IReleaseGroup {
  return {
    id: 'release-1',
    status: ReleaseStatus.SCHEDULED,
    targets: [target()],
    ...overrides,
  } as IReleaseGroup;
}

describe('releaseStatusBadge', () => {
  it('shortens partially-published so a dense grid cell never truncates it', () => {
    expect(
      releaseStatusBadge(
        release({ status: ReleaseStatus.PARTIALLY_PUBLISHED }),
      ),
    ).toEqual({ label: 'partial', tone: 'warning' });
  });

  it.each([
    [ReleaseStatus.FAILED, 'danger'],
    [ReleaseStatus.PUBLISHED, 'success'],
    [ReleaseStatus.SCHEDULED, 'info'],
    [ReleaseStatus.DRAFT, 'muted'],
  ] as const)('maps %s to the %s tone', (status, tone) => {
    expect(releaseStatusBadge(release({ status })).tone).toBe(tone);
  });
});

describe('badgeVariantForTone', () => {
  it('never emits a tone the Badge primitive does not implement', () => {
    expect(badgeVariantForTone('danger')).toBe('destructive');
    expect(badgeVariantForTone('muted')).toBe('secondary');
  });
});

describe('targetStateBadge / validationBadge', () => {
  it('flags a failed target and an invalid target as danger', () => {
    expect(targetStateBadge(TargetExecutionState.FAILED).tone).toBe('danger');
    expect(validationBadge(TargetValidationState.INVALID).tone).toBe('danger');
  });

  it('treats a pending validation as neutral rather than a problem', () => {
    expect(validationBadge(TargetValidationState.PENDING).tone).toBe('muted');
  });
});

describe('isReleaseReschedulable', () => {
  it('refuses to move a release that already published', () => {
    expect(
      isReleaseReschedulable(release({ status: ReleaseStatus.PUBLISHED })),
    ).toBe(false);
  });

  it('refuses to move a scheduled release whose target already published', () => {
    expect(
      isReleaseReschedulable(
        release({
          targets: [
            target(),
            target({
              executionState: TargetExecutionState.PUBLISHED,
              id: 'target-2',
            }),
          ],
        }),
      ),
    ).toBe(false);
  });

  it('allows a scheduled release whose targets are all still pending', () => {
    expect(isReleaseReschedulable(release())).toBe(true);
  });
});

describe('isTargetReschedulable', () => {
  it.each([
    TargetExecutionState.CANCELLED,
    TargetExecutionState.PUBLISHED,
    TargetExecutionState.PUBLISHING,
  ])('locks a %s target', (executionState) => {
    expect(isTargetReschedulable(target({ executionState }))).toBe(false);
  });

  it('keeps a failed target movable so a retry can be re-timed', () => {
    expect(
      isTargetReschedulable(
        target({ executionState: TargetExecutionState.FAILED }),
      ),
    ).toBe(true);
  });
});

describe('isTargetBlockedByReadiness', () => {
  it('blocks only on an explicit negative readiness verdict', () => {
    expect(
      isTargetBlockedByReadiness(
        target({
          readiness: {
            canSchedule: false,
          } as IChannelTarget['readiness'],
        }),
      ),
    ).toBe(true);
  });

  it('does not invent a block when readiness was never evaluated', () => {
    expect(isTargetBlockedByReadiness(target())).toBe(false);
    expect(isTargetBlockedByReadiness(target({ readiness: null }))).toBe(false);
  });
});

describe('releaseSources', () => {
  it('collapses duplicate provenance to the distinct set', () => {
    expect(
      releaseSources(
        release({
          targets: [
            target({ source: ReleaseTargetSource.WORKFLOW }),
            target({ id: 'target-2', source: ReleaseTargetSource.WORKFLOW }),
            target({ id: 'target-3', source: ReleaseTargetSource.AGENT }),
          ],
        }),
      ),
    ).toEqual([ReleaseTargetSource.WORKFLOW, ReleaseTargetSource.AGENT]);
  });
});

describe('targetHistory', () => {
  it('prefers the durable transition log when the API supplies one', () => {
    expect(
      targetHistory(
        target({
          createdAt: '2026-07-01T00:00:00.000Z',
          statusTransitions: [
            { at: '2026-07-03T00:00:00.000Z', from: 'scheduled', to: 'failed' },
            { at: '2026-07-02T00:00:00.000Z', from: null, to: 'scheduled' },
          ],
        }),
      ),
    ).toEqual([
      { at: '2026-07-02T00:00:00.000Z', label: 'scheduled' },
      { at: '2026-07-03T00:00:00.000Z', label: 'scheduled → failed' },
    ]);
  });

  it('derives a chronological history from durable columns when no log exists', () => {
    expect(
      targetHistory(
        target({
          createdAt: '2026-07-01T09:00:00.000Z',
          error: {
            code: 'provider_timeout',
            failedAt: '2026-07-01T12:00:01.000Z',
            isRetryable: true,
            message: 'Provider timed out.',
          },
          executionState: TargetExecutionState.FAILED,
          lastAttemptAt: '2026-07-01T12:00:00.000Z',
          retryCount: 2,
          scheduledAt: '2026-07-01T10:00:00.000Z',
        }),
      ),
    ).toEqual([
      { at: '2026-07-01T09:00:00.000Z', label: 'Created' },
      { at: '2026-07-01T10:00:00.000Z', label: 'Scheduled' },
      {
        at: '2026-07-01T12:00:00.000Z',
        detail: 'Retry 2',
        label: 'Publish attempt',
      },
      {
        at: '2026-07-01T12:00:01.000Z',
        detail: 'Provider timed out.',
        label: 'Failed',
      },
    ]);
  });

  it('returns nothing rather than a fabricated entry for a bare target', () => {
    expect(targetHistory(target())).toEqual([]);
  });
});
