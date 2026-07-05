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
  // OpenAPI-generated tools (#1250): a write (POST) and a read (GET).
  api_things_create: {
    name: 'api_things_create',
    requiredRole: 'user',
    surfaces: { mcp: true },
  },
  api_things_find_all: {
    name: 'api_things_find_all',
    requiredRole: 'user',
    surfaces: { mcp: true },
  },
};

const GENERATED_ROUTES: Record<string, { method: string; isWrite: boolean }> = {
  api_things_create: { method: 'post', isWrite: true },
  api_things_find_all: { method: 'get', isWrite: false },
};

vi.mock('@genfeedai/tools', () => ({
  getToolByName: vi.fn((name: string) => MOCK_TOOLS[name]),
  getToolsForSurface: vi.fn(() => Object.values(MOCK_TOOLS)),
  toMcpTools: vi.fn((tools) => tools),
  isGeneratedApiTool: vi.fn((name: string) => name in GENERATED_ROUTES),
  isGeneratedWriteTool: vi.fn(
    (name: string) => GENERATED_ROUTES[name]?.isWrite === true,
  ),
  getGeneratedRoute: vi.fn((name: string) =>
    name in GENERATED_ROUTES
      ? {
          bodyMode: 'none',
          bodyParams: [],
          isWrite: GENERATED_ROUTES[name].isWrite,
          method: GENERATED_ROUTES[name].method,
          operationId: name,
          path: '/things',
          pathParams: [],
          queryParams: [],
        }
      : undefined,
  ),
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
    executeGeneratedOperation: vi.fn().mockResolvedValue({ things: [] }),
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

  it('approval-gates a generated WRITE tool by verb instead of executing it', async () => {
    // #1250: POST/PATCH/PUT/DELETE generated tools route through the approval
    // gate via isGeneratedWriteTool — no per-tool enumeration.
    const { client, registry } = build();
    client.createApproval.mockResolvedValue({
      id: 'apr-9',
      status: 'PENDING',
      toolName: 'api_things_create',
    });

    const result = (await registry.handleToolCall({
      arguments: { name: 'widget' },
      name: 'api_things_create',
    })) as { isError?: boolean; content: { text: string }[] };

    expect(client.createApproval).toHaveBeenCalledWith('api_things_create', {
      name: 'widget',
    });
    expect(client.executeGeneratedOperation).not.toHaveBeenCalled();
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('requires approval');
  });

  it('executes a generated READ tool directly without an approval', async () => {
    const { client, registry } = build();

    const result = (await registry.handleToolCall({
      arguments: {},
      name: 'api_things_find_all',
    })) as { isError?: boolean; content: { text: string }[] };

    expect(client.createApproval).not.toHaveBeenCalled();
    expect(client.executeGeneratedOperation).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'get', isWrite: false }),
      {},
    );
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('things');
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
