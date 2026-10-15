import { CLAUDE_MCP_TOOL_NAMES } from '@genfeedai/actions';
import type { LoggerService } from '@libs/logger/logger.service';
import type { ClientService } from '@mcp/services/client.service';
import { ToolRegistryService } from '@mcp/services/tool-registry.service';

function build() {
  const client = {
    createApproval: vi.fn(),
    createScheduledRelease: vi.fn(),
    updateScheduledRelease: vi.fn(),
    controlScheduledRelease: vi.fn(),
    executeAgentTool: vi.fn(),
    resolveApproval: vi.fn(),
  };
  const logger = { debug: vi.fn(), error: vi.fn(), warn: vi.fn() };
  const registry = new ToolRegistryService(
    client as unknown as ClientService,
    logger as unknown as LoggerService,
    'superadmin',
    ['generation', 'workflows'],
    undefined,
    'claude',
  );
  return { registry, client };
}

describe('Claude connector execution boundary', () => {
  it.each([
    {
      name: 'create_scheduled_release',
      arguments: {
        release: {
          baseContent: 'Review this exact copy',
          title: 'Launch',
          timezone: 'Europe/Malta',
          status: 'scheduled',
          scheduledDate: '2030-01-01T12:00:00Z',
          recurrence: { frequency: 'weekly', interval: 1 },
          targets: [{ credentialId: 'credential-1', platform: 'linkedin' }],
        },
      },
    },
    {
      name: 'update_scheduled_release',
      arguments: {
        releaseId: 'release-1',
        scope: 'release',
        changes: { baseContent: 'Changed live copy' },
      },
    },
    {
      name: 'control_scheduled_release',
      arguments: { releaseId: 'release-1', action: 'publish-now' },
    },
    {
      name: 'control_scheduled_release',
      arguments: { releaseId: 'release-1', action: 'resume' },
    },
  ])('queues $name without executing a public-channel write', async (call) => {
    const { registry, client } = build();
    client.createApproval.mockResolvedValue({
      id: 'approval-1',
      status: 'PENDING',
      toolName: call.name,
      arguments: call.arguments,
    });
    const result = await registry.handleToolCall(call);
    expect(client.createApproval).toHaveBeenCalledExactlyOnceWith(
      call.name,
      call.arguments,
    );
    expect(result).toMatchObject({
      isError: true,
      structuredContent: { code: 'approval_pending' },
    });
    expect(client.createScheduledRelease).not.toHaveBeenCalled();
    expect(client.updateScheduledRelease).not.toHaveBeenCalled();
    expect(client.controlScheduledRelease).not.toHaveBeenCalled();
    expect(client.executeAgentTool).not.toHaveBeenCalled();
    expect(client.resolveApproval).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain('call `resolve_approval`');
  });

  it.each([
    'generate',
    'transform_media',
    'generate_turbo_content',
    'execute_workflow',
    'start_remix_generation',
    'send_chat_message',
    'resolve_approval',
    'unknown_future_tool',
  ])(
    'blocks %s before dispatch or approval creation, including privileged callers',
    async (name) => {
      const { registry, client } = build();
      const result = await registry.handleToolCall({
        name,
        arguments: {
          decision: 'approve',
          approvalId: 'old-generation-approval',
        },
      });
      expect(result).toMatchObject({
        isError: true,
        structuredContent: {
          code: 'unavailable_in_connector',
          nextStepUrl: 'https://app.genfeed.ai/studio/playground',
        },
      });
      expect(client.createApproval).not.toHaveBeenCalled();
      expect(client.executeAgentTool).not.toHaveBeenCalled();
      expect(client.resolveApproval).not.toHaveBeenCalled();
    },
  );

  it('keeps discovery restricted even with generation/workflow toolsets', async () => {
    const { registry } = build();
    const tools = registry
      .getTools()
      .map((tool) => tool.name)
      .sort();
    expect(tools).toEqual([...CLAUDE_MCP_TOOL_NAMES].sort());
    expect(
      registry
        .getDiscoverableTools()
        .map((tool) => tool.name)
        .sort(),
    ).toEqual(tools);
    const discovery = await registry.handleToolCall({
      name: 'find_tools',
      arguments: { query: 'generate' },
    });
    expect(JSON.stringify(discovery)).not.toContain('generate_turbo_content');
    expect(JSON.stringify(discovery)).not.toContain('execute_workflow');
  });
});
