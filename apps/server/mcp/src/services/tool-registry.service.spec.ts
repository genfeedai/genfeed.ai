import { LoggerService } from '@libs/logger/logger.service';
import { McpAuthGuard } from '@mcp/guards/mcp-auth.guard';
import { ClientService } from '@mcp/services/client.service';
import { ToolRegistryService } from '@mcp/services/tool-registry.service';
import { Test, TestingModule } from '@nestjs/testing';

const MOCK_TOOLS = [
  { name: 'generate_video', requiredRole: undefined, surfaces: { mcp: true } },
  {
    name: 'cancel_agent_run',
    requiredRole: undefined,
    surfaces: { mcp: true },
  },
  {
    name: 'get_agent_run',
    requiredRole: undefined,
    surfaces: { mcp: true },
  },
  {
    name: 'get_agent_run_content',
    requiredRole: undefined,
    surfaces: { mcp: true },
  },
  {
    name: 'get_video_status',
    requiredRole: undefined,
    surfaces: { mcp: true },
  },
  {
    name: 'list_agent_runs',
    requiredRole: undefined,
    surfaces: { mcp: true },
  },
  {
    name: 'retry_agent_run',
    requiredRole: undefined,
    surfaces: { mcp: true },
  },
  { name: 'list_videos', requiredRole: undefined, surfaces: { mcp: true } },
  { name: 'list_images', requiredRole: undefined, surfaces: { mcp: true } },
  {
    name: 'get_credits_balance',
    requiredRole: undefined,
    surfaces: { mcp: true },
  },
  { name: 'get_trends', requiredRole: undefined, surfaces: { mcp: true } },
  { name: 'create_post', requiredRole: undefined, surfaces: { mcp: true } },
  { name: 'list_posts', requiredRole: undefined, surfaces: { mcp: true } },
  { name: 'create_article', requiredRole: undefined, surfaces: { mcp: true } },
  { name: 'create_workflow', requiredRole: undefined, surfaces: { mcp: true } },
  {
    name: 'execute_workflow',
    requiredRole: undefined,
    surfaces: { mcp: true },
  },
  { name: 'list_workflows', requiredRole: undefined, surfaces: { mcp: true } },
  {
    name: 'inspect_workflow',
    requiredRole: undefined,
    surfaces: { mcp: true },
  },
  {
    name: 'duplicate_workflow',
    requiredRole: undefined,
    surfaces: { mcp: true },
  },
  {
    name: 'set_workflow_schedule',
    requiredRole: undefined,
    surfaces: { mcp: true },
  },
  {
    name: 'list_workflow_runs',
    requiredRole: undefined,
    surfaces: { mcp: true },
  },
  {
    name: 'get_workflow_run',
    requiredRole: undefined,
    surfaces: { mcp: true },
  },
  // Mocked as admin-gated for the role-gate test below (its production tier is
  // user). It stands in for a role-gated tool that still dispatches to a live
  // executor — the darkroom admin tools it previously stood in for were dropped
  // from the OSS MCP surface in PR 5/6.
  {
    name: 'get_workflow_status',
    requiredRole: 'admin',
    surfaces: { mcp: true },
  },
  {
    name: 'get_content_analytics',
    requiredRole: undefined,
    surfaces: { mcp: true },
  },
  {
    name: 'get_google_ads_keyword_performance',
    // Matches production (source.ts) — this tool is user-tier, not admin.
    requiredRole: 'user',
    surfaces: { mcp: true },
  },
  {
    name: 'list_social_conversations',
    requiredRole: 'user',
    surfaces: { mcp: true },
  },
  {
    name: 'get_social_conversation',
    requiredRole: 'user',
    surfaces: { mcp: true },
  },
  {
    name: 'create_social_reply_draft',
    requiredRole: 'user',
    surfaces: { mcp: true },
  },
  {
    name: 'approve_social_draft',
    requiredRole: 'user',
    surfaces: { mcp: true },
  },
  {
    name: 'reject_social_draft',
    requiredRole: 'user',
    surfaces: { mcp: true },
  },
  {
    name: 'post_social_reply',
    requiredRole: 'user',
    surfaces: { mcp: true },
  },
  {
    name: 'send_social_dm',
    requiredRole: 'user',
    surfaces: { mcp: true },
  },
  {
    name: 'tag_social_conversation',
    requiredRole: 'user',
    surfaces: { mcp: true },
  },
  {
    name: 'assign_social_conversation',
    requiredRole: 'user',
    surfaces: { mcp: true },
  },
  {
    name: 'mark_social_conversation_resolved',
    requiredRole: 'user',
    surfaces: { mcp: true },
  },
];

