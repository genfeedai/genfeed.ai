import { LoggerService } from '@libs/logger/logger.service';
import { ClientService } from '@mcp/services/client.service';
import { ToolRegistryService } from '@mcp/services/tool-registry.service';

/**
 * Covers the write-action approval queue: mutating tools persist a pending
 * approval instead of executing, and `resolve_approval` declines or executes the
 * deferred action. The auth guard is mocked here (role enforcement is covered in
 * tool-registry.role.integration.spec.ts); these tests focus on the queue flow.
 */
const MOCK_TOOLS: Record<
  string,
  { name: string; requiredRole?: string; surfaces: { mcp: boolean } }
> = {
  create_ad_remix_workflow: {
    name: 'create_ad_remix_workflow',
    surfaces: { mcp: true },
  },
  create_instagram_remix_workflow: {
    name: 'create_instagram_remix_workflow',
    surfaces: { mcp: true },
  },
  create_post: { name: 'create_post', surfaces: { mcp: true } },
  create_scheduled_release: {
    name: 'create_scheduled_release',
    surfaces: { mcp: true },
  },
  get_video_status: {
    name: 'get_video_status',
    requiredRole: 'user',
    surfaces: { mcp: true },
  },
  resolve_approval: {
    name: 'resolve_approval',
    requiredRole: 'admin',
    surfaces: { mcp: true },
  },
};

vi.mock('@genfeedai/tools', () => ({
  getToolByName: vi.fn((name: string) => MOCK_TOOLS[name]),
  getToolsForSurface: vi.fn(() => Object.values(MOCK_TOOLS)),
  toMcpTools: vi.fn((tools) => tools),
}));

vi.mock('@mcp/guards/mcp-auth.guard', () => ({
  McpAuthGuard: { checkToolRole: vi.fn() },
}));

function build() {
  const client = {
    attachApprovalResult: vi
      .fn()
      .mockResolvedValue({ id: 'apr-1', status: 'APPROVED' }),
    createApproval: vi.fn().mockResolvedValue({
      id: 'apr-1',
      status: 'PENDING',
      toolName: 'create_post',
    }),
    executeAgentTool: vi
      .fn()
      .mockResolvedValue({ data: { id: 'post-1' }, success: true }),
    createScheduledRelease: vi
      .fn()
      .mockResolvedValue({ id: 'release-1', status: 'scheduled' }),
    getApproval: vi.fn(),
    // resolveApproval now performs the atomic CLAIM (PENDING -> APPROVED) and
    // returns the claimed approval, so its default resolves with toolName + args.
    resolveApproval: vi.fn().mockResolvedValue({
      arguments: { content: 'hello' },
      id: 'apr-1',
      status: 'APPROVED',
      toolName: 'create_post',
    }),
    getVideoStatus: vi
      .fn()
      .mockResolvedValue({ progress: 100, status: 'completed' }),
  };
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const registry = new ToolRegistryService(
    client as unknown as ClientService,
    logger as unknown as LoggerService,
    'admin',
  );
  return { client, registry };
}

