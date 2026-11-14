import type { IScheduledReleaseBatchPost } from '@genfeedai/contracts/interfaces';
import {
  approvalReleases,
  buildBatchPending,
  prepareScheduledBatch,
  recordedBatchOutcome,
} from '@mcp/services/mcp-scheduled-batch.util';
import type { McpApprovalResource } from '@mcp/shared/interfaces/approval.interface';
import { describe, expect, it } from 'vitest';

function previewOf(releases: readonly unknown[]): IScheduledReleaseBatchPost[] {
  return releases.map((_, index) => ({
    accountHandle: 'brand',
    accountLabel: 'Brand',
    error: null,
    index,
    isRemoved: false,
    media: [],
    platform: 'twitter',
    releaseId: null,
    scheduledAt: '2026-11-15T08:00:00.000Z',
    text: `Post ${index}`,
    timezone: 'UTC',
    title: `Post ${index}`,
  }));
}

describe('prepareScheduledBatch', () => {
  const releases = [{ title: 'a' }, { title: 'b' }, { title: 'c' }];

  it('leaves out the releases the API refuses and names them by position', async () => {
    const prepared = await prepareScheduledBatch(
      {
        validateScheduledReleaseBatch: async () => [
          { index: 1, message: 'scheduledDate must be in the future' },
        ],
      },
      { organization: 'acme', releases },
    );

    expect(prepared).toEqual({
      args: { organization: 'acme', releases: [releases[0], releases[2]] },
      invalid: [{ index: 1, message: 'scheduledDate must be in the future' }],
      kind: 'ready',
    });
  });

  it('queues nothing when no release is valid, and says why per release', async () => {
    const prepared = await prepareScheduledBatch(
      {
        validateScheduledReleaseBatch: async () =>
          releases.map((_, index) => ({ index, message: 'no channel' })),
      },
      { releases },
    );

    expect(prepared.kind).toBe('rejected');
    if (prepared.kind !== 'rejected') return;
    expect(prepared.result.isError).toBe(true);
    expect(prepared.result.structuredContent.code).toBe('validation_failed');
    expect(prepared.result.structuredContent.errors).toEqual([
      { field: 'releases[0]', message: 'no channel' },
      { field: 'releases[1]', message: 'no channel' },
      { field: 'releases[2]', message: 'no channel' },
    ]);
  });

  it('refuses a call that carries both release and releases', async () => {
    await expect(
      prepareScheduledBatch(
        { validateScheduledReleaseBatch: async () => [] },
        { release: { title: 'a' }, releases },
      ),
    ).rejects.toThrow('Pass either release or releases, not both');
  });
});

describe('buildBatchPending', () => {
  const client = {
    previewScheduledReleaseBatch: async (r: readonly unknown[]) => previewOf(r),
  };

  it('shows up to three posts and lets the chat approve them', async () => {
    const pending = await buildBatchPending(client, [{}, {}, {}], []);

    expect(pending.isApprovableHere).toBe(true);
    expect(pending.total).toBe(3);
    expect(pending.posts).toHaveLength(3);
  });

  it('previews only the first three of a larger batch and offers no approval in the chat', async () => {
    const pending = await buildBatchPending(
      client,
      Array.from({ length: 42 }, () => ({})),
      [{ index: 9, message: 'bad' }],
    );

    expect(pending.isApprovableHere).toBe(false);
    expect(pending.total).toBe(42);
    expect(pending.posts.map((post) => post.index)).toEqual([0, 1, 2]);
    expect(pending.invalid).toEqual([{ index: 9, message: 'bad' }]);
  });
});

describe('recordedBatchOutcome', () => {
  function approval(
    result: McpApprovalResource['result'],
  ): McpApprovalResource {
    return {
      id: 'a1',
      result,
      status: 'APPROVED',
      toolName: 'create_scheduled_release',
    } as McpApprovalResource;
  }

  it('reports what the web approval scheduled, removed and failed', () => {
    expect(
      recordedBatchOutcome(
        approval({
          created: [
            { index: 0, releaseId: 'r1' },
            { index: 2, releaseId: 'r3' },
          ],
          errors: [{ index: 3, message: 'account disconnected' }],
          excludedIndexes: [1],
          total: 4,
        }),
      ),
    ).toBe(
      'Scheduled 2 of 4 posts, 1 removed by the reviewer, 1 could not be scheduled. Nothing more is scheduled by calling again.',
    );
  });

  it('reads the outcome of a batch approved in the chat as well', () => {
    expect(
      recordedBatchOutcome(
        approval({
          content: [],
          structuredContent: {
            data: {
              created: [{ index: 0, releaseId: 'r1' }],
              errors: [],
            },
          },
        }),
      ),
    ).toBe('Scheduled 1 post. Nothing more is scheduled by calling again.');
  });

  it('is null while no outcome is recorded', () => {
    expect(recordedBatchOutcome(approval(null))).toBeNull();
  });
});

describe('approvalReleases', () => {
  it('reads the releases of a queued batch', () => {
    expect(
      approvalReleases({
        arguments: { releases: [{ title: 'a' }] },
        id: 'a1',
        status: 'PENDING',
        toolName: 'create_scheduled_release',
      } as McpApprovalResource),
    ).toEqual([{ title: 'a' }]);
  });
});
