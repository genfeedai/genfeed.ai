import {
  ADMIN_MCP_TOOL_NAMES,
  getToolsForSurface,
  type McpAccessMode,
} from '@genfeedai/actions';
import type { LoggerService } from '@libs/logger/logger.service';
import type { ClientService } from '@mcp/services/client.service';
import { ToolRegistryService } from '@mcp/services/tool-registry.service';

function build(accessMode: McpAccessMode) {
  const client = {
    executeAgentTool: vi.fn(),
    isApprovalRequired: vi.fn().mockResolvedValue(false),
    resolveApproval: vi.fn(),
  };
  const logger = { debug: vi.fn(), error: vi.fn(), warn: vi.fn() };
  const registry = new ToolRegistryService(
    client as unknown as ClientService,
    logger as unknown as LoggerService,
    'superadmin',
    ['core'],
    undefined,
    accessMode,
  );
  return { client, registry };
}

const listedNames = (accessMode: McpAccessMode) =>
  build(accessMode)
    .registry.getTools()
    .map((tool) => tool.name);

describe('Admin MCP endpoint tool boundary', () => {
  it('lists exactly the admin tools on the admin endpoint, whichever toolsets the URL selects', () => {
    expect(listedNames('admin').sort()).toEqual(
      [...ADMIN_MCP_TOOL_NAMES].sort(),
    );
  });

  it('lists no generation or content tools on the admin endpoint', () => {
    const names = listedNames('admin');
    for (const tool of getToolsForSurface('mcp')) {
      if (ADMIN_MCP_TOOL_NAMES.has(tool.name)) continue;
      expect(names, tool.name).not.toContain(tool.name);
    }
    expect(names).not.toContain('generate');
  });

  it.each(['standard', 'claude'] as const)(
    'lists no admin tool on the %s endpoint, even for a superadmin caller',
    (accessMode) => {
      const names = listedNames(accessMode);
      for (const name of ADMIN_MCP_TOOL_NAMES) {
        expect(names, name).not.toContain(name);
      }
    },
  );

  it.each(['standard', 'claude'] as const)(
    'refuses a direct call to an admin tool on the %s endpoint',
    async (accessMode) => {
      const { client, registry } = build(accessMode);
      const result = (await registry.handleToolCall({
        arguments: { approvalId: 'approval-1', decision: 'decline' },
        name: 'resolve_approval',
      })) as { isError?: boolean };
      expect(result.isError).toBe(true);
      expect(client.resolveApproval).not.toHaveBeenCalled();
    },
  );

  it('refuses a direct call to a generation tool on the admin endpoint', async () => {
    const { client, registry } = build('admin');
    const result = (await registry.handleToolCall({
      arguments: { prompt: 'a cat' },
      name: 'generate',
    })) as { isError?: boolean };
    expect(result.isError).toBe(true);
    expect(client.executeAgentTool).not.toHaveBeenCalled();
  });
});
