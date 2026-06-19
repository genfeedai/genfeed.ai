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
  create_post: { name: 'create_post', surfaces: { mcp: true } },
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
    createApproval: vi.fn().mockResolvedValue({
      id: 'apr-1',
      status: 'PENDING',
      toolName: 'create_post',
    }),
    executeAgentTool: vi
      .fn()
      .mockResolvedValue({ data: { id: 'post-1' }, success: true }),
    getApproval: vi.fn(),
    resolveApproval: vi
      .fn()
      .mockResolvedValue({ id: 'apr-1', status: 'APPROVED' }),
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

  it('approves an approval: executes the deferred tool and persists the result', async () => {
    const { client, registry } = build();
    client.getApproval.mockResolvedValue({
      arguments: { videoId: 'v1' },
      id: 'apr-1',
      status: 'PENDING',
      toolName: 'get_video_status',
    });

    const result = (await registry.handleToolCall({
      arguments: { approvalId: 'apr-1', decision: 'approve' },
      name: 'resolve_approval',
    })) as { content: { text: string }[] };

    // The deferred tool actually ran...
    expect(client.getVideoStatus).toHaveBeenCalledWith('v1');
    expect(result.content[0].text).toContain('completed');
    // ...and the execution result was persisted back on the approval.
    expect(client.resolveApproval).toHaveBeenCalledWith(
      'apr-1',
      'approve',
      expect.objectContaining({ content: expect.any(Array) }),
    );
  });

  it('approving a queued gated tool executes it directly without re-queuing another approval', async () => {
    // Regression guard: create_post is BOTH an approval-required tool and an
    // agent-executor tool. Approving its queued action must run it through
    // executeTool (which bypasses the approval gate) — NOT re-enter the gate
    // and queue a second approval, which would be an infinite loop.
    const { client, registry } = build();
    client.getApproval.mockResolvedValue({
      arguments: { content: 'hello' },
      id: 'apr-1',
      status: 'PENDING',
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
    expect(client.resolveApproval).toHaveBeenCalledWith(
      'apr-1',
      'approve',
      expect.anything(),
    );
  });

  it('refuses to approve an already-resolved approval', async () => {
    const { client, registry } = build();
    client.getApproval.mockResolvedValue({
      id: 'apr-1',
      status: 'APPROVED',
      toolName: 'get_video_status',
    });

    const result = (await registry.handleToolCall({
      arguments: { approvalId: 'apr-1', decision: 'approve' },
      name: 'resolve_approval',
    })) as { isError?: boolean; content: { text: string }[] };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('already approved');
    expect(client.getVideoStatus).not.toHaveBeenCalled();
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
