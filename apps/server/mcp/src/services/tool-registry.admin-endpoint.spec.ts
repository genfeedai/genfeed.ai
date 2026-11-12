import { ADMIN_MCP_TOOL_NAMES, type McpAccessMode } from '@genfeedai/actions';
import type { LoggerService } from '@libs/logger/logger.service';
import type { ClientService } from '@mcp/services/client.service';
import { ToolRegistryService } from '@mcp/services/tool-registry.service';

function build(accessMode: McpAccessMode, toolsets: 'core'[] = ['core']) {
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
    toolsets,
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
  it('lists every admin tool on the admin endpoint, whichever toolsets the URL selects', () => {
    const names = listedNames('admin');
    for (const name of ADMIN_MCP_TOOL_NAMES) {
      expect(names, name).toContain(name);
    }
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

  it('keeps the standard tools on the admin endpoint', () => {
    expect(listedNames('admin')).toEqual(
      expect.arrayContaining(listedNames('standard')),
    );
  });

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
});
