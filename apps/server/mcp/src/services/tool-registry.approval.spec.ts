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
  {
    mutationPolicy?: 'approval-required' | 'direct';
    name: string;
    requiredRole?: string;
    surfaces: { mcp: boolean };
  }
> = {
  create_ad_remix_workflow: {
    mutationPolicy: 'approval-required',
    name: 'create_ad_remix_workflow',
    surfaces: { mcp: true },
  },
  create_instagram_remix_workflow: {
    mutationPolicy: 'approval-required',
    name: 'create_instagram_remix_workflow',
    surfaces: { mcp: true },
  },
  import_source_post: {
    mutationPolicy: 'approval-required',
    name: 'import_source_post',
    surfaces: { mcp: true },
  },
  start_remix_generation: {
    mutationPolicy: 'approval-required',
    name: 'start_remix_generation',
    surfaces: { mcp: true },
  },
  control_remix_generation: {
    mutationPolicy: 'approval-required',
    name: 'control_remix_generation',
    surfaces: { mcp: true },
  },
  create_post: {
    mutationPolicy: 'approval-required',
    name: 'create_post',
    surfaces: { mcp: true },
  },
  create_scheduled_release: {
    mutationPolicy: 'approval-required',
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

vi.mock('@genfeedai/actions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@genfeedai/actions')>();
  return {
    ...actual,
    getToolByName: vi.fn((name: string) => MOCK_TOOLS[name]),
    getToolsForSurface: vi.fn(
      (surface: Parameters<typeof actual.getToolsForSurface>[0]) =>
        surface === 'mcp'
          ? Object.values(MOCK_TOOLS)
          : actual.getToolsForSurface(surface),
    ),
    toMcpTools: vi.fn((tools) => tools),
  };
});

vi.mock('@mcp/guards/mcp-auth.guard', () => ({
  McpAuthGuard: { checkToolRole: vi.fn() },
}));

