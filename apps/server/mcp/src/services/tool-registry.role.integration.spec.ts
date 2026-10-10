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
 * Only the canonical-tools registry is mocked. `get_job_status` is a real
 * account-management tool that classifies to a live executor (so dispatch
 * actually runs for the allowed case); here it is mocked as `admin`-gated purely
 * to exercise the guard — the tool's real tier is irrelevant to this test.
 */
vi.mock('@genfeedai/actions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@genfeedai/actions')>();
  return {
    ...actual,
    getToolByName: vi.fn((name: string) =>
      name === 'get_job_status'
        ? { name, requiredRole: 'admin', surfaces: { mcp: true } }
        : actual.getToolByName(name),
    ),
    getToolsForSurface: vi.fn(() => []),
    toMcpTools: vi.fn((tools) => tools),
  };
});

function build(role: 'user' | 'admin') {
  const client = {
    createApproval: vi.fn().mockResolvedValue({
      id: 'apr-brand',
      status: 'PENDING',
      toolName: 'create_brand_from_url',
    }),
    executeAgentTool: vi.fn(),
    getJobStatus: vi
      .fn()
      .mockResolvedValue({ id: 'job_1', status: 'COMPLETED' }),
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
  it.each(['create_brand_from_url', 'onboard_brand'])(
    'denies user-tier URL brand creation through %s before queuing or dispatch',
    async (name) => {
      const { client, registry } = build('user');
      const result = await registry.handleToolCall({
        name,
        arguments: { action: 'create_from_url', url: 'https://example.com' },
      });
      expect(result).toMatchObject({ isError: true });
      expect(client.createApproval).not.toHaveBeenCalled();
      expect(client.executeAgentTool).not.toHaveBeenCalled();
    },
  );

  it('allows admin URL brand creation through the default onboarding tool', async () => {
    const { client, registry } = build('admin');
    await registry.handleToolCall({
      name: 'onboard_brand',
      arguments: { action: 'create_from_url', url: 'https://example.com' },
    });
    expect(client.createApproval).toHaveBeenCalledExactlyOnceWith(
      'create_brand_from_url',
      { url: 'https://example.com' },
    );
    expect(client.executeAgentTool).not.toHaveBeenCalled();
  });

  it('denies a user-tier caller an admin-gated tool before dispatch', async () => {
    const { client, registry } = build('user');

    const result = (await registry.handleToolCall({
      arguments: { jobId: 'job_1' },
      name: 'get_job_status',
    })) as { isError?: boolean; content: { text: string }[] };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("requires 'admin'");
    // The mutation/dispatch must never run when the gate denies.
    expect(client.getJobStatus).not.toHaveBeenCalled();
  });

  it('allows an admin caller the same admin-gated tool through to dispatch', async () => {
    const { client, registry } = build('admin');

    const result = (await registry.handleToolCall({
      arguments: { jobId: 'job_1' },
      name: 'get_job_status',
    })) as { isError?: boolean; content: { text: string }[] };

    expect(result.isError).toBeFalsy();
    expect(client.getJobStatus).toHaveBeenCalledOnce();
    expect(result.content[0].text).toContain('Job Status');
  });
});
