import {
  type PublishPipelineApprovalRow,
  summarizePublishPipeline,
  toPublishPipelineItem,
} from '@api/endpoints/admin/publish-pipeline/publish-pipeline.util';

const NOW = new Date('2026-11-01T12:00:00.000Z');

function row(
  overrides: Partial<PublishPipelineApprovalRow> = {},
): PublishPipelineApprovalRow {
  return {
    brandId: 'brand_1',
    createdAt: new Date('2026-10-31T20:00:00.000Z'),
    executedAt: null,
    id: 'approval_1',
    invalidatedAt: null,
    lastError: null,
    organizationId: 'org_1',
    post: {
      platform: 'x',
      scheduledDate: new Date('2026-11-02T09:00:00.000Z'),
      status: 'scheduled',
    },
    postId: 'post_1',
    status: 'approved',
    ...overrides,
  };
}

describe('summarizePublishPipeline', () => {
  it('counts nothing for an empty window', () => {
    expect(summarizePublishPipeline([], NOW)).toEqual({
      byApprovalStatus: {},
      byPostStatus: {},
      invalidated: 0,
      overdue: 0,
      total: 0,
      withError: 0,
    });
  });

  it('groups approvals by their own status and by the status of their post', () => {
    const counts = summarizePublishPipeline(
      [
        row({ id: 'a' }),
        row({ id: 'b' }),
        row({ id: 'c', status: 'queued' }),
        row({
          id: 'd',
          post: { platform: 'x', scheduledDate: null, status: 'public' },
          status: 'executed',
        }),
        row({ id: 'e', post: null }),
      ],
      NOW,
    );

    expect(counts.total).toBe(5);
    expect(counts.byApprovalStatus).toEqual({
      approved: 3,
      executed: 1,
      queued: 1,
    });
    expect(counts.byPostStatus).toEqual({
      missing: 1,
      public: 1,
      scheduled: 3,
    });
  });

  it.each([
    {
      expected: 1,
      name: 'a scheduled post whose date has passed and never executed',
      overrides: {
        post: {
          platform: 'x',
          scheduledDate: new Date('2026-11-01T08:00:00.000Z'),
          status: 'scheduled',
        },
      },
    },
    {
      expected: 0,
      name: 'a scheduled post whose date is still ahead',
      overrides: {},
    },
    {
      expected: 0,
      name: 'a past date that already executed',
      overrides: {
        executedAt: new Date('2026-11-01T08:01:00.000Z'),
        post: {
          platform: 'x',
          scheduledDate: new Date('2026-11-01T08:00:00.000Z'),
          status: 'public',
        },
      },
    },
    {
      expected: 0,
      name: 'a past date on a post that already failed',
      overrides: {
        post: {
          platform: 'x',
          scheduledDate: new Date('2026-11-01T08:00:00.000Z'),
          status: 'failed',
        },
      },
    },
  ])('overdue: $name', ({ expected, overrides }) => {
    expect(summarizePublishPipeline([row(overrides)], NOW).overdue).toBe(
      expected,
    );
  });

  it('counts invalidated approvals and approvals with an error', () => {
    const counts = summarizePublishPipeline(
      [
        row({ id: 'a', invalidatedAt: new Date('2026-11-01T01:00:00.000Z') }),
        row({ id: 'b', lastError: 'Credential expired' }),
        row({ id: 'c' }),
      ],
      NOW,
    );

    expect(counts.invalidated).toBe(1);
    expect(counts.withError).toBe(1);
  });
});

describe('toPublishPipelineItem', () => {
  it('serializes dates as ISO strings and keeps ids and states only', () => {
    expect(toPublishPipelineItem(row({ lastError: 'Rate limited' }))).toEqual({
      approvalCreatedAt: '2026-10-31T20:00:00.000Z',
      approvalId: 'approval_1',
      approvalStatus: 'approved',
      brandId: 'brand_1',
      executedAt: null,
      lastError: 'Rate limited',
      organizationId: 'org_1',
      platform: 'x',
      postId: 'post_1',
      postStatus: 'scheduled',
      scheduledDate: '2026-11-02T09:00:00.000Z',
    });
  });

  it('truncates a long error and tolerates a missing post', () => {
    const item = toPublishPipelineItem(
      row({ lastError: 'x'.repeat(500), post: null }),
    );

    expect(item.lastError).toHaveLength(200);
    expect(item.platform).toBeNull();
    expect(item.postStatus).toBeNull();
    expect(item.scheduledDate).toBeNull();
  });
});
