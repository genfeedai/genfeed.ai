import { LoggerService } from '@libs/logger/logger.service';
import { ClientService } from '@mcp/services/client.service';
import { ToolRegistryService } from '@mcp/services/tool-registry.service';
import type { McpTool } from '@mcp/shared/interfaces/mcp-server.interface';

/**
 * Unit coverage for the role-aware `tools/list` filter. This is the UX gate that
 * hides tools a caller cannot invoke from discovery (the authoritative gate is
 * the per-call role check in `handleToolCall`). Both the JSON-RPC path
 * (`getTools`) and the REST mirror (`GET /v1/tools`) must go through the same
 * filter, so we assert the shared primitive `filterToolsByRole` plus the
 * per-instance `getToolsForRole`.
 */

const USER_TOOL = {
  description: 'user tool',
  inputSchema: { properties: {}, type: 'object' },
  name: 'list_posts',
  requiredRole: 'user',
} as McpTool;

const ADMIN_TOOL = {
  description: 'admin tool',
  inputSchema: { properties: {}, type: 'object' },
  name: 'get_darkroom_health',
  requiredRole: 'admin',
} as McpTool;

const SUPERADMIN_TOOL = {
  description: 'superadmin tool',
  inputSchema: { properties: {}, type: 'object' },
  name: 'control_comfyui',
  requiredRole: 'superadmin',
} as McpTool;

const ALL_TOOLS = [USER_TOOL, ADMIN_TOOL, SUPERADMIN_TOOL];

vi.mock('@genfeedai/tools', () => ({
  getToolByName: vi.fn(),
  getToolsForSurface: vi.fn(() => ALL_TOOLS),
  toMcpTools: vi.fn((tools) => tools),
}));

function build(role: 'user' | 'admin' | 'superadmin') {
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  return new ToolRegistryService(
    {} as unknown as ClientService,
    logger as unknown as LoggerService,
    role,
  );
}

const names = (tools: McpTool[]): string[] => tools.map((t) => t.name).sort();

describe('ToolRegistryService.filterToolsByRole', () => {
  it('gives a user only user-tier tools', () => {
    expect(
      names(ToolRegistryService.filterToolsByRole(ALL_TOOLS, 'user')),
    ).toEqual(['list_posts']);
  });

  it('gives an admin user- and admin-tier tools, not superadmin', () => {
    expect(
      names(ToolRegistryService.filterToolsByRole(ALL_TOOLS, 'admin')),
    ).toEqual(['get_darkroom_health', 'list_posts']);
  });

  it('gives a superadmin every tool', () => {
    expect(
      names(ToolRegistryService.filterToolsByRole(ALL_TOOLS, 'superadmin')),
    ).toEqual(['control_comfyui', 'get_darkroom_health', 'list_posts']);
  });
});

describe('ToolRegistryService listing filters by the caller role', () => {
  it('getToolsForRole scopes discovery to the requested role', () => {
    const registry = build('user');
    expect(names(registry.getToolsForRole('admin'))).toEqual([
      'get_darkroom_health',
      'list_posts',
    ]);
  });

  it('getTools defaults to the per-request role threaded into the constructor', () => {
    expect(names(build('user').getTools())).toEqual(['list_posts']);
    expect(names(build('admin').getTools())).toEqual([
      'get_darkroom_health',
      'list_posts',
    ]);
  });

  it('getAllTools returns the unfiltered surface for internal checks', () => {
    expect(names(build('user').getAllTools())).toEqual([
      'control_comfyui',
      'get_darkroom_health',
      'list_posts',
    ]);
  });
});
