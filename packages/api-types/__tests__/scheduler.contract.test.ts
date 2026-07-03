import {
  channelTargetInputSchema,
  createReleaseGroupSchema,
  deriveReleaseStatusFromTargets,
  isTerminalReleaseStatus,
  isTerminalTargetExecutionState,
  LEGACY_POST_SCHEDULE_FIELD_MAP,
  mapLegacyPostStatusToReleaseStatus,
  mapLegacyPostStatusToTargetExecutionState,
  recurrenceInputSchema,
  updateChannelTargetSchema,
} from '@api-types/contracts/scheduler.contract';
import {
  PostFrequency,
  PostStatus,
  ReleaseAttachmentKind,
  ReleaseStatus,
  TargetExecutionState,
  TargetValidationState,
} from '@genfeedai/enums';
import { describe, expect, test } from 'vitest';

const validTarget = {
  credentialId: 'cred_abc123',
  platform: 'twitter',
  scheduledDate: '2026-08-01T09:00:00Z',
  timezone: 'Europe/Amsterdam',
} as const;

describe('createReleaseGroupSchema', () => {
  test('accepts a minimal valid release with one target', () => {
    const result = createReleaseGroupSchema.safeParse({
      baseContent: 'Launch day is here.',
      targets: [validTarget],
      timezone: 'Europe/Amsterdam',
      title: 'Launch',
    });

    expect(result.success).toBe(true);
  });

  test('accepts recurrence, media, and attachments', () => {
    const result = createReleaseGroupSchema.safeParse({
      attachments: [
        { body: 'First comment', kind: ReleaseAttachmentKind.COMMENT },
      ],
      baseContent: 'Evergreen tip.',
      idempotencyKey: 'idem-123',
      media: [{ assetId: 'asset_1', kind: 'image', order: 0 }],
      recurrence: {
        frequency: PostFrequency.WEEKLY,
        interval: 1,
        weekdays: [1, 3, 5],
      },
      status: ReleaseStatus.SCHEDULED,
      targets: [validTarget],
      timezone: 'Europe/Amsterdam',
      title: 'Weekly tips',
    });

    expect(result.success).toBe(true);
  });

  test('rejects a release with no targets', () => {
    const result = createReleaseGroupSchema.safeParse({
      baseContent: 'No channels.',
      targets: [],
      timezone: 'Europe/Amsterdam',
      title: 'Orphan',
    });

    expect(result.success).toBe(false);
  });

  test('rejects an empty title', () => {
    const result = createReleaseGroupSchema.safeParse({
      baseContent: 'Body',
      targets: [validTarget],
      timezone: 'Europe/Amsterdam',
      title: '',
    });

    expect(result.success).toBe(false);
  });
});

describe('channelTargetInputSchema', () => {
  test('preserves IANA timezone strings (never coerced to an offset)', () => {
    const result = channelTargetInputSchema.parse(validTarget);
    expect(result.timezone).toBe('Europe/Amsterdam');
  });

  test('requires a credential id', () => {
    const result = channelTargetInputSchema.safeParse({
      platform: 'twitter',
    });
    expect(result.success).toBe(false);
  });
});

describe('recurrenceInputSchema', () => {
  test('rejects a non-positive interval', () => {
    const result = recurrenceInputSchema.safeParse({
      frequency: PostFrequency.DAILY,
      interval: 0,
    });
    expect(result.success).toBe(false);
  });

  test('rejects weekdays outside 0-6', () => {
    const result = recurrenceInputSchema.safeParse({
      frequency: PostFrequency.WEEKLY,
      interval: 1,
      weekdays: [7],
    });
    expect(result.success).toBe(false);
  });
});

describe('updateChannelTargetSchema (worker state writes)', () => {
  test('accepts an execution-state update with provider ids and error', () => {
    const result = updateChannelTargetSchema.safeParse({
      error: {
        code: 'rate_limited',
        isRetryable: true,
        message: 'Too many requests',
      },
      executionState: TargetExecutionState.FAILED,
      externalProviderId: 'tw_998',
      retryCount: 2,
      validationState: TargetValidationState.VALID,
    });

    expect(result.success).toBe(true);
  });
});

