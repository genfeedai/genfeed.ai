import { ScheduledReleaseBatchApprovalService } from '@api/collections/review-inbox/services/scheduled-release-batch-approval.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { IScheduledReleaseBatchPost } from '@genfeedai/contracts/interfaces';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

const NOW = new Date('2026-11-14T08:00:00.000Z');

function described(count: number): IScheduledReleaseBatchPost[] {
  return Array.from({ length: count }, (_, index) => ({
    accountHandle: 'acme',
    accountLabel: 'Acme',
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

function approval(overrides: Record<string, unknown> = {}) {
  return {
    arguments: { releases: [{}, {}, {}, {}] },
    createdAt: NOW,
    id: 'apr-1',
    organizationId: 'org-1',
    result: null,
    status: 'PENDING',
    toolName: 'create_scheduled_release',
    user: { email: 'v@example.com', firstName: 'Vincent', lastName: 'S' },
    userId: 'user-1',
    ...overrides,
  };
}

function build(row: unknown, brandIds: string[] = ['brand-1']) {
  const claims: string[] = [];
  const attached: unknown[] = [];
  const service = new ScheduledReleaseBatchApprovalService(
    {
      mcpApproval: {
        findFirst: async () => row,
        updateMany: async () => ({ count: 0 }),
      },
    } as never,
    {
      attachResult: async (_id: string, _org: string, result: unknown) => {
        attached.push(result);
      },
      claimExecution: async (id: string) => {
        claims.push(id);
        return claims.length === 1;
      },
    } as never,
    {
      create: async (
        _org: string,
        _user: string,
        _releases: unknown[],
        options: { indexes: number[] },
      ) => ({
        created: options.indexes.map((index) => ({
          index,
          releaseId: `rel-${index}`,
        })),
        errors: [],
      }),
      describe: async () => ({
        brandIds,
        brandLabel: 'Acme',
        posts: described(4),
      }),
    } as never,
  );
  return { attached, claims, service };
}

const apiKeyContext = {} as never;

describe('ScheduledReleaseBatchApprovalService.assertKeepsPosts', () => {
  it('refuses a decision that removes every post', () => {
    const { service } = build(null);

    expect(() =>
      service.assertKeepsPosts(approval() as never, [0, 1, 2, 3]),
    ).toThrow(BadRequestException);
  });

  it('accepts a decision that keeps at least one post, and ignores other tools', () => {
    const { service } = build(null);

    expect(() =>
      service.assertKeepsPosts(approval() as never, [0, 1, 2]),
    ).not.toThrow();
    expect(() =>
      service.assertKeepsPosts(
        approval({ arguments: {}, toolName: 'create_post' }) as never,
        [0],
      ),
    ).not.toThrow();
  });
});

describe('ScheduledReleaseBatchApprovalService.schedule', () => {
  it('schedules the kept posts and records their release ids on the approval', async () => {
    const { attached, service } = build(null);

    const result = await service.schedule(
      approval() as never,
      [1],
      apiKeyContext,
    );

    expect(result?.created).toEqual([
      { index: 0, releaseId: 'rel-0' },
      { index: 2, releaseId: 'rel-2' },
      { index: 3, releaseId: 'rel-3' },
    ]);
    expect(attached).toEqual([
      {
        created: result?.created,
        errors: [],
        excludedIndexes: [1],
        total: 4,
      },
    ]);
  });

  it('schedules once: a second run finds the approval already claimed', async () => {
    const { service } = build(null);

    await service.schedule(approval() as never, [], apiKeyContext);

    expect(
      await service.schedule(approval() as never, [], apiKeyContext),
    ).toBeNull();
  });

  it('is not a batch for another tool', async () => {
    const { service } = build(null);

    expect(
      await service.schedule(
        approval({ arguments: {}, toolName: 'create_post' }) as never,
        [],
        apiKeyContext,
      ),
    ).toBeNull();
  });
});

describe('ScheduledReleaseBatchApprovalService.getReview', () => {
  it('lists every post of a pending batch, with when it expires', async () => {
    const { service } = build(approval());

    const review = await service.getReview('org-1', 'apr-1', undefined);

    expect(review).toMatchObject({
      approvalId: 'apr-1',
      brandLabel: 'Acme',
      expiresAt: '2026-11-21T08:00:00.000Z',
      requestedByLabel: 'Vincent S',
      status: 'pending',
      total: 4,
    });
    expect(review.posts).toHaveLength(4);
  });

  it('shows what a web approval recorded: release ids, removed posts and failures', async () => {
    const { service } = build(
      approval({
        result: {
          created: [{ index: 0, releaseId: 'rel-0' }],
          errors: [
            { index: 3, message: 'The account needs to be reconnected.' },
          ],
          excludedIndexes: [1, 2],
          total: 4,
        },
        status: 'APPROVED',
      }),
    );

    const review = await service.getReview('org-1', 'apr-1', undefined);

    expect(review.status).toBe('partially_scheduled');
    expect(review.expiresAt).toBeNull();
    expect(
      review.posts.map((post) => [post.releaseId, post.isRemoved, post.error]),
    ).toEqual([
      ['rel-0', false, null],
      [null, true, null],
      [null, true, null],
      [null, false, 'The account needs to be reconnected.'],
    ]);
  });

  it('shows what a chat approval recorded the same way', async () => {
    const { service } = build(
      approval({
        result: {
          content: [],
          structuredContent: {
            data: {
              created: [0, 1, 2, 3].map((index) => ({
                index,
                releaseId: `rel-${index}`,
              })),
              errors: [],
            },
          },
        },
        status: 'APPROVED',
      }),
    );

    const review = await service.getReview('org-1', 'apr-1', undefined);

    expect(review.status).toBe('scheduled');
    expect(review.posts.map((post) => post.releaseId)).toEqual([
      'rel-0',
      'rel-1',
      'rel-2',
      'rel-3',
    ]);
  });

  it.each([
    ['declined', { reason: 'rejected' }, 'declined'],
    ['declined', { reason: 'expired' }, 'expired'],
  ])(
    'tells %s from expired by the recorded reason',
    async (_label, result, status) => {
      const { service } = build(approval({ result, status: 'DECLINED' }));

      expect(
        (await service.getReview('org-1', 'apr-1', undefined)).status,
      ).toBe(status);
    },
  );

  it('is scheduling while an approval has no recorded outcome yet', async () => {
    const { service } = build(approval({ status: 'APPROVED' }));

    expect((await service.getReview('org-1', 'apr-1', undefined)).status).toBe(
      'scheduling',
    );
  });

  it('hides a batch from a viewer who cannot see its brand', async () => {
    const { service } = build(approval(), ['brand-2']);

    await expect(
      service.getReview('org-1', 'apr-1', ['brand-1']),
    ).rejects.toThrow(NotFoundException);
  });

  it('is not found for an approval that is not a batch', async () => {
    const { service } = build(
      approval({ arguments: {}, toolName: 'create_post' }),
    );

    await expect(
      service.getReview('org-1', 'apr-1', undefined),
    ).rejects.toThrow(NotFoundException);
  });
});
