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
    // Only the link carries the id; the message line stays free of it.
    expect(result.content[0].text.split('\n')[0]).not.toContain(
      'approval-fixture',
    );
    expect(result.structuredContent.approvalId).toBe('approval-fixture');
  });
});

describe('pending approval link scope (#9646)', () => {
  const approval = {
    id: 'apr_1',
    status: 'PENDING' as const,
    toolName: 'generate',
  };
  const approvalQuery = 'approval=mcp_approval%3Aapr_1';

  it('opens the approval in the brand it belongs to', () => {
    const result = approvalPendingToolResult({
      ...approval,
      brandSlug: 'itsshaylamonroe',
      organizationSlug: 'genfeedai',
    });
    const link = `https://app.genfeed.ai/genfeedai/itsshaylamonroe/publishing/approvals?${approvalQuery}`;
    expect(result.structuredContent.nextStepUrl).toBe(link);
    expect(result.content[0].text).toContain(`Continue in Genfeed: ${link}`);
  });

  it('opens an organization-level approval under the ~ scope', () => {
    const result = approvalPendingToolResult({
      ...approval,
      brandSlug: null,
      organizationSlug: 'genfeedai',
    });
    expect(result.structuredContent.nextStepUrl).toBe(
      `https://app.genfeed.ai/genfeedai/~/publishing/approvals?${approvalQuery}`,
    );
  });

  it('still links the unscoped queue when the API sent no slugs', () => {
    const result = approvalPendingToolResult(approval);
    expect(result.structuredContent.nextStepUrl).toBe(
      `https://app.genfeed.ai/publishing/approvals?${approvalQuery}`,
    );
  });
});
