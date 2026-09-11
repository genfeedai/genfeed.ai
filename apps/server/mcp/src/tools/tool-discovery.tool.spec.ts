import type { McpToolOutput } from '@genfeedai/actions';
import {
  handleToolDiscoveryTool,
  type ToolDiscoverySource,
} from '@mcp/tools/tool-discovery.tool';

const mockState = vi.hoisted(() => ({
  toolsets: [] as Array<{
    name: string;
    description: string;
    isAlwaysOn: boolean;
    toolCount: number;
    toolNames: string[];
  }>,
}));

vi.mock('@genfeedai/actions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@genfeedai/actions')>();
  return {
    ...actual,
    getToolsets: vi.fn((surface: 'agent' | 'mcp') =>
      surface === 'mcp' ? mockState.toolsets : actual.getToolsets(surface),
    ),
  };
});

function tool(overrides: Partial<McpToolOutput> = {}): McpToolOutput {
  return {
    _meta: {
      'genfeed.ai/creditCost': 1,
      'genfeed.ai/toolset': 'content',
    },
    description: 'Create a post',
    inputSchema: { properties: {}, type: 'object' },
    name: 'create_post',
    requiredRole: 'user',
    ...overrides,
  };
}

describe('handleToolDiscoveryTool', () => {
  beforeEach(() => {
    mockState.toolsets = [
      {
        description: 'Always-on discovery tools',
        isAlwaysOn: true,
        name: 'core',
        toolCount: 3,
        toolNames: ['list_toolsets', 'search_tools', 'describe_tool'],
      },
      {
        description: 'Posts, articles, calendar',
        isAlwaysOn: false,
        name: 'content',
        toolCount: 5,
        toolNames: ['create_post'],
      },
    ];
  });

  describe('list_toolsets', () => {
    it('summarizes every mcp-surfaced toolset with counts', () => {
      const registry: ToolDiscoverySource = { getDiscoverableTools: () => [] };

      const result = handleToolDiscoveryTool(registry, 'list_toolsets', {});

      expect(result.content[0].text).toContain('core (always on): 3 tool(s)');
      expect(result.content[0].text).toContain('content: 5 tool(s)');
      expect(result.structuredContent).toEqual({
        toolsets: mockState.toolsets,
      });
    });
  });

  describe('search_tools', () => {
    const registry: ToolDiscoverySource = {
      getDiscoverableTools: () => [
        tool({ description: 'Create a post', name: 'create_post' }),
        tool({
          _meta: {
            'genfeed.ai/creditCost': 5,
            'genfeed.ai/mutationPolicy': 'approval-required',
            'genfeed.ai/toolset': 'generation',
          },
          description: 'Generate an image',
          name: 'generate_image',
        }),
        tool({
          description: 'Admin only tool',
          name: 'admin_only_tool',
          requiredRole: 'admin',
        }),
      ],
    };

    it('rejects a search with neither query nor toolset', () => {
      const result = handleToolDiscoveryTool(registry, 'search_tools', {});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'requires at least one of "query" or "toolset"',
      );
    });

    it('matches case-insensitively across name, description, and toolset', () => {
      const result = handleToolDiscoveryTool(registry, 'search_tools', {
        query: 'IMAGE',
      });

      expect(result.structuredContent?.tools).toEqual([
        expect.objectContaining({ name: 'generate_image' }),
      ]);
    });

    it('filters by toolset', () => {
      const result = handleToolDiscoveryTool(registry, 'search_tools', {
        toolset: 'generation',
      });

      expect(result.structuredContent?.tools).toEqual([
        expect.objectContaining({
          name: 'generate_image',
          toolset: 'generation',
        }),
      ]);
    });

    it('reports mutationPolicy, creditCost, and requiredRole per hit', () => {
      const result = handleToolDiscoveryTool(registry, 'search_tools', {
        query: 'generate_image',
      });

      expect(result.structuredContent?.tools).toEqual([
        {
          creditCost: 5,
          description: 'Generate an image',
          mutationPolicy: 'approval-required',
          name: 'generate_image',
          requiredRole: 'user',
          toolset: 'generation',
        },
      ]);
    });

    it('caps results at the provided limit', () => {
      const result = handleToolDiscoveryTool(registry, 'search_tools', {
        limit: 1,
        query: 'tool',
      });

      expect(result.structuredContent?.tools).toHaveLength(1);
    });

    it('returns a "no matches" message rather than an error for zero hits', () => {
      const result = handleToolDiscoveryTool(registry, 'search_tools', {
        query: 'nothing-matches-this',
      });

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toBe('No matching tools found.');
    });

    it('respects whatever the caller-role filter already excluded upstream', () => {
      const result = handleToolDiscoveryTool(registry, 'search_tools', {
        query: 'admin',
      });

      // The fixture registry still returns the admin tool (role filtering is
      // the registry's job via getDiscoverableTools), so the handler surfaces
      // it — proving it does not re-filter or drop role-restricted hits.
      expect(result.structuredContent?.tools).toEqual([
        expect.objectContaining({
          name: 'admin_only_tool',
          requiredRole: 'admin',
        }),
      ]);
    });
  });

  describe('describe_tool', () => {
    const registry: ToolDiscoverySource = {
      getDiscoverableTools: () => [
        tool({ description: 'Create a post', name: 'create_post' }),
        tool({ description: 'Create an article', name: 'create_article' }),
      ],
    };

    it('requires a name', () => {
      const result = handleToolDiscoveryTool(registry, 'describe_tool', {});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('requires "name"');
    });

    it('returns the full tool output for a known tool', () => {
      const result = handleToolDiscoveryTool(registry, 'describe_tool', {
        name: 'create_post',
      });

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent?.tool).toMatchObject({
        name: 'create_post',
        inputSchema: { properties: {}, type: 'object' },
      });
    });

    it('suggests the closest matches for an unknown tool name', () => {
      const result = handleToolDiscoveryTool(registry, 'describe_tool', {
        name: 'create_post_typo',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'Unknown tool "create_post_typo"',
      );
      expect(result.content[0].text).toContain('create_post');
    });

    it('says so when nothing is close', () => {
      const result = handleToolDiscoveryTool(registry, 'describe_tool', {
        name: 'zzzzzzzzzzzzzzzzzzzz',
      });

      expect(result.content[0].text).toContain(
        'No similar tool names were found',
      );
    });
  });

  it('throws for an unrouted discovery tool name', () => {
    const registry: ToolDiscoverySource = { getDiscoverableTools: () => [] };

    expect(() =>
      handleToolDiscoveryTool(registry, 'not_a_discovery_tool', {}),
    ).toThrow('Unknown tool discovery tool: not_a_discovery_tool');
  });
});
