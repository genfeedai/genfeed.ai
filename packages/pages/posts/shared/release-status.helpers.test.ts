import {
  CredentialPlatform,
  ReleaseStatus,
  ReleaseTargetSource,
  TargetExecutionState,
  TargetValidationState,
} from '@genfeedai/contracts';
import type {
  IChannelTarget,
  IReleaseGroup,
} from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';
import {
  badgeVariantForTone,
  hasLivePublishedTarget,
  isReleaseDragConfirmRequired,
  isReleaseDraggable,
  isReleaseReschedulable,
  isTargetBlockedByReadiness,
  isTargetReschedulable,
  releasePlatformIndicators,
  releaseScheduledInstant,
  releaseSources,
  releaseStatusBadge,
  releaseTargets,
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

describe('releaseTargets', () => {
  it('returns the array when the relationship is already a list', () => {
    const scheduled = target();
    expect(releaseTargets(release({ targets: [scheduled] }))).toEqual([
      scheduled,
    ]);
  });

  it('returns an empty list when JSON:API collapses targets to an object or string', () => {
    expect(
      releaseTargets(
        release({
          targets: { id: 'target-1' } as unknown as IChannelTarget[],
        }),
      ),
    ).toEqual([]);
    expect(
      releaseTargets(
        release({
          targets: 'target-1' as unknown as IChannelTarget[],
        }),
      ),
    ).toEqual([]);
    expect(releaseTargets(release({ targets: undefined }))).toEqual([]);
  });
});

describe('isReleaseReschedulable', () => {
  it('refuses an in-place rewrite of a release that already published', () => {
    expect(
      isReleaseReschedulable(release({ status: ReleaseStatus.PUBLISHED })),
    ).toBe(false);
  });

  it('refuses an in-place rewrite when any target already published', () => {
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

  it('does not throw when JSON:API collapses targets to a non-array', () => {
    expect(
      isReleaseReschedulable(
        release({
          targets: { id: 'target-1' } as unknown as IChannelTarget[],
        }),
      ),
    ).toBe(true);
  });
});

describe('isReleaseDraggable', () => {
  it('lets a published card be dragged so the host can ask card-only vs republish', () => {
    expect(
      isReleaseDraggable(
        release({
          status: ReleaseStatus.PUBLISHED,
          targets: [target({ executionState: TargetExecutionState.PUBLISHED })],
        }),
      ),
    ).toBe(true);
  });

  it('still locks cancelled and in-flight releases', () => {
    expect(
      isReleaseDraggable(release({ status: ReleaseStatus.CANCELLED })),
    ).toBe(false);
    expect(
      isReleaseDraggable(release({ status: ReleaseStatus.PUBLISHING })),
    ).toBe(false);
  });
});

describe('isReleaseDragConfirmRequired', () => {
  const now = new Date('2026-03-12T12:00:00.000Z');

  it('does not prompt for a future scheduled or draft drag', () => {
    expect(
      isReleaseDragConfirmRequired(
        release({ scheduledAt: '2026-03-13T10:00:00.000Z' }),
        now,
      ),
    ).toBe(false);
    expect(
      isReleaseDragConfirmRequired(
        release({
          scheduledAt: '2026-03-10T10:00:00.000Z',
          status: ReleaseStatus.DRAFT,
        }),
        now,
      ),
    ).toBe(false);
  });

  it('prompts when the card already published', () => {
    expect(
      isReleaseDragConfirmRequired(
        release({
          scheduledAt: '2026-03-13T10:00:00.000Z',
          status: ReleaseStatus.PUBLISHED,
          targets: [target({ executionState: TargetExecutionState.PUBLISHED })],
        }),
        now,
      ),
    ).toBe(true);
  });

  it('prompts for a queued item whose time has already passed', () => {
    expect(
      isReleaseDragConfirmRequired(
        release({ scheduledAt: '2026-03-12T10:00:00.000Z' }),
        now,
      ),
    ).toBe(true);
  });
});

describe('hasLivePublishedTarget / releaseScheduledInstant', () => {
  it('treats a published sibling target as already live', () => {
    expect(
      hasLivePublishedTarget(
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
    ).toBe(true);
  });

  it('falls back to the first target instant when the release has none', () => {
    expect(
      releaseScheduledInstant(
        release({
          scheduledAt: null,
          targets: [target({ scheduledAt: '2026-03-14T09:00:00.000Z' })],
        }),
      ),
    ).toBe('2026-03-14T09:00:00.000Z');
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

describe('releasePlatformIndicators', () => {
  it('keeps one compact indicator per distinct release target platform', () => {
    expect(
      releasePlatformIndicators(
        release({
          targets: [
            target({ platform: CredentialPlatform.INSTAGRAM }),
            target({
              id: 'target-2',
              platform: CredentialPlatform.LINKEDIN,
            }),
            target({
              id: 'target-3',
              platform: CredentialPlatform.INSTAGRAM,
            }),
          ],
        }),
      ),
    ).toEqual([
      { label: 'Instagram', shortLabel: 'IG' },
      { label: 'LinkedIn', shortLabel: 'LI' },
    ]);
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
