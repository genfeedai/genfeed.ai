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
    expect(result.content[0].text).toContain('approval queue');
    expect(result.structuredContent.nextStepUrl).toBeTruthy();
  });

  it('offers the resolver only when it is callable on this connection', () => {
    const result = approvalPendingToolResult(approval, undefined, true);
    expect(result.content[0].text).toContain('call `resolve_approval`');
    expect(result.content[0].text).toContain('approval-fixture');
  });
});
