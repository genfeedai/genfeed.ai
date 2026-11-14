import {
  expireStaleMcpApprovals,
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
