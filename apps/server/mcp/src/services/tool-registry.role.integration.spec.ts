import { LoggerService } from '@libs/logger/logger.service';
import { ClientService } from '@mcp/services/client.service';
import { ToolRegistryService } from '@mcp/services/tool-registry.service';

/**
 * Integration test for role enforcement through the FULL handleToolCall path
 * using the REAL `McpAuthGuard.checkToolRole` + `AuthService.hasRequiredRole`
 * (deliberately NOT mocked). This proves the role threaded into the constructor
 * actually denies/permits an admin-gated tool — the unit specs mock the guard,
 * so they only prove delegation, not enforcement.
 *
 * Only the canonical-tools registry is mocked so `get_darkroom_health` resolves
 * to an admin-gated MCP tool (and is not an agent-executor tool, so the role
 * gate runs before dispatch).
 */
vi.mock('@genfeedai/tools', () => ({
  getToolByName: vi.fn((name: string) =>
    name === 'get_darkroom_health'
      ? { name, requiredRole: 'admin', surfaces: { mcp: true } }
      : undefined,
  ),
  getToolsForSurface: vi.fn(() => []),
  toMcpTools: vi.fn((tools) => tools),
  isGeneratedApiTool: vi.fn(() => false),
  isGeneratedWriteTool: vi.fn(() => false),
}));

function build(role: 'user' | 'admin') {
  const client = {
    getDarkroomHealth: vi.fn().mockResolvedValue({ status: 'ok' }),
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
    role,
  );
  return { client, registry };
}

describe('ToolRegistryService role enforcement (real guard)', () => {
  it('denies a user-tier caller an admin-gated tool before dispatch', async () => {
    const { client, registry } = build('user');

    const result = (await registry.handleToolCall({
      arguments: {},
      name: 'get_darkroom_health',
    })) as { isError?: boolean; content: { text: string }[] };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("requires 'admin'");
    // The mutation/dispatch must never run when the gate denies.
    expect(client.getDarkroomHealth).not.toHaveBeenCalled();
  });

  it('allows an admin caller the same admin-gated tool through to dispatch', async () => {
    const { client, registry } = build('admin');

    const result = (await registry.handleToolCall({
      arguments: {},
      name: 'get_darkroom_health',
    })) as { isError?: boolean; content: { text: string }[] };

    expect(result.isError).toBeFalsy();
    expect(client.getDarkroomHealth).toHaveBeenCalledOnce();
    expect(result.content[0].text).toContain('Darkroom Health');
  });
});
