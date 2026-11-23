import {
  getToolsForSurface,
  MCP_TOOL_OUTPUT_SCHEMA,
  type McpToolOutput,
  toMcpTools,
} from '@genfeedai/actions';
import type { ToolDiscoverySource } from '@mcp/shared/interfaces/tool-discovery.interface';
import { handleToolDiscoveryTool } from '@mcp/tools/tool-discovery.tool';

function tool(overrides: Partial<McpToolOutput> = {}): McpToolOutput {
  return {
    _meta: {
      'genfeed.ai/creditCost': 1,
    },
    annotations: {
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
      readOnlyHint: false,
    },
    description: 'Create a post',
    inputSchema: { properties: {}, type: 'object' },
    outputSchema: MCP_TOOL_OUTPUT_SCHEMA,
    name: 'save_post',
    requiredRole: 'user',
    title: 'Create Post',
    ...overrides,
  };
}

/**
 * `handleToolDiscoveryTool` returns a union of a success shape
 * (`content`, optional `structuredContent`) and an error shape (`content`,
 * `isError`). Neither member is a subtype of the other, so plain property
 * access on the union does not typecheck — these assertion helpers narrow it
 * the same way the caller eventually would, using presence-of-`isError` as
 * the discriminant.
 */
type ToolDiscoveryResult = ReturnType<typeof handleToolDiscoveryTool>;
type ToolDiscoveryErrorResult = Extract<
  ToolDiscoveryResult,
  { isError: boolean }
>;
type ToolDiscoverySuccessResult = Exclude<
  ToolDiscoveryResult,
  { isError: boolean }
>;

function expectSuccess(
  result: ToolDiscoveryResult,
): asserts result is ToolDiscoverySuccessResult {
  expect('isError' in result).toBe(false);
}

function expectError(
  result: ToolDiscoveryResult,
): asserts result is ToolDiscoveryErrorResult {
  expect('isError' in result).toBe(true);
}