function build() {
  const client = {
    importSourcePost: vi.fn().mockResolvedValue({ post: { id: 'source-1' } }),
    startRemixGeneration: vi
      .fn()
      .mockResolvedValue({ id: 'run-1', revision: 2 }),
    controlRemixGeneration: vi
      .fn()
      .mockResolvedValue({ id: 'run-1', revision: 2 }),
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
  it.each([
    [
      'import_source_post',
      'importSourcePost',
      { brandId: 'brand-1', url: 'https://x.com/example/status/1' },
    ],
    [
      'start_remix_generation',
      'startRemixGeneration',
      { runId: 'run-1', expectedRevision: 2, quoteId: 'quote-1' },
    ],
    [
      'control_remix_generation',
      'controlRemixGeneration',
      { runId: 'run-1', expectedRevision: 2, action: 'cancel' },
    ],
  ] as const)(
    'requires approval and preserves exact %s arguments during execution',
    async (name, method, args) => {
      const { client, registry } = build();
      await registry.handleToolCall({ name, arguments: args });
      expect(client.createApproval).toHaveBeenCalledWith(name, args);
      expect(client[method]).not.toHaveBeenCalled();
      client.resolveApproval.mockResolvedValue({
        id: 'apr-1',
        status: 'APPROVED',
        toolName: name,
        arguments: args,
      } as never);
      await registry.handleToolCall({
        name: 'resolve_approval',
        arguments: { approvalId: 'apr-1', decision: 'approve' },
      });
      expect(client[method]).toHaveBeenCalledExactlyOnceWith(args);
      expect(client.attachApprovalResult).toHaveBeenCalled();
    },
  );

  it('declining a paid remix quote does not dispatch it', async () => {
    const { client, registry } = build();
    client.resolveApproval.mockResolvedValue({
      id: 'apr-1',
      status: 'DECLINED',
      toolName: 'start_remix_generation',
      arguments: { runId: 'run-1', expectedRevision: 2, quoteId: 'quote-1' },
    } as never);
    await registry.handleToolCall({
      name: 'resolve_approval',
      arguments: { approvalId: 'apr-1', decision: 'decline' },
    });
    expect(client.startRemixGeneration).not.toHaveBeenCalled();
  });

  it('queues a pending approval for a write tool instead of executing it', async () => {
    const { client, registry } = build();

    const result = (await registry.handleToolCall({
      arguments: { content: 'hello' },
      name: 'create_post',
    })) as { isError?: boolean; content: { text: string }[] };

    expect(client.createApproval).toHaveBeenCalledWith('create_post', {
      content: 'hello',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('requires approval');
    expect(result.content[0].text).toContain('apr-1');
    expect(result.content[0].text).toContain('approval_pending');
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

    await registry.handleToolCall({
      arguments: { approvalId: 'apr-1', decision: 'approve' },
      name: 'resolve_approval',
    });

    // The claim happens BEFORE execution and carries no result yet (the atomic
    // PENDING -> APPROVED fence).
    expect(client.resolveApproval).toHaveBeenCalledWith('apr-1', 'approve');
    // The deferred tool actually ran...
    expect(client.executeAgentTool).toHaveBeenCalledWith(
      'create_post',
      { content: 'hello' },
      { approvedApprovalId: 'apr-1' },
    );
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

    expect(client.executeAgentTool).toHaveBeenCalledWith(
      'create_post',
      { content: 'hello' },
      { approvedApprovalId: 'apr-1' },
    );
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

  it('records the error on a direct-dispatch approval when execution fails after claiming', async () => {
    const { client, registry } = build();
    const args = { runId: 'run-1', expectedRevision: 2, action: 'cancel' };
    client.resolveApproval.mockResolvedValue({
      arguments: args,
      id: 'apr-1',
      status: 'APPROVED',
      toolName: 'control_remix_generation',
    });
    client.controlRemixGeneration.mockRejectedValue(new Error('boom'));

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

  describe('approval redemption failures', () => {
    const queued = {
      arguments: { content: 'hello' },
      id: 'apr-1',
      status: 'APPROVED',
      toolName: 'create_post',
    };

    it('does not write a failed redemption onto an agent-executor approval', async () => {
      const { client, registry } = build();
      client.resolveApproval.mockResolvedValue(queued);
      client.executeAgentTool.mockResolvedValue({
        error: 'Approval does not authorize this exact tool invocation',
        success: false,
      });

      const result = (await registry.handleToolCall({
        arguments: { approvalId: 'apr-1', decision: 'approve' },
        name: 'resolve_approval',
      })) as { isError?: boolean };

      expect(result.isError).toBe(true);
      expect(client.attachApprovalResult).not.toHaveBeenCalled();
    });

    it('does not write a thrown agent-executor failure onto the approval', async () => {
      const { client, registry } = build();
      client.resolveApproval.mockResolvedValue(queued);
      client.executeAgentTool.mockRejectedValue(new Error('403 Forbidden'));

      const result = (await registry.handleToolCall({
        arguments: { approvalId: 'apr-1', decision: 'approve' },
        name: 'resolve_approval',
      })) as { isError?: boolean; content: { text: string }[] };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('403 Forbidden');
      expect(client.attachApprovalResult).not.toHaveBeenCalled();
    });

    it('retries an APPROVED approval that has no recorded outcome, executing it once', async () => {
      const { client, registry } = build();
      client.resolveApproval.mockRejectedValue(
        new Error('Approval already resolved'),
      );
      client.getApproval.mockResolvedValue({ ...queued, result: null });
      client.executeAgentTool
        .mockResolvedValueOnce({ error: 'denied', success: false })
        .mockResolvedValueOnce({ data: { id: 'post-1' }, success: true });
      const call = () =>
        registry.handleToolCall({
          arguments: { approvalId: 'apr-1', decision: 'approve' },
          name: 'resolve_approval',
        }) as Promise<{ isError?: boolean }>;

      expect((await call()).isError).toBe(true);
      expect((await call()).isError).toBeFalsy();

      expect(client.executeAgentTool).toHaveBeenCalledTimes(2);
      expect(client.executeAgentTool).toHaveBeenLastCalledWith(
        'create_post',
        { content: 'hello' },
        { approvedApprovalId: 'apr-1' },
      );
    });

    it('never retries a direct-dispatch approval whose claim was lost', async () => {
      const { client, registry } = build();
      client.resolveApproval.mockRejectedValue(
        new Error('Approval already resolved'),
      );
      client.getApproval.mockResolvedValue({
        arguments: { runId: 'run-1', expectedRevision: 2, action: 'cancel' },
        id: 'apr-1',
        result: null,
        status: 'APPROVED',
        toolName: 'control_remix_generation',
      });

      const result = (await registry.handleToolCall({
        arguments: { approvalId: 'apr-1', decision: 'approve' },
        name: 'resolve_approval',
      })) as { isError?: boolean };

      expect(result.isError).toBe(true);
      expect(client.controlRemixGeneration).not.toHaveBeenCalled();
    });

    it('does not re-run an approval whose outcome was already recorded', async () => {
      const { client, registry } = build();
      client.getApproval.mockResolvedValue({
        ...queued,
        result: { success: true },
      });
      client.resolveApproval.mockRejectedValue(
        new Error('Approval already resolved'),
      );

      const result = (await registry.handleToolCall({
        arguments: { approvalId: 'apr-1', decision: 'approve' },
        name: 'resolve_approval',
      })) as { isError?: boolean };

      expect(result.isError).toBe(true);
      expect(client.executeAgentTool).not.toHaveBeenCalled();
    });
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
