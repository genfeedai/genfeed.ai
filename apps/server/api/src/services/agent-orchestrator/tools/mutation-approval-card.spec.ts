import { buildMutationApprovalCard } from '@api/services/agent-orchestrator/tools/mutation-approval-card';
import { describe, expect, it } from 'vitest';

describe('mutation approval summary', () => {
  const context = { organizationId: 'org-1', userId: 'user-1' };
  it('retains complete consequential nested values while excluding secrets', () => {
    const longCaption = 'Launch caption '.repeat(100);
    const card = buildMutationApprovalCard(
      'apr-1',
      'generate_content_batch',
      {
        count: 5,
        content: longCaption,
        settings: {
          scheduledAt: '2026-09-07T12:00:00Z',
          recipient: 'person@example.com',
          apiToken: 'secret',
        },
        credentialId: 'private-id',
      },
      context,
    );
    const serialized = JSON.stringify(card.data?.items);
    expect(serialized).toContain(longCaption);
    expect(serialized).toContain('person@example.com');
    expect(serialized).toContain('2026-09-07T12:00:00Z');
    expect(serialized).not.toContain('secret');
    expect(serialized).not.toContain('private-id');
    expect(card.ctas?.map((cta) => cta.payload)).toEqual([
      { approvalId: 'apr-1', sourceActionId: 'mutation-approval:apr-1' },
      { approvalId: 'apr-1', sourceActionId: 'mutation-approval:apr-1' },
    ]);
  });
  it('renders empty argument values as readable explicit values', () => {
    const card = buildMutationApprovalCard(
      'apr-1',
      'create_post',
      { content: '', targets: [], settings: {}, option: undefined },
      context,
    );
    expect(card.data?.items).toEqual([
      { label: 'Content', value: 'None' },
      { label: 'Targets', value: 'None' },
      { label: 'Settings', value: 'None' },
      { label: 'Option', value: 'None' },
    ]);
  });
});