describe('handleToolDiscoveryTool', () => {
  const registry: ToolDiscoverySource = {
    getTools: () => [
      tool({ description: 'Create a post', name: 'save_post' }),
      tool({
        _meta: {
          'genfeed.ai/creditCost': 5,
          'genfeed.ai/mutationPolicy': 'approval-required',
        },
        description: 'Generate an image. Costs credits.',
        name: 'generate',
      }),
      tool({
        description: 'Admin only tool',
        name: 'admin_only_tool',
        requiredRole: 'admin',
      }),
    ],
  };

  describe('find_tools with no arguments (list every tool)', () => {
    it('lists every tool this connection serves with its first sentence', () => {
      const result = handleToolDiscoveryTool(registry, 'find_tools', {});
      expectSuccess(result);

      expect(result.content[0].text).toContain('3 tool(s):');
      expect(result.content[0].text).toContain(
        '- generate: Generate an image.',
      );
      expect(result.content[0].text).not.toContain('Costs credits');
      expect(result.structuredContent?.tools).toHaveLength(3);
    });

    it('does not cap the full list at the search limit', () => {
      const many: ToolDiscoverySource = {
        getTools: () =>
          Array.from({ length: 30 }, (_, index) =>
            tool({ name: `tool_${index}` }),
          ),
      };
      const result = handleToolDiscoveryTool(many, 'find_tools', {
        query: '  ',
      });
      expectSuccess(result);

      expect(result.structuredContent?.tools).toHaveLength(30);
    });
  });

  describe('find_tools with query (search)', () => {
    it('matches case-insensitively across name and description', () => {
      const result = handleToolDiscoveryTool(registry, 'find_tools', {
        query: 'IMAGE',
      });
      expectSuccess(result);

      expect(result.structuredContent?.tools).toEqual([
        expect.objectContaining({ name: 'generate' }),
      ]);
    });

    it('reports mutationPolicy, creditCost, and requiredRole per hit', () => {
      const result = handleToolDiscoveryTool(registry, 'find_tools', {
        query: 'generate',
      });
      expectSuccess(result);

      expect(result.structuredContent?.tools).toEqual([
        {
          actions: [],
          creditCost: 5,
          description: 'Generate an image. Costs credits.',
          mutationPolicy: 'approval-required',
          name: 'generate',
          requiredRole: 'user',
        },
      ]);
    });

    it('caps results at the provided limit', () => {
      const result = handleToolDiscoveryTool(registry, 'find_tools', {
        limit: 1,
        query: 'tool',
      });
      expectSuccess(result);

      expect(result.structuredContent?.tools).toHaveLength(1);
    });

    it('returns a "no matches" message rather than an error for zero hits', () => {
      const result = handleToolDiscoveryTool(registry, 'find_tools', {
        query: 'nothing-matches-this',
      });
      expectSuccess(result);

      expect(result.content[0].text).toBe('No matching tools found.');
    });

    it('respects whatever the caller-role filter already excluded upstream', () => {
      const result = handleToolDiscoveryTool(registry, 'find_tools', {
        query: 'admin',
      });
      expectSuccess(result);

      // Role filtering is the registry's job, so the handler surfaces what it
      // is given and does not re-filter role-restricted hits.
      expect(result.structuredContent?.tools).toEqual([
        expect.objectContaining({
          name: 'admin_only_tool',
          requiredRole: 'admin',
        }),
      ]);
    });
  });

  describe('find_tools with name (describe)', () => {
    const registry: ToolDiscoverySource = {
      getTools: () => [
        tool({ description: 'Create a post', name: 'save_post' }),
        tool({
          description: 'Repurpose a post',
          name: 'repurpose_post',
        }),
      ],
    };

    it('treats a blank name as no name and lists every tool', () => {
      const result = handleToolDiscoveryTool(registry, 'find_tools', {
        name: '   ',
      });
      expectSuccess(result);

      expect(result.content[0].text).toContain('2 tool(s):');
    });

    it('prefers name over query', () => {
      const result = handleToolDiscoveryTool(registry, 'find_tools', {
        name: 'save_post',
        query: 'repurpose',
      });
      expectSuccess(result);

      expect(result.structuredContent?.tool).toMatchObject({
        name: 'save_post',
      });
      expect(result.structuredContent?.tools).toBeUndefined();
    });

    it('returns the full tool output for a known tool', () => {
      const result = handleToolDiscoveryTool(registry, 'find_tools', {
        name: 'save_post',
      });
      expectSuccess(result);

      expect(result.structuredContent?.tool).toMatchObject({
        name: 'save_post',
        inputSchema: { properties: {}, type: 'object' },
      });
    });

    it('suggests the closest matches for an unknown tool name', () => {
      const result = handleToolDiscoveryTool(registry, 'find_tools', {
        name: 'save_post_typo',
      });
      expectError(result);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Unknown tool "save_post_typo"');
      expect(result.content[0].text).toContain('save_post');
    });

    it('says so when nothing is close', () => {
      const result = handleToolDiscoveryTool(registry, 'find_tools', {
        name: 'zzzzzzzzzzzzzzzzzzzz',
      });

      expect(result.content[0].text).toContain(
        'No similar tool names were found',
      );
    });
  });

  it('throws for an unrouted discovery tool name', () => {
    const registry: ToolDiscoverySource = { getTools: () => [] };

    expect(() =>
      handleToolDiscoveryTool(registry, 'not_a_discovery_tool', {}),
    ).toThrow('Unknown tool discovery tool: not_a_discovery_tool');
  });
});

describe('retired tool discovery', () => {
  it('returns the already discoverable canonical descriptor and fixed action guidance', () => {
    const registry = {
      getTools: () => toMcpTools(getToolsForSurface('mcp')),
    };
    const result = handleToolDiscoveryTool(registry, 'find_tools', {
      name: 'request_media_upload',
    });
    expect(result).toMatchObject({
      structuredContent: { tool: { name: 'upload_media' } },
    });
    expect(JSON.stringify(result)).toContain('upload_media(action=request)');
    expect(JSON.stringify(result)).not.toContain(
      '"name":"request_media_upload"',
    );
  });
  it('does not reveal retired names whose canonical tool is unavailable', () => {
    const registry = { getTools: () => [] };
    const result = handleToolDiscoveryTool(registry, 'find_tools', {
      name: 'request_media_upload',
    });
    expect(result).toMatchObject({ isError: true });
    expect(JSON.stringify(result)).not.toContain('upload_media(action=');
  });
});

describe('retired tool search', () => {
  it('finds the merged tool by a retired tool name and lists its actions', () => {
    const registry = {
      getTools: () => toMcpTools(getToolsForSurface('mcp')),
    };
    const result = handleToolDiscoveryTool(registry, 'find_tools', {
      query: 'request_media_upload',
    });
    expectSuccess(result);
    expect(result.structuredContent?.tools).toEqual([
      expect.objectContaining({
        actions: expect.arrayContaining(['request']),
        name: 'upload_media',
      }),
    ]);
  });
});
