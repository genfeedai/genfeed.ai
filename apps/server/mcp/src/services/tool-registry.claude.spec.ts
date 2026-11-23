import {
  ADMIN_MCP_TOOL_NAMES,
  CLAUDE_MCP_TOOL_NAMES,
} from '@genfeedai/actions';
import type { LoggerService } from '@libs/logger/logger.service';
import { McpResourceUri } from '@mcp/mcp/resource-catalog';
import type { ClientService } from '@mcp/services/client.service';
import { withMergedToolCalls } from '@mcp/services/tool-registry.endpoints.testing';
import { ToolRegistryService } from '@mcp/services/tool-registry.service';

function build() {
  const client = {
    isApprovalRequired: vi.fn().mockResolvedValue(true),
    createApproval: vi.fn(),
    createScheduledRelease: vi.fn(),
    updateScheduledRelease: vi.fn(),
    controlScheduledRelease: vi.fn(),
    publishArticle: vi.fn(),
    executeAgentTool: vi.fn(),
    resolveApproval: vi.fn(),
  };
  const logger = { debug: vi.fn(), error: vi.fn(), warn: vi.fn() };
  const registry = withMergedToolCalls(
    new ToolRegistryService(
      client as unknown as ClientService,
      logger as unknown as LoggerService,
      'superadmin',
      undefined,
      'claude',
    ),
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
    { name: 'publish_article', arguments: { articleId: 'article-1' } },
  ])(
    'holds $name until the agent confirms, with no web approval',
    async (call) => {
      const { registry, client } = build();
      const result = await registry.handleToolCall(call);
      expect(client.createApproval).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        isError: true,
        structuredContent: {
          code: 'confirmation_required',
          toolName: call.name,
        },
      });
      expect(result).not.toHaveProperty('structuredContent.approvalId');
      expect(result).not.toHaveProperty('structuredContent.nextStepUrl');
      expect(JSON.stringify(result)).toContain('Nothing was published');
      expect(client.createScheduledRelease).not.toHaveBeenCalled();
      expect(client.updateScheduledRelease).not.toHaveBeenCalled();
      expect(client.controlScheduledRelease).not.toHaveBeenCalled();
      expect(client.publishArticle).not.toHaveBeenCalled();
      expect(client.executeAgentTool).not.toHaveBeenCalled();
      expect(client.resolveApproval).not.toHaveBeenCalled();
    },
  );

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
          message: expect.stringContaining('does not generate images'),
        },
      });
      expect(JSON.stringify(result)).not.toMatch(
        /studio|playground|https?:\/\//i,
      );
      expect(client.createApproval).not.toHaveBeenCalled();
      expect(client.executeAgentTool).not.toHaveBeenCalled();
      expect(client.resolveApproval).not.toHaveBeenCalled();
    },
  );

  it('serves a Claude guide that points nowhere and says generation is not offered', async () => {
    const { registry } = build();
    const result = (await registry.handleResourceRead({
      uri: McpResourceUri.AGENT_GUIDE,
    })) as { contents: { text: string }[] };

    expect(result.contents[0].text).toContain(
      'This connector does not generate images, video or audio',
    );
    expect(result.contents[0].text).not.toMatch(
      /studio|playground|https?:\/\//i,
    );
  });

  it('keeps discovery restricted to the Claude tools', async () => {
    const { registry } = build();
    const tools = registry
      .getTools()
      .map((tool) => tool.name)
      .sort();
    expect(tools).toEqual(
      [...CLAUDE_MCP_TOOL_NAMES]
        .filter((name) => !ADMIN_MCP_TOOL_NAMES.has(name))
        .sort(),
    );
    expect(tools).not.toContain('create_brand_from_url');
    const discovery = await registry.handleToolCall({
      name: 'find_tools',
      arguments: { query: 'generate' },
    });
    expect(JSON.stringify(discovery)).not.toContain('generate_turbo_content');
    expect(JSON.stringify(discovery)).not.toContain('execute_workflow');
  });
});
