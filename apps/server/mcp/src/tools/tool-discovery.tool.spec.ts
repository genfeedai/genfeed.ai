import type { McpToolOutput } from '@genfeedai/actions';
import {
  handleToolDiscoveryTool,
  type ToolDiscoverySource,
} from '@mcp/tools/tool-discovery.tool';

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

/** The nine `core` tools a plain `user` can see (everything but `resolve_approval`). */
const USER_VISIBLE_CORE_TOOL_NAMES = [
  'list_toolsets',
  'search_tools',
  'describe_tool',
  'get_account_info',
  'list_brands',
  'get_brand',
  'get_credits_balance',
  'get_usage_stats',
  'get_job_status',
];

function coreTool(name: string): McpToolOutput {
  return tool({
    _meta: { 'genfeed.ai/toolset': 'core' },
    description: `${name} description`,
    name,
  });
}

describe('handleToolDiscoveryTool', () => {
  describe('list_toolsets', () => {
    it('summarizes every toolset visible to the caller with counts, ordered and described by the static catalog', () => {
      const registry: ToolDiscoverySource = {
        getDiscoverableTools: () => [
          ...USER_VISIBLE_CORE_TOOL_NAMES.map(coreTool),
          tool({ name: 'create_post' }),
        ],
      };

      const result = handleToolDiscoveryTool(registry, 'list_toolsets', {});

      expect(result.content[0].text).toContain(
        `core (always on): ${USER_VISIBLE_CORE_TOOL_NAMES.length} tool(s)`,
      );
      expect(result.content[0].text).toContain('content: 1 tool(s)');

      const toolsets = result.structuredContent?.toolsets as Array<{
        name: string;
        toolCount: number;
        toolNames: string[];
      }>;
      // TOOLSETS lists `content` before `core` alphabetically — `list_toolsets`
      // must follow the static catalog's order, not discovery order.
      expect(toolsets.map((toolset) => toolset.name)).toEqual([
        'content',
        'core',
      ]);
    });

    it('omits a toolset the caller cannot see any tool from', () => {
      const registry: ToolDiscoverySource = {
        getDiscoverableTools: () => [tool({ name: 'create_post' })],
      };

      const result = handleToolDiscoveryTool(registry, 'list_toolsets', {});

      const toolsets = result.structuredContent?.toolsets as Array<{
        name: string;
      }>;
      expect(toolsets.map((toolset) => toolset.name)).toEqual(['content']);
    });

    it('is role-aware: a plain user sees core with 9 tools and never sees resolve_approval', () => {
      // `getDiscoverableTools` is the registry's job to pre-filter by role —
      // this fixture simulates what a `user`-scoped registry returns: every
      // core tool except the superadmin-gated `resolve_approval`.
      const registry: ToolDiscoverySource = {
        getDiscoverableTools: () => USER_VISIBLE_CORE_TOOL_NAMES.map(coreTool),
      };

      const result = handleToolDiscoveryTool(registry, 'list_toolsets', {});

      const toolsets = result.structuredContent?.toolsets as Array<{
        name: string;
        toolCount: number;
        toolNames: string[];
      }>;
      const core = toolsets.find((toolset) => toolset.name === 'core');

      expect(core?.toolCount).toBe(9);
      expect(core?.toolNames).not.toContain('resolve_approval');
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

    it('lowercases and trims the toolset filter before matching', () => {
      const result = handleToolDiscoveryTool(registry, 'search_tools', {
        toolset: '  Generation  ',
      });

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent?.tools).toEqual([
        expect.objectContaining({ name: 'generate_image' }),
      ]);
    });

    it('returns an isError result naming the valid MCP toolsets for an unknown toolset filter', () => {
      const result = handleToolDiscoveryTool(registry, 'search_tools', {
        toolset: 'not-a-real-toolset',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'Unknown toolset "not-a-real-toolset"',
      );
      expect(result.content[0].text).toContain('Valid toolsets:');
      expect(result.content[0].text).toContain('content');
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
