import { describe, expect, it, vi } from 'vitest';
import {
  isMcpApprovalGated,
  requiresMcpAgentConfirmation,
  requiresMcpToolApproval,
} from './mcp-approval-gate.util';

function clientWith(isApprovalRequired: boolean) {
  return { isApprovalRequired: vi.fn().mockResolvedValue(isApprovalRequired) };
}

describe('isMcpApprovalGated', () => {
  it.each([
    'generate',
    'transform_media',
    'publish_article',
    'send_social_dm',
    'delete_post',
    'delete_asset',
  ])('gates %s: media generation, posting and deletion', (name) => {
    expect(isMcpApprovalGated(name)).toBe(true);
  });

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

  it.each([
    'control_scheduled_release',
    'publish_article',
    'delete_post',
    'delete_asset',
  ])('never queues %s on the web and skips the policy lookup', async (name) => {
    const client = clientWith(true);
    await expect(requiresMcpToolApproval(client, name)).resolves.toBe(false);
    expect(client.isApprovalRequired).not.toHaveBeenCalled();
  });

  it('never queues a dated release on the web', async () => {
    const client = clientWith(true);
    await expect(
      requiresMcpToolApproval(client, 'create_scheduled_release', {
        release: { scheduledDate: '2026-12-01T10:00:00.000Z', targets: [] },
      }),
    ).resolves.toBe(false);
  });

  it('still queues a direct message while approval is required', async () => {
    await expect(
      requiresMcpToolApproval(clientWith(true), 'send_social_dm'),
    ).resolves.toBe(true);
  });

  it('does not look up the policy for a call that is not gated', async () => {
    const client = clientWith(false);
    await expect(
      requiresMcpToolApproval(client, 'create_brand_from_url'),
    ).resolves.toBe(false);
    expect(client.isApprovalRequired).not.toHaveBeenCalled();
  });
});

describe('requiresMcpAgentConfirmation', () => {
  it('asks for a dated release, an update, publish-now, resume and an article', () => {
    expect(
      requiresMcpAgentConfirmation('create_scheduled_release', {
        release: { scheduledDate: '2026-12-01T10:00:00.000Z', targets: [] },
      }),
    ).toBe(true);
    expect(requiresMcpAgentConfirmation('update_scheduled_release', {})).toBe(
      true,
    );
    expect(
      requiresMcpAgentConfirmation('control_scheduled_release', {
        action: 'publish-now',
      }),
    ).toBe(true);
    expect(
      requiresMcpAgentConfirmation('control_scheduled_release', {
        action: 'resume',
      }),
    ).toBe(true);
    expect(requiresMcpAgentConfirmation('publish_article', {})).toBe(true);
    expect(requiresMcpAgentConfirmation('delete_post', {})).toBe(true);
    expect(requiresMcpAgentConfirmation('delete_asset', {})).toBe(true);
  });

  it('lets drafts, cancel, pause and unrelated tools through', () => {
    expect(
      requiresMcpAgentConfirmation('create_scheduled_release', {
        release: { targets: [{ platform: 'linkedin' }] },
      }),
    ).toBe(false);
    for (const action of ['cancel', 'pause']) {
      expect(
        requiresMcpAgentConfirmation('control_scheduled_release', { action }),
      ).toBe(false);
    }
    expect(requiresMcpAgentConfirmation('generate', {})).toBe(false);
  });
});