describe('deriveReleaseStatusFromTargets', () => {
  test('no targets -> draft', () => {
    expect(deriveReleaseStatusFromTargets([])).toBe(ReleaseStatus.DRAFT);
  });

  test('all published -> published', () => {
    expect(
      deriveReleaseStatusFromTargets([
        TargetExecutionState.PUBLISHED,
        TargetExecutionState.PUBLISHED,
      ]),
    ).toBe(ReleaseStatus.PUBLISHED);
  });

  test('some published, some failed -> partially-published', () => {
    expect(
      deriveReleaseStatusFromTargets([
        TargetExecutionState.PUBLISHED,
        TargetExecutionState.FAILED,
      ]),
    ).toBe(ReleaseStatus.PARTIALLY_PUBLISHED);
  });

  test('any publishing -> publishing', () => {
    expect(
      deriveReleaseStatusFromTargets([
        TargetExecutionState.PUBLISHING,
        TargetExecutionState.PUBLISHED,
      ]),
    ).toBe(ReleaseStatus.PUBLISHING);
  });

  test('all failed -> failed', () => {
    expect(
      deriveReleaseStatusFromTargets([
        TargetExecutionState.FAILED,
        TargetExecutionState.CANCELLED,
      ]),
    ).toBe(ReleaseStatus.FAILED);
  });

  test('all cancelled -> cancelled', () => {
    expect(
      deriveReleaseStatusFromTargets([
        TargetExecutionState.CANCELLED,
        TargetExecutionState.CANCELLED,
      ]),
    ).toBe(ReleaseStatus.CANCELLED);
  });

  test('still queued -> scheduled', () => {
    expect(
      deriveReleaseStatusFromTargets([
        TargetExecutionState.SCHEDULED,
        TargetExecutionState.SCHEDULED,
      ]),
    ).toBe(ReleaseStatus.SCHEDULED);
  });
});

describe('terminal-state predicates', () => {
  test('release terminal states', () => {
    expect(isTerminalReleaseStatus(ReleaseStatus.PUBLISHED)).toBe(true);
    expect(isTerminalReleaseStatus(ReleaseStatus.PARTIALLY_PUBLISHED)).toBe(
      true,
    );
    expect(isTerminalReleaseStatus(ReleaseStatus.SCHEDULED)).toBe(false);
  });

  test('target terminal states', () => {
    expect(isTerminalTargetExecutionState(TargetExecutionState.SKIPPED)).toBe(
      true,
    );
    expect(isTerminalTargetExecutionState(TargetExecutionState.DRAFT)).toBe(
      false,
    );
  });
});

describe('legacy Post schedule migration', () => {
  test('field map relocates every legacy field under a namespaced path', () => {
    for (const targetPath of Object.values(LEGACY_POST_SCHEDULE_FIELD_MAP)) {
      expect(targetPath).toMatch(/^(release|target|recurrence)\./);
    }
  });

  test('maps every PostStatus to a release status', () => {
    for (const status of Object.values(PostStatus)) {
      expect(
        Object.values(ReleaseStatus).includes(
          mapLegacyPostStatusToReleaseStatus(status),
        ),
      ).toBe(true);
    }
  });

  test('published-visibility variants collapse to published', () => {
    expect(mapLegacyPostStatusToReleaseStatus(PostStatus.PUBLIC)).toBe(
      ReleaseStatus.PUBLISHED,
    );
    expect(mapLegacyPostStatusToReleaseStatus(PostStatus.UNLISTED)).toBe(
      ReleaseStatus.PUBLISHED,
    );
  });

  test('target execution mapping never yields the aggregate-only state', () => {
    for (const status of Object.values(PostStatus)) {
      const state = mapLegacyPostStatusToTargetExecutionState(status);
      expect(Object.values(TargetExecutionState).includes(state)).toBe(true);
    }
  });

  test('unknown status falls back to draft', () => {
    expect(mapLegacyPostStatusToReleaseStatus('bogus')).toBe(
      ReleaseStatus.DRAFT,
    );
    expect(mapLegacyPostStatusToTargetExecutionState('bogus')).toBe(
      TargetExecutionState.DRAFT,
    );
  });
});
