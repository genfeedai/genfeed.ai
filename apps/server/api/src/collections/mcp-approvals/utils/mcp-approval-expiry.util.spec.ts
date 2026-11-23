import {
  expireLateSchedulingApprovals,
  expireStaleMcpApprovals,
  latestScheduledTime,
  mcpApprovalExpiryCutoff,
} from '@api/collections/mcp-approvals/utils/mcp-approval-expiry.util';
import { describe, expect, it } from 'vitest';

describe('mcpApprovalExpiryCutoff', () => {
  it('is seven days before now', () => {
    expect(
      mcpApprovalExpiryCutoff(
        new Date('2026-11-14T08:00:00.000Z'),
      ).toISOString(),
    ).toBe('2026-11-07T08:00:00.000Z');
  });
});

describe('expireStaleMcpApprovals', () => {
  it('declines stale pending approvals of the organization with the reason expired', async () => {
    const calls: { data: unknown; where: unknown }[] = [];
    const now = new Date('2026-11-14T08:00:00.000Z');

    const closed = await expireStaleMcpApprovals(
      {
        updateMany: async (args: { data: unknown; where: unknown }) => {
          calls.push(args);
          return { count: 3 };
        },
      } as never,
      'org-1',
      now,
    );

    expect(closed).toBe(3);
    expect(calls).toHaveLength(1);
    expect(calls[0].data).toEqual({
      resolvedAt: now,
      result: { reason: 'expired' },
      status: 'DECLINED',
    });
    expect(calls[0].where).toMatchObject({
      createdAt: { lt: new Date('2026-11-07T08:00:00.000Z') },
      isDeleted: false,
      organizationId: 'org-1',
      status: 'PENDING',
    });
  });
});

describe('latestScheduledTime', () => {
  it('reads the latest time of a release, its targets and a batch', () => {
    expect(
      latestScheduledTime({
        release: {
          scheduledDate: '2026-11-21T13:00:00.000Z',
          targets: [{ scheduledDate: '2026-11-21T15:00:00.000Z' }],
        },
      }),
    ).toBe(Date.parse('2026-11-21T15:00:00.000Z'));
    expect(
      latestScheduledTime({
        releases: [
          { scheduledDate: '2026-11-22T13:00:00.000Z', targets: [] },
          { scheduledDate: '2026-11-23T13:00:00.000Z', targets: [] },
        ],
      }),
    ).toBe(Date.parse('2026-11-23T13:00:00.000Z'));
  });

  it('is null when the request names no time', () => {
    expect(latestScheduledTime({ release: { targets: [{}] } })).toBeNull();
    expect(latestScheduledTime(null)).toBeNull();
  });
});

describe('expireLateSchedulingApprovals', () => {
  const now = new Date('2026-11-21T13:30:00.000Z');
  const tool = 'create_scheduled_release';

  it('closes a scheduling request whose publish times have all passed, and only that one', async () => {
    const closed: { data: unknown; where: unknown }[] = [];
    const ids = await expireLateSchedulingApprovals(
      {
        updateMany: async (args: { data: unknown; where: unknown }) => {
          closed.push(args);
          return { count: 1 };
        },
      } as never,
      'org-1',
      [
        {
          arguments: {
            release: { scheduledDate: '2026-11-21T13:00:00.000Z', targets: [] },
          },
          id: 'late',
          toolName: tool,
        },
        {
          arguments: {
            releases: [
              { scheduledDate: '2026-11-21T13:00:00.000Z', targets: [] },
              { scheduledDate: '2026-11-22T13:00:00.000Z', targets: [] },
            ],
          },
          id: 'one-still-ahead',
          toolName: tool,
        },
        {
          arguments: { release: { targets: [] } },
          id: 'no-time',
          toolName: tool,
        },
        {
          arguments: {
            release: { scheduledDate: '2026-11-21T13:00:00.000Z', targets: [] },
          },
          id: 'other-tool',
          toolName: 'generate',
        },
      ],
      now,
    );

    expect(ids).toEqual(['late']);
    expect(closed).toHaveLength(1);
    expect(closed[0].data).toEqual({
      resolvedAt: now,
      result: { reason: 'expired' },
      status: 'DECLINED',
    });
    expect(closed[0].where).toMatchObject({
      id: { in: ['late'] },
      organizationId: 'org-1',
      status: 'PENDING',
    });
  });

  it('writes nothing when no request is late', async () => {
    const ids = await expireLateSchedulingApprovals(
      {
        updateMany: async () => {
          throw new Error('must not write');
        },
      } as never,
      'org-1',
      [],
      now,
    );
    expect(ids).toEqual([]);
  });
});
