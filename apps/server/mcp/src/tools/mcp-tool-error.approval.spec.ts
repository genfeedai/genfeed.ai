import { approvalPendingToolResult } from '@mcp/tools/mcp-tool-error';

describe('pending approval guidance (#6596)', () => {
  const approval = {
    id: 'approval-fixture',
    status: 'PENDING' as const,
    toolName: 'generate',
  };

  it('directs callers without the resolver to the human review queue', () => {
    const result = approvalPendingToolResult(approval);
    expect(result.content[0].text).not.toContain('call `resolve_approval`');
    expect(result.content[0].text).toContain('Review the pending action');
    expect(result.structuredContent.nextStepUrl).toBeTruthy();
  });

  it('offers the resolver only when it is callable on this connection', () => {
    const result = approvalPendingToolResult(approval, undefined, true);
    expect(result.content[0].text).toContain('approve or decline');
    expect(result.structuredContent.canResolveApproval).toBe(true);
    expect(result.content[0].text).not.toContain('approval-fixture');
    expect(result.structuredContent.approvalId).toBe('approval-fixture');
  });
});
