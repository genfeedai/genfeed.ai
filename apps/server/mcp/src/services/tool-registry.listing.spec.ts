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
 *
 * The tools below are synthetic fixtures chosen to exercise each role tier:
 * `list_posts` (real user tool) and `resolve_approval` (real superadmin tool),
 * plus a synthetic admin-tier tool (the OSS MCP surface currently has no
 * admin-only tool after the darkroom/fleet tools were dropped in PR 5/6).
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
  name: 'admin_scoped_tool',
  requiredRole: 'admin',
} as McpTool;

const SUPERADMIN_TOOL = {
  description: 'superadmin tool',
  inputSchema: { properties: {}, type: 'object' },
  name: 'resolve_approval',
  requiredRole: 'superadmin',
} as McpTool;

const ALL_TOOLS = [USER_TOOL, ADMIN_TOOL, SUPERADMIN_TOOL];

vi.mock('@genfeedai/tools', () => ({
  GENERATED_MCP_OPERATIONS: [],
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
    ).toEqual(['admin_scoped_tool', 'list_posts']);
  });

  it('gives a superadmin every tool', () => {
    expect(
      names(ToolRegistryService.filterToolsByRole(ALL_TOOLS, 'superadmin')),
    ).toEqual(['admin_scoped_tool', 'list_posts', 'resolve_approval']);
  });
});

describe('ToolRegistryService listing filters by the caller role', () => {
  it('getToolsForRole scopes discovery to the requested role', () => {
    const registry = build('user');
    expect(names(registry.getToolsForRole('admin'))).toEqual([
      'admin_scoped_tool',
      'list_posts',
    ]);
  });

  it('getTools defaults to the per-request role threaded into the constructor', () => {
    expect(names(build('user').getTools())).toEqual(['list_posts']);
    expect(names(build('admin').getTools())).toEqual([
      'admin_scoped_tool',
      'list_posts',
    ]);
  });

  it('getAllTools returns the unfiltered surface for internal checks', () => {
    expect(names(build('user').getAllTools())).toEqual([
      'admin_scoped_tool',
      'list_posts',
      'resolve_approval',
    ]);
  });
});
