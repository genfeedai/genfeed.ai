import { describe, expect, test } from 'vitest';
import {
  PostFrequency,
  PostStatus,
  PostVisibility,
  ReleaseAttachmentKind,
  ReleaseStatus,
  TargetExecutionState,
  TargetValidationState,
} from '../../src';
import {
  channelTargetInputSchema,
  createReleaseGroupSchema,
  deriveReleaseStatusFromTargets,
  deriveReleaseStatusProjectionFromTargets,
  isTerminalReleaseStatus,
  isTerminalTargetExecutionState,
  mapPostStatusToCanonicalWrite,
  postExecutionStateReadFilter,
  postVisibilityReadFilter,
  projectLegacyPostStatus,
  recurrenceInputSchema,
  resolveDefaultTargetExecutionState,
  resolvePostVisibility,
  updateChannelTargetSchema,
  updateRecurrenceSeriesSchema,
} from '../../src/api-types/contracts/scheduler.contract';

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

  test('accepts a publish campaign id', () => {
    const result = createReleaseGroupSchema.safeParse({
      baseContent: 'Launch day is here.',
      campaignId: 'cmp_spring',
      targets: [validTarget],
      timezone: 'Europe/Amsterdam',
      title: 'Launch',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.campaignId).toBe('cmp_spring');
    }
  });

  test('accepts a posting set provenance id', () => {
    const result = createReleaseGroupSchema.safeParse({
      baseContent: 'Launch day is here.',
      postingSetId: 'set_launch',
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
        maxRepeats: 12,
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
  test('defaults audience visibility independently from lifecycle', () => {
    expect(channelTargetInputSchema.parse(validTarget).visibility).toBe(
      PostVisibility.PUBLIC,
    );
  });

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

  test('accepts an optional per-target caption override', () => {
    const result = channelTargetInputSchema.parse({
      ...validTarget,
      caption: 'X-specific caption',
    });
    expect(result.caption).toBe('X-specific caption');
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

  test('requires a finite max-repeat or end-date boundary', () => {
    const result = recurrenceInputSchema.safeParse({
      frequency: PostFrequency.DAILY,
      interval: 1,
    });
    expect(result.success).toBe(false);
  });

  test('rejects a zero repeat cap', () => {
    const result = recurrenceInputSchema.safeParse({
      frequency: PostFrequency.DAILY,
      interval: 1,
      maxRepeats: 0,
    });
    expect(result.success).toBe(false);
  });

  test('requires at least one unique weekday for weekly recurrence', () => {
    const missingWeekdays = recurrenceInputSchema.safeParse({
      frequency: PostFrequency.WEEKLY,
      interval: 1,
      maxRepeats: 3,
    });
    const duplicateWeekdays = recurrenceInputSchema.safeParse({
      frequency: PostFrequency.WEEKLY,
      interval: 1,
      maxRepeats: 3,
      weekdays: [1, 1],
    });

    expect(missingWeekdays.success).toBe(false);
    expect(duplicateWeekdays.success).toBe(false);
  });

  test('rejects weekdays for non-weekly recurrence', () => {
    const result = recurrenceInputSchema.safeParse({
      frequency: PostFrequency.DAILY,
      interval: 1,
      maxRepeats: 3,
      weekdays: [1],
    });
    expect(result.success).toBe(false);
  });

  test('rejects never as a recurrence frequency', () => {
    const result = recurrenceInputSchema.safeParse({
      frequency: PostFrequency.NEVER,
      interval: 1,
      maxRepeats: 3,
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

describe('updateRecurrenceSeriesSchema', () => {
  test('accepts a future schedule edit without requiring a rule rewrite', () => {
    expect(
      updateRecurrenceSeriesSchema.safeParse({
        scheduledDate: '2026-08-12T09:00:00Z',
      }).success,
    ).toBe(true);
  });

  test('rejects empty edits and unbounded recurrence rules', () => {
    expect(updateRecurrenceSeriesSchema.safeParse({}).success).toBe(false);
    expect(
      updateRecurrenceSeriesSchema.safeParse({
        recurrence: {
          frequency: PostFrequency.DAILY,
          interval: 1,
        },
      }).success,
    ).toBe(false);
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

  test('all draft -> draft', () => {
    expect(
      deriveReleaseStatusFromTargets([
        TargetExecutionState.DRAFT,
        TargetExecutionState.DRAFT,
      ]),
    ).toBe(ReleaseStatus.DRAFT);
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

  test('all paused -> paused', () => {
    expect(
      deriveReleaseStatusFromTargets([
        TargetExecutionState.PAUSED,
        TargetExecutionState.PAUSED,
      ]),
    ).toBe(ReleaseStatus.PAUSED);
  });

  // SKIPPED is terminal + benign (intentionally excluded target). It has no
  // ReleaseStatus counterpart, so it rolls up like CANCELLED. Every skipped
  // combination must land on a terminal status, never fall through to SCHEDULED.
  test('all skipped -> cancelled (terminal, not left as scheduled)', () => {
    expect(
      deriveReleaseStatusFromTargets([
        TargetExecutionState.SKIPPED,
        TargetExecutionState.SKIPPED,
      ]),
    ).toBe(ReleaseStatus.CANCELLED);
  });

  test('skipped + failed (no publish) -> failed', () => {
    expect(
      deriveReleaseStatusFromTargets([
        TargetExecutionState.SKIPPED,
        TargetExecutionState.FAILED,
      ]),
    ).toBe(ReleaseStatus.FAILED);
  });

  test('skipped + published -> partially-published', () => {
    expect(
      deriveReleaseStatusFromTargets([
        TargetExecutionState.SKIPPED,
        TargetExecutionState.PUBLISHED,
      ]),
    ).toBe(ReleaseStatus.PARTIALLY_PUBLISHED);
  });

  test('skipped + cancelled -> cancelled', () => {
    expect(
      deriveReleaseStatusFromTargets([
        TargetExecutionState.SKIPPED,
        TargetExecutionState.CANCELLED,
      ]),
    ).toBe(ReleaseStatus.CANCELLED);
  });

  test('skipped + still-scheduled -> scheduled (one target still pending)', () => {
    expect(
      deriveReleaseStatusFromTargets([
        TargetExecutionState.SKIPPED,
        TargetExecutionState.SCHEDULED,
      ]),
    ).toBe(ReleaseStatus.SCHEDULED);
  });

  test('every ordered pair follows the exhaustive aggregation matrix', () => {
    const states = [
      TargetExecutionState.DRAFT,
      TargetExecutionState.SCHEDULED,
      TargetExecutionState.PAUSED,
      TargetExecutionState.CANCELLED,
      TargetExecutionState.PUBLISHING,
      TargetExecutionState.PUBLISHED,
      TargetExecutionState.FAILED,
      TargetExecutionState.SKIPPED,
    ];
    const matrix: ReleaseStatus[][] = [
      [
        ReleaseStatus.DRAFT,
        ReleaseStatus.SCHEDULED,
        ReleaseStatus.SCHEDULED,
        ReleaseStatus.SCHEDULED,
        ReleaseStatus.PUBLISHING,
        ReleaseStatus.PARTIALLY_PUBLISHED,
        ReleaseStatus.SCHEDULED,
        ReleaseStatus.SCHEDULED,
      ],
      [
        ReleaseStatus.SCHEDULED,
        ReleaseStatus.SCHEDULED,
        ReleaseStatus.SCHEDULED,
        ReleaseStatus.SCHEDULED,
        ReleaseStatus.PUBLISHING,
        ReleaseStatus.PARTIALLY_PUBLISHED,
        ReleaseStatus.SCHEDULED,
        ReleaseStatus.SCHEDULED,
      ],
      [
        ReleaseStatus.SCHEDULED,
        ReleaseStatus.SCHEDULED,
        ReleaseStatus.PAUSED,
        ReleaseStatus.SCHEDULED,
        ReleaseStatus.PUBLISHING,
        ReleaseStatus.PARTIALLY_PUBLISHED,
        ReleaseStatus.SCHEDULED,
        ReleaseStatus.SCHEDULED,
      ],
      [
        ReleaseStatus.SCHEDULED,
        ReleaseStatus.SCHEDULED,
        ReleaseStatus.SCHEDULED,
        ReleaseStatus.CANCELLED,
        ReleaseStatus.PUBLISHING,
        ReleaseStatus.PARTIALLY_PUBLISHED,
        ReleaseStatus.FAILED,
        ReleaseStatus.CANCELLED,
      ],
      Array.from({ length: states.length }, () => ReleaseStatus.PUBLISHING),
      [
        ReleaseStatus.PARTIALLY_PUBLISHED,
        ReleaseStatus.PARTIALLY_PUBLISHED,
        ReleaseStatus.PARTIALLY_PUBLISHED,
        ReleaseStatus.PARTIALLY_PUBLISHED,
        ReleaseStatus.PUBLISHING,
        ReleaseStatus.PUBLISHED,
        ReleaseStatus.PARTIALLY_PUBLISHED,
        ReleaseStatus.PARTIALLY_PUBLISHED,
      ],
      [
        ReleaseStatus.SCHEDULED,
        ReleaseStatus.SCHEDULED,
        ReleaseStatus.SCHEDULED,
        ReleaseStatus.FAILED,
        ReleaseStatus.PUBLISHING,
        ReleaseStatus.PARTIALLY_PUBLISHED,
        ReleaseStatus.FAILED,
        ReleaseStatus.FAILED,
      ],
      [
        ReleaseStatus.SCHEDULED,
        ReleaseStatus.SCHEDULED,
        ReleaseStatus.SCHEDULED,
        ReleaseStatus.CANCELLED,
        ReleaseStatus.PUBLISHING,
        ReleaseStatus.PARTIALLY_PUBLISHED,
        ReleaseStatus.FAILED,
        ReleaseStatus.CANCELLED,
      ],
    ];

    for (const [leftIndex, left] of states.entries()) {
      for (const [rightIndex, right] of states.entries()) {
        expect(
          deriveReleaseStatusFromTargets([left, right]),
          `${left} + ${right}`,
        ).toBe(matrix[leftIndex]?.[rightIndex]);
      }
    }
  });

  test('fails closed with structured diagnostics for malformed target sets', () => {
    expect(
      deriveReleaseStatusProjectionFromTargets([
        TargetExecutionState.PUBLISHED,
        'not-a-target-state',
      ]),
    ).toEqual({
      diagnostics: [
        {
          code: 'invalid-target-state',
          invalidTargetIndexes: [1],
          targetCount: 2,
          validTargetCount: 1,
        },
      ],
      status: ReleaseStatus.FAILED,
    });
  });

  test('reports an empty target set without claiming publication', () => {
    expect(deriveReleaseStatusProjectionFromTargets([])).toEqual({
      diagnostics: [
        {
          code: 'empty-target-set',
          invalidTargetIndexes: [],
          targetCount: 0,
          validTargetCount: 0,
        },
      ],
      status: ReleaseStatus.DRAFT,
    });
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

describe('post status dual-API hard cut', () => {
  test('resolves stored visibility and defaults unknown values to public', () => {
    expect(resolvePostVisibility(PostVisibility.PRIVATE)).toBe(
      PostVisibility.PRIVATE,
    );
    expect(resolvePostVisibility(null)).toBe(PostVisibility.PUBLIC);
    expect(resolvePostVisibility('bogus')).toBe(PostVisibility.PUBLIC);
  });

  test('projects compatibility status without coupling canonical writes', () => {
    expect(
      projectLegacyPostStatus(
        TargetExecutionState.PUBLISHED,
        PostVisibility.PRIVATE,
      ),
    ).toBe(PostStatus.PRIVATE);
    expect(
      projectLegacyPostStatus(
        TargetExecutionState.PUBLISHING,
        PostVisibility.PUBLIC,
      ),
    ).toBe(PostStatus.PROCESSING);
  });

  test('maps projected Post.status onto canonical write fields', () => {
    expect(mapPostStatusToCanonicalWrite(PostStatus.DRAFT)).toEqual({
      targetExecutionState: TargetExecutionState.DRAFT,
    });
    expect(mapPostStatusToCanonicalWrite(PostStatus.SCHEDULED)).toEqual({
      targetExecutionState: TargetExecutionState.SCHEDULED,
    });
    expect(mapPostStatusToCanonicalWrite(PostStatus.PUBLIC)).toEqual({
      targetExecutionState: TargetExecutionState.PUBLISHED,
      visibility: PostVisibility.PUBLIC,
    });
    expect(mapPostStatusToCanonicalWrite(PostStatus.PRIVATE)).toEqual({
      targetExecutionState: TargetExecutionState.PUBLISHED,
      visibility: PostVisibility.PRIVATE,
    });
    expect(mapPostStatusToCanonicalWrite(PostStatus.UNLISTED)).toEqual({
      targetExecutionState: TargetExecutionState.PUBLISHED,
      visibility: PostVisibility.UNLISTED,
    });
    expect(mapPostStatusToCanonicalWrite(PostStatus.PROCESSING)).toEqual({
      targetExecutionState: TargetExecutionState.PUBLISHING,
    });
    expect(mapPostStatusToCanonicalWrite('bogus')).toEqual({});
  });

  test('defaults omitted execution state to draft unless a date is scheduled', () => {
    expect(resolveDefaultTargetExecutionState({})).toBe(
      TargetExecutionState.DRAFT,
    );
    expect(
      resolveDefaultTargetExecutionState({
        scheduledDate: '2026-08-14T10:00:00.000Z',
      }),
    ).toBe(TargetExecutionState.SCHEDULED);
    expect(
      resolveDefaultTargetExecutionState({
        scheduledDate: '2026-08-14T10:00:00.000Z',
        targetExecutionState: TargetExecutionState.DRAFT,
      }),
    ).toBe(TargetExecutionState.DRAFT);
  });

  test('filters execution state without a Post.status dual-read', () => {
    expect(
      postExecutionStateReadFilter(TargetExecutionState.PUBLISHED),
    ).toEqual({
      targetExecutionState: TargetExecutionState.PUBLISHED,
    });
    expect(
      JSON.stringify(
        postExecutionStateReadFilter(TargetExecutionState.PUBLISHED),
      ),
    ).not.toContain('"status"');
  });

  test('filters visibility without a Post.status dual-read', () => {
    expect(postVisibilityReadFilter(PostVisibility.PRIVATE)).toEqual({
      visibility: PostVisibility.PRIVATE,
    });
    expect(
      JSON.stringify(postVisibilityReadFilter(PostVisibility.PRIVATE)),
    ).not.toContain('"status"');
  });
});
