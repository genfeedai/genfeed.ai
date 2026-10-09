import { CLAUDE_MCP_TOOL_NAMES } from '@genfeedai/actions';
import type { LoggerService } from '@libs/logger/logger.service';
import type { ClientService } from '@mcp/services/client.service';
import { ToolRegistryService } from '@mcp/services/tool-registry.service';

function build() {
  const client = {
    createApproval: vi.fn(),
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
    'generate',
    'transform_media',
    'generate_content_batch',
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
    expect(JSON.stringify(discovery)).not.toContain('generate_content_batch');
    expect(JSON.stringify(discovery)).not.toContain('execute_workflow');
  });
});
