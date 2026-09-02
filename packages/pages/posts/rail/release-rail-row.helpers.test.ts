import {
  CredentialPlatform,
  PostVisibility,
  ReleaseStatus,
  TargetExecutionState,
  TargetValidationState,
} from '@genfeedai/enums';
import type { IChannelTarget, IReleaseGroup } from '@genfeedai/interfaces';
import { describe, expect, it } from 'vitest';
import {
  releaseNextInstant,
  releaseOutcomeSummary,
  targetTone,
  visibleTargets,
} from './release-rail-row.helpers';

function buildTarget(overrides: Partial<IChannelTarget> = {}): IChannelTarget {
  return {
    createdAt: '2026-01-01T00:00:00.000Z',
    credentialId: 'credential-1',
    executionState: TargetExecutionState.DRAFT,
    id: 'target-1',
    isDeleted: false,
    platform: CredentialPlatform.INSTAGRAM,
    releaseId: 'release-1',
    settings: {},
    timezone: 'UTC',
    updatedAt: '2026-01-01T00:00:00.000Z',
    validationIssues: [],
    validationState: TargetValidationState.VALID,
    visibility: PostVisibility.PUBLIC,
    ...overrides,
  } as IChannelTarget;
}

function buildRelease(overrides: Partial<IReleaseGroup> = {}): IReleaseGroup {
  return {
    analyticsComparison: {
      metricDefinitions: [],
      releaseId: 'release-1',
      state: 'empty',
      targets: [],
    },
    baseContent: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    id: 'release-1',
    isDeleted: false,
    media: [],
    organizationId: 'org-1',
    ownerId: 'user-1',
    status: ReleaseStatus.DRAFT,
    targets: [],
    timezone: 'UTC',
    title: 'Release',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as IReleaseGroup;
}

describe('release-rail-row.helpers', () => {
  describe('releaseNextInstant', () => {
    it('returns the earliest upcoming scheduled time across targets', () => {
      const release = buildRelease({
        scheduledAt: '2099-01-05T00:00:00.000Z',
        targets: [
          buildTarget({ id: 't1', scheduledAt: '2099-01-10T00:00:00.000Z' }),
          buildTarget({ id: 't2', scheduledAt: '2099-01-02T00:00:00.000Z' }),
        ],
      });
      expect(releaseNextInstant(release)).toBe('2099-01-02T00:00:00.000Z');
    });

    it('falls back to the latest published time when nothing is upcoming', () => {
      const release = buildRelease({
        targets: [
          buildTarget({ id: 't1', publishedAt: '2020-01-01T00:00:00.000Z' }),
          buildTarget({ id: 't2', publishedAt: '2020-06-01T00:00:00.000Z' }),
        ],
      });
      expect(releaseNextInstant(release)).toBe('2020-06-01T00:00:00.000Z');
    });

    it('returns null when there is neither a schedule nor a publish time', () => {
      expect(releaseNextInstant(buildRelease())).toBeNull();
    });
  });

  describe('targetTone', () => {
    it('maps published to success', () => {
      expect(
        targetTone(
          buildTarget({ executionState: TargetExecutionState.PUBLISHED }),
        ),
      ).toBe('success');
    });

    it('maps failed to destructive', () => {
      expect(
        targetTone(
          buildTarget({ executionState: TargetExecutionState.FAILED }),
        ),
      ).toBe('destructive');
    });

    it('maps scheduled and publishing to info', () => {
      expect(
        targetTone(
          buildTarget({ executionState: TargetExecutionState.SCHEDULED }),
        ),
      ).toBe('info');
      expect(
        targetTone(
          buildTarget({ executionState: TargetExecutionState.PUBLISHING }),
        ),
      ).toBe('info');
    });

    it('maps draft, paused, cancelled, and skipped to secondary', () => {
      for (const executionState of [
        TargetExecutionState.DRAFT,
        TargetExecutionState.PAUSED,
        TargetExecutionState.CANCELLED,
        TargetExecutionState.SKIPPED,
      ]) {
        expect(targetTone(buildTarget({ executionState }))).toBe('secondary');
      }
    });

    it('lets an invalid or warning validation state override execution state', () => {
      expect(
        targetTone(
          buildTarget({
            executionState: TargetExecutionState.PUBLISHED,
            validationState: TargetValidationState.INVALID,
          }),
        ),
      ).toBe('destructive');
      expect(
        targetTone(
          buildTarget({
            executionState: TargetExecutionState.SCHEDULED,
            validationState: TargetValidationState.WARNING,
          }),
        ),
      ).toBe('warning');
    });
  });

  describe('releaseOutcomeSummary', () => {
    it('counts published, failed, and pending targets', () => {
      const release = buildRelease({
        targets: [
          buildTarget({
            id: 't1',
            executionState: TargetExecutionState.PUBLISHED,
          }),
          buildTarget({
            id: 't2',
            executionState: TargetExecutionState.PUBLISHED,
          }),
          buildTarget({
            id: 't3',
            executionState: TargetExecutionState.FAILED,
          }),
          buildTarget({
            id: 't4',
            executionState: TargetExecutionState.SCHEDULED,
          }),
          buildTarget({
            id: 't5',
            executionState: TargetExecutionState.CANCELLED,
          }),
        ],
      });
      expect(releaseOutcomeSummary(release)).toEqual({
        failed: 1,
        pending: 1,
        published: 2,
      });
    });

    it('returns zeros for a release with no targets', () => {
      expect(releaseOutcomeSummary(buildRelease())).toEqual({
        failed: 0,
        pending: 0,
        published: 0,
      });
    });
  });

  describe('visibleTargets', () => {
    it('returns every target with no overflow under the cap', () => {
      const targets = [buildTarget({ id: 't1' }), buildTarget({ id: 't2' })];
      expect(visibleTargets(targets, 6)).toEqual({
        overflow: 0,
        visible: targets,
      });
    });

    it('caps the visible list and reports the overflow count', () => {
      const targets = Array.from({ length: 8 }, (_unused, index) =>
        buildTarget({ id: `t${index}` }),
      );
      const result = visibleTargets(targets, 6);
      expect(result.visible).toHaveLength(6);
      expect(result.overflow).toBe(2);
    });

    it('treats a missing targets array as empty', () => {
      expect(visibleTargets(undefined)).toEqual({ overflow: 0, visible: [] });
    });
  });
});
