import {
  PostStatus,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';
import {
  classifyPostVisibilityBackfill,
  parsePostVisibilityBackfillArgs,
} from './backfill-post-visibility';

function row(
  overrides: Partial<Parameters<typeof classifyPostVisibilityBackfill>[0]> = {},
) {
  return {
    id: 'post-1',
    status: PostStatus.SCHEDULED,
    targetExecutionState: TargetExecutionState.DRAFT,
    visibility: null,
    ...overrides,
  };
}

describe('post visibility backfill', () => {
  it.each([
    [PostStatus.DRAFT, TargetExecutionState.DRAFT, PostVisibility.PUBLIC],
    [
      PostStatus.SCHEDULED,
      TargetExecutionState.SCHEDULED,
      PostVisibility.PUBLIC,
    ],
    [
      PostStatus.PENDING,
      TargetExecutionState.PUBLISHING,
      PostVisibility.PUBLIC,
    ],
    [
      PostStatus.PROCESSING,
      TargetExecutionState.PUBLISHING,
      PostVisibility.PUBLIC,
    ],
    [PostStatus.FAILED, TargetExecutionState.FAILED, PostVisibility.PUBLIC],
    [PostStatus.PUBLIC, TargetExecutionState.PUBLISHED, PostVisibility.PUBLIC],
    [
      PostStatus.PRIVATE,
      TargetExecutionState.PUBLISHED,
      PostVisibility.PRIVATE,
    ],
    [
      PostStatus.UNLISTED,
      TargetExecutionState.PUBLISHED,
      PostVisibility.UNLISTED,
    ],
  ])(
    'classifies legacy %s into independent lifecycle and visibility',
    (status, lifecycle, visibility) => {
      expect(classifyPostVisibilityBackfill(row({ status }))).toMatchObject({
        lifecycle,
        visibility,
      });
    },
  );

  it('preserves an already-canonical lifecycle and visibility', () => {
    expect(
      classifyPostVisibilityBackfill(
        row({
          status: PostStatus.SCHEDULED,
          targetExecutionState: TargetExecutionState.PAUSED,
          visibility: PostVisibility.PRIVATE,
        }),
      ),
    ).toMatchObject({
      lifecycle: TargetExecutionState.PAUSED,
      lifecycleChanged: false,
      visibility: PostVisibility.PRIVATE,
      visibilityChanged: false,
    });
  });

  it('does not let stale legacy status overwrite a classified draft', () => {
    expect(
      classifyPostVisibilityBackfill(
        row({
          status: PostStatus.SCHEDULED,
          targetExecutionState: TargetExecutionState.DRAFT,
          visibility: PostVisibility.PRIVATE,
        }),
      ),
    ).toMatchObject({
      lifecycle: TargetExecutionState.DRAFT,
      lifecycleChanged: false,
      visibility: PostVisibility.PRIVATE,
      visibilityChanged: false,
    });
  });

  it('fails an unknown legacy value closed to draft and public', () => {
    expect(
      classifyPostVisibilityBackfill(
        row({ status: 'mystery', targetExecutionState: 'mystery' }),
      ),
    ).toMatchObject({
      lifecycle: TargetExecutionState.DRAFT,
      unknownLegacyStatus: true,
      visibility: PostVisibility.PUBLIC,
    });
  });

  it('defaults to dry-run and accepts a bounded batch override', () => {
    expect(parsePostVisibilityBackfillArgs([])).toEqual({
      batchSize: 200,
      dryRun: true,
    });
    expect(parsePostVisibilityBackfillArgs(['--batch=25', '--live'])).toEqual({
      batchSize: 25,
      dryRun: false,
    });
  });
});
