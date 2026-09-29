import type { McpToolOutput, ToolsetName } from '@genfeedai/actions';
import { LoggerService } from '@libs/logger/logger.service';
import { ClientService } from '@mcp/services/client.service';
import { ToolRegistryService } from '@mcp/services/tool-registry.service';

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
 * admin-only tool after the fleet tools were dropped in PR 5/6).
 */

const USER_TOOL = {
  _meta: {},
  description: 'user tool',
  inputSchema: { properties: {}, type: 'object' },
  name: 'list_posts',
  requiredRole: 'user',
} as McpToolOutput;

const ADMIN_TOOL = {
  _meta: {},
  description: 'admin tool',
  inputSchema: { properties: {}, type: 'object' },
  name: 'admin_scoped_tool',
  requiredRole: 'admin',
} as McpToolOutput;

const SUPERADMIN_TOOL = {
  _meta: {},
  description: 'superadmin tool',
  inputSchema: { properties: {}, type: 'object' },
  name: 'resolve_approval',
  requiredRole: 'superadmin',
} as McpToolOutput;

const ALL_TOOLS = [USER_TOOL, ADMIN_TOOL, SUPERADMIN_TOOL];

const mockState = vi.hoisted(() => ({
  toolsForToolsets: [] as { name: string }[],
}));

vi.mock('@genfeedai/actions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@genfeedai/actions')>();
  return {
    ...actual,
    getToolByName: vi.fn(),
    getToolsForSurface: vi.fn(
      (surface: Parameters<typeof actual.getToolsForSurface>[0]) =>
        surface === 'mcp' ? ALL_TOOLS : actual.getToolsForSurface(surface),
    ),
    getToolsForToolsets: vi.fn(
      (
        surface: Parameters<typeof actual.getToolsForToolsets>[0],
        toolsets: Parameters<typeof actual.getToolsForToolsets>[1],
      ) =>
        surface === 'mcp'
          ? mockState.toolsForToolsets
          : actual.getToolsForToolsets(surface, toolsets),
    ),
    toMcpTools: vi.fn((tools) => tools),
  };
});

function build(
  role: 'user' | 'admin' | 'superadmin',
  toolsets: ToolsetName[] = [],
) {
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
    toolsets,
  );
}

const names = (tools: McpToolOutput[]): string[] =>
  tools.map((tool) => tool.name).sort();

beforeEach(() => {
  // Default: `getToolsForToolsets` behaves like the unfiltered surface, so
  // existing role-only assertions do not need to know about toolsets.
  mockState.toolsForToolsets = ALL_TOOLS;
});

describe('ToolRegistryService listing filters by the caller role', () => {
  it('getToolsForRole scopes discovery to the requested role', () => {
    const registry = build('user');
    expect(names(registry.getToolsForRole('admin'))).toEqual([
      'admin_scoped_tool',
      'list_posts',
    ]);
  });
});

describe('ToolRegistryService toolset-aware listing (getTools / getToolsForRoleAndToolsets)', () => {
  const CORE_TOOL = {
    _meta: {},
    description: 'core discovery tool',
    inputSchema: { properties: {}, type: 'object' },
    name: 'list_toolsets',
    requiredRole: 'user',
  } as McpToolOutput;

  const CONTENT_TOOL = {
    _meta: {},
    description: 'content tool',
    inputSchema: { properties: {}, type: 'object' },
    name: 'create_post',
    requiredRole: 'user',
  } as McpToolOutput;

  const ADMIN_GENERATION_TOOL = {
    _meta: {},
    description: 'admin-gated generation tool',
    inputSchema: { properties: {}, type: 'object' },
    name: 'admin_only_generation_tool',
    requiredRole: 'admin',
  } as McpToolOutput;

  const TOOLSET_FIXTURE = [CORE_TOOL, CONTENT_TOOL, ADMIN_GENERATION_TOOL];

  beforeEach(() => {
    mockState.toolsForToolsets = TOOLSET_FIXTURE;
  });

  it('reports a requested toolset that has no MCP tools as ignored', () => {
    expect(
      build('user', ['content', 'goals']).getIgnoredEmptyToolsets(),
    ).toEqual(['goals']);
    expect(build('user', []).getIgnoredEmptyToolsets()).toEqual([]);
  });
});

describe('ToolRegistryService.getDiscoverableTools', () => {
  it('ignores the requested toolset selection and returns the role-filtered full catalog', () => {
    // ALL_TOOLS (via getToolsForSurface) has an admin and a superadmin tool
    // that are NOT in the requested toolset fixture below — proving discovery
    // is not scoped to `?toolsets=`.
    mockState.toolsForToolsets = [];

    expect(names(build('user', ['content']).getDiscoverableTools())).toEqual([
      'list_posts',
    ]);
    expect(
      names(build('superadmin', ['content']).getDiscoverableTools()),
    ).toEqual(['admin_scoped_tool', 'list_posts', 'resolve_approval']);
  });
});
