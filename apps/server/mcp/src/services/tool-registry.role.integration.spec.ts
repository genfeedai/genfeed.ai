import { LoggerService } from '@libs/logger/logger.service';
import { ClientService } from '@mcp/services/client.service';
import { ToolRegistryService } from '@mcp/services/tool-registry.service';

/**
 * Integration test for role enforcement through the FULL handleToolCall path
 * using the REAL `McpAuthGuard.checkToolRole` + `AuthService.hasRequiredRole`
 * (deliberately NOT mocked). This proves the role threaded into the constructor
 * actually denies/permits a role-gated tool — the unit specs mock the guard, so
 * they only prove delegation, not enforcement.
 *
 * Only the canonical-tools registry is mocked. `get_account_info` is a real
 * account-management tool that classifies to a live executor (so dispatch
 * actually runs for the allowed case); here it is mocked as `admin`-gated purely
 * to exercise the guard — the tool's real tier is irrelevant to this test.
 */
vi.mock('@genfeedai/tools', () => ({
  getToolByName: vi.fn((name: string) =>
    name === 'get_account_info'
      ? { name, requiredRole: 'admin', surfaces: { mcp: true } }
      : undefined,
  ),
  getToolsForSurface: vi.fn(() => []),
  toMcpTools: vi.fn((tools) => tools),
}));

function build(role: 'user' | 'admin') {
  const client = {
    getAccountInfo: vi
      .fn()
      .mockResolvedValue({ id: 'org_1', name: 'Acme Inc.' }),
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
      name: 'get_account_info',
    })) as { isError?: boolean; content: { text: string }[] };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("requires 'admin'");
    // The mutation/dispatch must never run when the gate denies.
    expect(client.getAccountInfo).not.toHaveBeenCalled();
  });

  it('allows an admin caller the same admin-gated tool through to dispatch', async () => {
    const { client, registry } = build('admin');

    const result = (await registry.handleToolCall({
      arguments: {},
      name: 'get_account_info',
    })) as { isError?: boolean; content: { text: string }[] };

    expect(result.isError).toBeFalsy();
    expect(client.getAccountInfo).toHaveBeenCalledOnce();
    expect(result.content[0].text).toContain('Account Info');
  });
});
