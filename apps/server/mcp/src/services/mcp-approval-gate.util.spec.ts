import { describe, expect, it, vi } from 'vitest';
import {
  isMcpApprovalGated,
  requiresMcpToolApproval,
} from './mcp-approval-gate.util';

function clientWith(isApprovalRequired: boolean) {
  return { isApprovalRequired: vi.fn().mockResolvedValue(isApprovalRequired) };
}

describe('isMcpApprovalGated', () => {
  it('gates credit spenders and declared approvals', () => {
    expect(isMcpApprovalGated('generate')).toBe(true);
    expect(isMcpApprovalGated('create_brand')).toBe(true);
  });

  it('lets text drafts, deterministic repurposing and release drafts through', () => {
    expect(
      isMcpApprovalGated('repurpose_post', { mode: 'deterministic' }),
    ).toBe(false);
    expect(
      isMcpApprovalGated('create_scheduled_release', {
        release: { targets: [{ platform: 'linkedin' }] },
      }),
    ).toBe(false);
    expect(
      isMcpApprovalGated('create_scheduled_release', {
        release: { scheduledDate: '2026-12-01T10:00:00.000Z', targets: [] },
      }),
    ).toBe(true);
  });
});

describe('requiresMcpToolApproval', () => {
  it('queues a credit spender while approval is required', async () => {
    const client = clientWith(true);
    await expect(requiresMcpToolApproval(client, 'generate')).resolves.toBe(
      true,
    );
  });

  it('waives a credit spender once the organization and member both opt out', async () => {
    const client = clientWith(false);
    await expect(requiresMcpToolApproval(client, 'generate')).resolves.toBe(
      false,
    );
    expect(client.isApprovalRequired).toHaveBeenCalledOnce();
  });

  it.each(['create_brand', 'control_scheduled_release', 'publish_article'])(
    'never waives %s and skips the policy lookup',
    async (name) => {
      const client = clientWith(false);
      await expect(requiresMcpToolApproval(client, name)).resolves.toBe(true);
      expect(client.isApprovalRequired).not.toHaveBeenCalled();
    },
  );

  it('does not look up the policy for a call that is not gated', async () => {
    const client = clientWith(false);
    await expect(
      requiresMcpToolApproval(client, 'repurpose_post', {
        mode: 'deterministic',
      }),
    ).resolves.toBe(false);
    expect(client.isApprovalRequired).not.toHaveBeenCalled();
  });
});