const TOOLS_BY_NAME = new Map(MOCK_TOOLS.map((t) => [t.name, t]));

vi.mock('@genfeedai/tools', () => ({
  GENERATED_MCP_OPERATIONS: [],
  getToolByName: vi.fn((name: string) => TOOLS_BY_NAME.get(name)),
  getToolsForSurface: vi.fn(() => MOCK_TOOLS),
  toMcpTools: vi.fn((tools) => tools),
}));

vi.mock('@mcp/guards/mcp-auth.guard', () => ({
  McpAuthGuard: {
    checkToolRole: vi.fn(),
  },
}));

describe('ToolRegistryService', () => {
  let service: ToolRegistryService;
  let clientService: {
    cancelAgentRun: ReturnType<typeof vi.fn>;
    executeAgentTool: ReturnType<typeof vi.fn>;
    getAgentRun: ReturnType<typeof vi.fn>;
    getAgentRunContent: ReturnType<typeof vi.fn>;
    getVideoStatus: ReturnType<typeof vi.fn>;
    listVideos: ReturnType<typeof vi.fn>;
    listAgentRuns: ReturnType<typeof vi.fn>;
    getVideoAnalytics: ReturnType<typeof vi.fn>;
    listImages: ReturnType<typeof vi.fn>;
    createArticle: ReturnType<typeof vi.fn>;
    createApproval: ReturnType<typeof vi.fn>;
    approveSocialDraft: ReturnType<typeof vi.fn>;
    assignSocialConversation: ReturnType<typeof vi.fn>;
    createSocialReplyDraft: ReturnType<typeof vi.fn>;
    getWorkflowStatus: ReturnType<typeof vi.fn>;
    getSocialConversation: ReturnType<typeof vi.fn>;
    inspectWorkflow: ReturnType<typeof vi.fn>;
    duplicateWorkflow: ReturnType<typeof vi.fn>;
    setWorkflowSchedule: ReturnType<typeof vi.fn>;
    listWorkflowRuns: ReturnType<typeof vi.fn>;
    getWorkflowRun: ReturnType<typeof vi.fn>;
    getOrganizationAnalytics: ReturnType<typeof vi.fn>;
    listSocialConversations: ReturnType<typeof vi.fn>;
    markSocialConversationResolved: ReturnType<typeof vi.fn>;
    postSocialReply: ReturnType<typeof vi.fn>;
    rejectSocialDraft: ReturnType<typeof vi.fn>;
    retryAgentRun: ReturnType<typeof vi.fn>;
    sendSocialDm: ReturnType<typeof vi.fn>;
    setBearerToken: ReturnType<typeof vi.fn>;
    updateSocialTags: ReturnType<typeof vi.fn>;
  };
  let logger: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ToolRegistryService,
        {
          provide: ClientService,
          useValue: {
            cancelAgentRun: vi.fn().mockResolvedValue({
              id: 'run-1',
              status: 'CANCELLED',
            }),
            approveSocialDraft: vi
              .fn()
              .mockResolvedValue({ id: 'msg-approved', status: 'sent' }),
            assignSocialConversation: vi
              .fn()
              .mockResolvedValue({ assignedOwnerId: 'user-2', id: 'conv-1' }),
            createApproval: vi.fn().mockImplementation((toolName: string) =>
              Promise.resolve({
                id: 'apr-1',
                status: 'PENDING',
                toolName,
              }),
            ),
            createArticle: vi.fn().mockResolvedValue({
              id: 'art-1',
              status: 'draft',
              title: 'AI News',
              wordCount: 500,
            }),
            createSocialReplyDraft: vi
              .fn()
              .mockResolvedValue({ id: 'msg-draft', status: 'draft' }),
            executeAgentTool: vi.fn().mockImplementation((name: string) =>
              Promise.resolve({
                creditsUsed: 1,
                data: { name, result: 'ok' },
                success: true,
              }),
            ),
            getOrganizationAnalytics: vi
              .fn()
              .mockResolvedValue({ totalViews: 9999 }),
            getSocialConversation: vi.fn().mockResolvedValue({
              conversation: { id: 'conv-1', status: 'open' },
              messages: [{ id: 'msg-1', status: 'received' }],
            }),
            getAgentRun: vi.fn().mockResolvedValue({
              id: 'run-1',
              label: 'Agent run',
              status: 'RUNNING',
            }),
            getAgentRunContent: vi.fn().mockResolvedValue({
              posts: [{ id: 'post-1' }],
            }),
            getVideoAnalytics: vi.fn().mockResolvedValue({ views: 1000 }),
            getVideoStatus: vi
              .fn()
              .mockResolvedValue({ progress: 100, status: 'completed' }),
            getWorkflowStatus: vi.fn().mockResolvedValue({
              currentStepIndex: 0,
              id: 'wf-1',
              name: 'My Flow',
              status: 'active',
              steps: [],
            }),
            inspectWorkflow: vi.fn().mockResolvedValue({
              id: 'wf-1',
              name: 'System Flow',
              nodeCount: 2,
              status: 'draft',
            }),
            duplicateWorkflow: vi.fn().mockResolvedValue({
              id: 'wf-copy-1',
              name: 'System Flow (Copy)',
              status: 'draft',
            }),
            setWorkflowSchedule: vi.fn().mockResolvedValue({
              enabled: true,
              id: 'wf-copy-1',
              schedule: '0 9 * * *',
              timezone: 'UTC',
            }),
            listWorkflowRuns: vi
              .fn()
              .mockResolvedValue([{ id: 'run-1', status: 'completed' }]),
            getWorkflowRun: vi.fn().mockResolvedValue({
              id: 'run-1',
              progress: 100,
              status: 'completed',
            }),
            listImages: vi.fn().mockResolvedValue([]),
            listAgentRuns: vi
              .fn()
              .mockResolvedValue([{ id: 'run-1', status: 'RUNNING' }]),
            listSocialConversations: vi.fn().mockResolvedValue({
              conversations: [{ id: 'conv-1', status: 'open' }],
              meta: { page: 1 },
            }),
            listVideos: vi
              .fn()
              .mockResolvedValue([{ id: 'vid-1', title: 'Test' }]),
            markSocialConversationResolved: vi
              .fn()
              .mockResolvedValue({ id: 'conv-1', status: 'resolved' }),
            postSocialReply: vi
              .fn()
              .mockResolvedValue({ id: 'msg-reply', status: 'sent' }),
            rejectSocialDraft: vi
              .fn()
              .mockResolvedValue({ id: 'msg-draft', status: 'rejected' }),
            retryAgentRun: vi.fn().mockResolvedValue({
              runId: 'run-2',
              threadId: 'thread-1',
            }),
            sendSocialDm: vi
              .fn()
              .mockResolvedValue({ id: 'msg-dm', status: 'sent' }),
            setBearerToken: vi.fn(),
            updateSocialTags: vi
              .fn()
              .mockResolvedValue({ id: 'conv-1', tags: ['lead'] }),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(ToolRegistryService);
    clientService = module.get(ClientService);
    logger = module.get(LoggerService);
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  it('getTools returns the MCP tool list', () => {
    const tools = service.getTools();
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThan(0);
  });

  it('getResources returns two analytics resources', () => {
    const resources = service.getResources();
    expect(resources).toHaveLength(2);
    expect(resources[0].uri).toBe('genfeed://analytics/videos');
    expect(resources[1].uri).toBe('genfeed://analytics/organization');
  });

  it('handleToolCall generate_video proxies through executeAgentTool', async () => {
    const result = await service.handleToolCall({
      arguments: { description: 'AI surfing', title: 'Epic Reel' },
      name: 'generate_video',
    });

    expect(clientService.executeAgentTool).toHaveBeenCalledWith(
      'generate_video',
      { description: 'AI surfing', title: 'Epic Reel' },
    );
    expect(
      (result as { content: { text: string }[] }).content[0].text,
    ).toContain('generate_video');
  });

  it('handleToolCall get_video_status returns status info via legacy handler', async () => {
    const result = await service.handleToolCall({
      arguments: { videoId: 'vid-1' },
      name: 'get_video_status',
    });

    expect(clientService.getVideoStatus).toHaveBeenCalledWith('vid-1');
    expect(
      (result as { content: { text: string }[] }).content[0].text,
    ).toContain('completed');
  });

  it('handleToolCall get_video_status throws when videoId missing', async () => {
    const result = await service.handleToolCall({
      arguments: {},
      name: 'get_video_status',
    });

    expect((result as { isError: boolean }).isError).toBe(true);
    expect(
      (result as { content: { text: string }[] }).content[0].text,
    ).toContain('videoId required');
  });

  it('handleToolCall list_videos returns video list via legacy handler', async () => {
    const result = await service.handleToolCall({
      arguments: { limit: 5 },
      name: 'list_videos',
    });

    expect(clientService.listVideos).toHaveBeenCalledWith(5, 0);
    expect(
      (result as { content: { text: string }[] }).content[0].text,
    ).toContain('vid-1');
  });

  it('handleToolCall list_agent_runs returns bounded agent runs', async () => {
    const result = await service.handleToolCall({
      arguments: { active: true, limit: 5 },
      name: 'list_agent_runs',
    });

    expect(clientService.listAgentRuns).toHaveBeenCalledWith({
      active: true,
      cursor: undefined,
      historyOnly: undefined,
      limit: 5,
      q: undefined,
      status: undefined,
    });
    expect(
      (result as { content: { text: string }[] }).content[0].text,
    ).toContain('run-1');
  });

  it('handleToolCall get_agent_run inspects one run', async () => {
    const result = await service.handleToolCall({
      arguments: { runId: 'run-1' },
      name: 'get_agent_run',
    });

    expect(clientService.getAgentRun).toHaveBeenCalledWith('run-1');
    expect(
      (result as { content: { text: string }[] }).content[0].text,
    ).toContain('Agent run');
  });

  it('handleToolCall get_agent_run_content returns produced content', async () => {
    const result = await service.handleToolCall({
      arguments: { runId: 'run-1' },
      name: 'get_agent_run_content',
    });

    expect(clientService.getAgentRunContent).toHaveBeenCalledWith('run-1');
    expect(
      (result as { content: { text: string }[] }).content[0].text,
    ).toContain('post-1');
  });

  it('handleToolCall cancel_agent_run cancels through the API client', async () => {
    const result = await service.handleToolCall({
      arguments: { runId: 'run-1' },
      name: 'cancel_agent_run',
    });

    expect(clientService.cancelAgentRun).toHaveBeenCalledWith('run-1');
    expect(
      (result as { content: { text: string }[] }).content[0].text,
    ).toContain('CANCELLED');
  });

  it('handleToolCall retry_agent_run continues the persisted thread', async () => {
    const result = await service.handleToolCall({
      arguments: { message: 'Try again with less scope', runId: 'run-1' },
      name: 'retry_agent_run',
    });

    expect(clientService.retryAgentRun).toHaveBeenCalledWith(
      'run-1',
      'Try again with less scope',
    );
    expect(
      (result as { content: { text: string }[] }).content[0].text,
    ).toContain('run-2');
  });

  it('handleToolCall inspect_workflow uses bounded workflow client inspect', async () => {
    const result = await service.handleToolCall({
      arguments: { workflowId: 'wf-1' },
      name: 'inspect_workflow',
    });

    expect(clientService.inspectWorkflow).toHaveBeenCalledWith('wf-1');
    expect(
      (result as { content: { text: string }[] }).content[0].text,
    ).toContain('System Flow');
  });

  it('handleToolCall duplicate_workflow duplicates without deleting or mutating the source', async () => {
    const result = await service.handleToolCall({
      arguments: { workflowId: 'wf-1' },
      name: 'duplicate_workflow',
    });

    expect(clientService.duplicateWorkflow).toHaveBeenCalledWith('wf-1');
    expect(
      (result as { content: { text: string }[] }).content[0].text,
    ).toContain('wf-copy-1');
  });

  it('handleToolCall set_workflow_schedule forwards schedule enablement', async () => {
    const result = await service.handleToolCall({
      arguments: {
        enabled: true,
        schedule: '0 9 * * *',
        timezone: 'UTC',
        workflowId: 'wf-copy-1',
      },
      name: 'set_workflow_schedule',
    });

    expect(clientService.setWorkflowSchedule).toHaveBeenCalledWith(
      'wf-copy-1',
      {
        enabled: true,
        schedule: '0 9 * * *',
        timezone: 'UTC',
      },
    );
    expect(
      (result as { content: { text: string }[] }).content[0].text,
    ).toContain('0 9 * * *');
  });

  it('handleToolCall list_workflow_runs returns workflow run history', async () => {
    const result = await service.handleToolCall({
      arguments: { limit: 5, workflowId: 'wf-1' },
      name: 'list_workflow_runs',
    });

    expect(clientService.listWorkflowRuns).toHaveBeenCalledWith({
      limit: 5,
      offset: undefined,
      status: undefined,
      trigger: undefined,
      workflowId: 'wf-1',
    });
    expect(
      (result as { content: { text: string }[] }).content[0].text,
    ).toContain('run-1');
  });

  it('handleToolCall get_workflow_run inspects one workflow run', async () => {
    const result = await service.handleToolCall({
      arguments: { runId: 'run-1' },
      name: 'get_workflow_run',
    });

    expect(clientService.getWorkflowRun).toHaveBeenCalledWith('run-1');
    expect(
      (result as { content: { text: string }[] }).content[0].text,
    ).toContain('completed');
  });

  it('handleToolCall list_social_conversations forwards bounded filters', async () => {
    const result = await service.handleToolCall({
      arguments: {
        limit: 5,
        needsReview: true,
        platform: 'youtube',
        status: 'open',
      },
      name: 'list_social_conversations',
    });

    expect(clientService.listSocialConversations).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 5,
        needsReview: true,
        platform: 'youtube',
        status: 'open',
      }),
    );
    expect(
      (result as { content: { text: string }[] }).content[0].text,
    ).toContain('conv-1');
  });

  it('handleToolCall get_social_conversation includes recent messages by default', async () => {
    const result = await service.handleToolCall({
      arguments: { conversationId: 'conv-1', limit: 10 },
      name: 'get_social_conversation',
    });

    expect(clientService.getSocialConversation).toHaveBeenCalledWith('conv-1', {
      includeMessages: true,
      limit: 10,
    });
    expect(
      (result as { content: { text: string }[] }).content[0].text,
    ).toContain('msg-1');
  });

  it('handleToolCall create_social_reply_draft records provenance without external send approval', async () => {
    const result = await service.handleToolCall({
      arguments: {
        agentRunId: 'agent-run-1',
        conversationId: 'conv-1',
        text: 'Thanks for the comment',
        workflowRunId: 'workflow-run-1',
      },
      name: 'create_social_reply_draft',
    });

    expect(clientService.createSocialReplyDraft).toHaveBeenCalledWith(
      'conv-1',
      {
        agentRunId: 'agent-run-1',
        idempotencyKey: undefined,
        messageType: undefined,
        recipientId: undefined,
        text: 'Thanks for the comment',
        workflowRunId: 'workflow-run-1',
      },
    );
    expect(clientService.createApproval).not.toHaveBeenCalled();
    expect(
      (result as { content: { text: string }[] }).content[0].text,
    ).toContain('msg-draft');
  });

  it('handleToolCall reject_social_draft updates review state without external send approval', async () => {
    const result = await service.handleToolCall({
      arguments: {
        conversationId: 'conv-1',
        messageId: 'msg-draft',
        reason: 'Needs a softer tone',
      },
      name: 'reject_social_draft',
    });

    expect(clientService.rejectSocialDraft).toHaveBeenCalledWith(
      'conv-1',
      'msg-draft',
      'Needs a softer tone',
    );
    expect(clientService.createApproval).not.toHaveBeenCalled();
    expect(
      (result as { content: { text: string }[] }).content[0].text,
    ).toContain('rejected');
  });

  it('handleToolCall post_social_reply queues approval before external publishing', async () => {
    const result = await service.handleToolCall({
      arguments: {
        conversationId: 'conv-1',
        text: 'Posting publicly',
        workflowRunId: 'workflow-run-1',
      },
      name: 'post_social_reply',
    });

    expect(clientService.createApproval).toHaveBeenCalledWith(
      'post_social_reply',
      {
        conversationId: 'conv-1',
        text: 'Posting publicly',
        workflowRunId: 'workflow-run-1',
      },
    );
    expect(clientService.postSocialReply).not.toHaveBeenCalled();
    expect(
      (result as { content: { text: string }[] }).content[0].text,
    ).toContain('requires approval');
  });

  it('handleToolCall send_social_dm queues approval before external messaging', async () => {
    await service.handleToolCall({
      arguments: {
        conversationId: 'conv-1',
        recipientId: 'viewer-1',
        text: 'Private follow-up',
      },
      name: 'send_social_dm',
    });

    expect(clientService.createApproval).toHaveBeenCalledWith(
      'send_social_dm',
      {
        conversationId: 'conv-1',
        recipientId: 'viewer-1',
        text: 'Private follow-up',
      },
    );
    expect(clientService.sendSocialDm).not.toHaveBeenCalled();
  });

  describe('role gating', () => {
    // NOTE: actual deny/allow enforcement is covered by
    // tool-registry.role.integration.spec.ts using the REAL checkToolRole.
    // Here checkToolRole is mocked, so we only assert the gate is *invoked*
    // for role-gated tools and *skipped* for ungated ones.
    it('invokes the role gate with the request role for a role-gated tool', async () => {
      const adminScoped = new ToolRegistryService(
        clientService as unknown as ClientService,
        logger as unknown as LoggerService,
        'admin',
      );

      await adminScoped.handleToolCall({
        arguments: { workflowId: 'wf-1' },
        name: 'get_workflow_status',
      });

      expect(McpAuthGuard.checkToolRole).toHaveBeenCalledWith('admin', 'admin');
    });

    it('does not gate tools without a requiredRole', async () => {
      await service.handleToolCall({
        arguments: { description: 'x', title: 'y' },
        name: 'generate_video',
      });

      expect(McpAuthGuard.checkToolRole).not.toHaveBeenCalled();
    });
  });

  it('handleToolCall get_credits_balance proxies through executeAgentTool', async () => {
    const result = await service.handleToolCall({
      arguments: {},
      name: 'get_credits_balance',
    });

    expect(clientService.executeAgentTool).toHaveBeenCalledWith(
      'get_credits_balance',
      {},
    );
    expect(
      (result as { content: { text: string }[] }).content[0].text,
    ).toContain('get_credits_balance');
  });

  it('handleToolCall throws for unknown tool and returns error', async () => {
    const result = await service.handleToolCall({
      arguments: {},
      name: 'does_not_exist',
    });

    expect((result as { isError: boolean }).isError).toBe(true);
  });

  it('handleToolCall create_article queues a pending approval instead of executing', async () => {
    // create_article is an approval-gated mutation: it must persist a pending
    // approval (human-in-the-loop) rather than run immediately. Execution-time
    // arg validation (e.g. "topic required") only happens once approved.
    const result = await service.handleToolCall({
      arguments: { topic: 'AI News' },
      name: 'create_article',
    });

    expect(clientService.createApproval).toHaveBeenCalledWith(
      'create_article',
      {
        topic: 'AI News',
      },
    );
    expect(clientService.createArticle).not.toHaveBeenCalled();
    expect(
      (result as { content: { text: string }[] }).content[0].text,
    ).toContain('requires approval');
  });

  it('handleResourceRead returns video analytics for analytics URI', async () => {
    const result = await service.handleResourceRead({
      uri: 'genfeed://analytics/videos',
    });

    expect(clientService.getVideoAnalytics).toHaveBeenCalled();
    expect((result as { contents: { uri: string }[] }).contents[0].uri).toBe(
      'genfeed://analytics/videos',
    );
  });

  it('handleResourceRead returns org analytics', async () => {
    const result = await service.handleResourceRead({
      uri: 'genfeed://analytics/organization',
    });

    expect(clientService.getOrganizationAnalytics).toHaveBeenCalled();
  });

  it('handleResourceRead throws for unknown URI', async () => {
    await expect(
      service.handleResourceRead({ uri: 'genfeed://unknown' }),
    ).rejects.toThrow('Unknown resource');
  });

  it('setBearerToken delegates to clientService', () => {
    service.setBearerToken('new-token-123');
    expect(clientService.setBearerToken).toHaveBeenCalledWith('new-token-123');
  });

  it('logs error when proxy executor throws', async () => {
    clientService.executeAgentTool.mockRejectedValueOnce(new Error('API down'));

    await service.handleToolCall({
      arguments: {},
      name: 'get_credits_balance',
    });

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('get_credits_balance'),
      expect.any(Error),
    );
  });
});