describe('ToolRegistryService — approval queue', () => {
  it('queues a pending approval for a write tool instead of executing it', async () => {
    const { client, registry } = build();

    const result = (await registry.handleToolCall({
      arguments: { content: 'hello' },
      name: 'create_post',
    })) as { isError?: boolean; content: { text: string }[] };

    expect(client.createApproval).toHaveBeenCalledWith('create_post', {
      content: 'hello',
    });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('requires approval');
    expect(result.content[0].text).toContain('apr-1');
  });

  it('queues Instagram remix creation instead of executing it immediately', async () => {
    const { client, registry } = build();

    await registry.handleToolCall({
      arguments: { shortcode: 'abc123', username: 'peer' },
      name: 'create_instagram_remix_workflow',
    });

    expect(client.createApproval).toHaveBeenCalledWith(
      'create_instagram_remix_workflow',
      { shortcode: 'abc123', username: 'peer' },
    );
    expect(client.executeAgentTool).not.toHaveBeenCalled();
  });

  it('queues scheduler mutations instead of calling the scheduler API', async () => {
    const { client, registry } = build();

    await registry.handleToolCall({
      arguments: {
        release: {
          baseContent: 'Hello',
          targets: [{ credentialId: 'credential-1', platform: 'linkedin' }],
          timezone: 'Europe/Malta',
          title: 'Launch',
        },
      },
      name: 'create_scheduled_release',
    });

    expect(client.createApproval).toHaveBeenCalledWith(
      'create_scheduled_release',
      expect.objectContaining({ release: expect.any(Object) }),
    );
    expect(client.createScheduledRelease).not.toHaveBeenCalled();
  });

  it('declines an approval without executing the deferred tool', async () => {
    const { client, registry } = build();

    const result = (await registry.handleToolCall({
      arguments: { approvalId: 'apr-1', decision: 'decline' },
      name: 'resolve_approval',
    })) as { content: { text: string }[] };

    expect(client.resolveApproval).toHaveBeenCalledWith('apr-1', 'decline');
    expect(client.getApproval).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain('declined');
  });

  it('approves an approval: CLAIMS first, executes the deferred tool, then persists the result', async () => {
    const { client, registry } = build();
    client.resolveApproval.mockResolvedValue({
      arguments: { content: 'hello' },
      id: 'apr-1',
      status: 'APPROVED',
      toolName: 'create_post',
    });

    const result = (await registry.handleToolCall({
      arguments: { approvalId: 'apr-1', decision: 'approve' },
      name: 'resolve_approval',
    })) as { content: { text: string }[] };

    // The claim happens BEFORE execution and carries no result yet (the atomic
    // PENDING -> APPROVED fence). getApproval is no longer part of the flow.
    expect(client.resolveApproval).toHaveBeenCalledWith('apr-1', 'approve');
    expect(client.getApproval).not.toHaveBeenCalled();
    // The deferred tool actually ran...
    expect(client.executeAgentTool).toHaveBeenCalledWith('create_post', {
      content: 'hello',
    });
    // ...and the execution result was persisted via the dedicated result path.
    expect(client.attachApprovalResult).toHaveBeenCalledWith(
      'apr-1',
      expect.objectContaining({ content: expect.any(Array) }),
    );
  });

  it('approving a queued gated tool executes it directly without re-queuing another approval', async () => {
    // Regression guard: create_post is BOTH an approval-required tool and an
    // agent-executor tool. Approving its queued action must run it through
    // executeTool (which bypasses the approval gate) — NOT re-enter the gate
    // and queue a second approval, which would be an infinite loop.
    const { client, registry } = build();
    client.resolveApproval.mockResolvedValue({
      arguments: { content: 'hello' },
      id: 'apr-1',
      status: 'APPROVED',
      toolName: 'create_post',
    });

    const result = (await registry.handleToolCall({
      arguments: { approvalId: 'apr-1', decision: 'approve' },
      name: 'resolve_approval',
    })) as { isError?: boolean; content: { text: string }[] };

    expect(client.executeAgentTool).toHaveBeenCalledWith('create_post', {
      content: 'hello',
    });
    // The approval gate was NOT re-applied on execution.
    expect(client.createApproval).not.toHaveBeenCalled();
    expect(result.isError).toBeFalsy();
  });

  it('refuses to approve when the claim loses the race (already resolved)', async () => {
    // The API rejects the concurrent claim (updateMany matched 0 rows), so the
    // client throws and the tool must NOT execute — closing the TOCTOU window.
    const { client, registry } = build();
    client.resolveApproval.mockRejectedValue(
      new Error('Approval already resolved'),
    );

    const result = (await registry.handleToolCall({
      arguments: { approvalId: 'apr-1', decision: 'approve' },
      name: 'resolve_approval',
    })) as { isError?: boolean; content: { text: string }[] };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('already resolved');
    expect(client.executeAgentTool).not.toHaveBeenCalled();
    expect(client.getVideoStatus).not.toHaveBeenCalled();
  });

  it('refuses to execute a non-approval-gated tool referenced by an approval', async () => {
    // Defense-in-depth: a claimed approval whose toolName is not in the
    // approval-required set must not run via the admin resolve path.
    const { client, registry } = build();
    client.resolveApproval.mockResolvedValue({
      arguments: { videoId: 'v1' },
      id: 'apr-1',
      status: 'APPROVED',
      toolName: 'get_video_status',
    });

    const result = (await registry.handleToolCall({
      arguments: { approvalId: 'apr-1', decision: 'approve' },
      name: 'resolve_approval',
    })) as { isError?: boolean; content: { text: string }[] };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('non-approval-gated');
    expect(client.getVideoStatus).not.toHaveBeenCalled();
    expect(client.executeAgentTool).not.toHaveBeenCalled();
    expect(client.attachApprovalResult).toHaveBeenCalledWith(
      'apr-1',
      expect.objectContaining({ error: expect.any(String) }),
    );
  });

  it('records the error on the approval when execution fails after claiming', async () => {
    const { client, registry } = build();
    client.resolveApproval.mockResolvedValue({
      arguments: { content: 'hello' },
      id: 'apr-1',
      status: 'APPROVED',
      toolName: 'create_post',
    });
    client.executeAgentTool.mockRejectedValue(new Error('boom'));

    const result = (await registry.handleToolCall({
      arguments: { approvalId: 'apr-1', decision: 'approve' },
      name: 'resolve_approval',
    })) as { isError?: boolean; content: { text: string }[] };

    expect(result.isError).toBe(true);
    expect(client.attachApprovalResult).toHaveBeenCalledWith(
      'apr-1',
      expect.objectContaining({ error: expect.stringContaining('boom') }),
    );
  });

  it('errors when resolve_approval is missing arguments', async () => {
    const { registry } = build();

    const result = (await registry.handleToolCall({
      arguments: { decision: 'approve' },
      name: 'resolve_approval',
    })) as { isError?: boolean; content: { text: string }[] };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('approvalId and decision');
  });
});
