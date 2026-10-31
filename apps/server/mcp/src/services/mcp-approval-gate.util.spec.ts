import { describe, expect, it, vi } from 'vitest';
import {
  isMcpApprovalGated,
  requiresMcpToolApproval,
} from './mcp-approval-gate.util';

function clientWith(isApprovalRequired: boolean) {
  return { isApprovalRequired: vi.fn().mockResolvedValue(isApprovalRequired) };
}

describe('isMcpApprovalGated', () => {
  it.each(['generate', 'transform_media', 'publish_article', 'send_social_dm'])(
    'gates %s: media generation and posting',
    (name) => {
      expect(isMcpApprovalGated(name)).toBe(true);
    },
  );

  it.each([
    'create_post',
    'create_article_draft',
    'create_brand',
    'create_brand_from_url',
    'fetch_x_posts',
    'enhance_prompt',
    'generate_content',
    'repurpose_post',
    'import_source_post',
  ])('lets %s through: neither media generation nor posting', (name) => {
    expect(isMcpApprovalGated(name)).toBe(false);
  });

  it('lets release drafts through', () => {
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

  it.each(['control_scheduled_release', 'publish_article'])(
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
      requiresMcpToolApproval(client, 'create_brand_from_url'),
    ).resolves.toBe(false);
    expect(client.isApprovalRequired).not.toHaveBeenCalled();
  });
});
