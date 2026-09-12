import { describe, expect, it } from 'vitest';
import { MCP_DISCOVERY_TOOLS } from './discovery.tools';

const toolsByName = new Map(
  MCP_DISCOVERY_TOOLS.map((tool) => [tool.name, tool]),
);

describe('MCP_DISCOVERY_TOOLS', () => {
  it('exposes exactly the three discovery meta tools', () => {
    expect(MCP_DISCOVERY_TOOLS.map((tool) => tool.name).sort()).toEqual([
      'describe_tool',
      'list_toolsets',
      'search_tools',
    ]);
  });

  it('is free and available to every authenticated role', () => {
    for (const tool of MCP_DISCOVERY_TOOLS) {
      expect(tool.creditCost, tool.name).toBe(0);
      expect(tool.requiredRole, tool.name).toBe('user');
    }
  });

  it('takes no parameters for list_toolsets', () => {
    const tool = toolsByName.get('list_toolsets');
    expect(tool?.parameters.properties).toEqual({});
    expect(tool?.parameters.required ?? []).toEqual([]);
  });

  it('matches the search_tools contract: optional query/toolset, bounded limit', () => {
    const tool = toolsByName.get('search_tools');
    expect(tool?.parameters.required ?? []).toEqual([]);
    expect(Object.keys(tool?.parameters.properties ?? {}).sort()).toEqual([
      'limit',
      'query',
      'toolset',
    ]);
    expect(tool?.parameters.properties).toEqual(
      expect.objectContaining({
        limit: expect.objectContaining({
          maximum: 50,
          minimum: 1,
          type: 'number',
        }),
        query: expect.objectContaining({ type: 'string' }),
        toolset: expect.objectContaining({ type: 'string' }),
      }),
    );
  });

  it('requires a name for describe_tool', () => {
    const tool = toolsByName.get('describe_tool');
    expect(tool?.parameters.required).toEqual(['name']);
    expect(tool?.parameters.properties).toEqual(
      expect.objectContaining({
        name: expect.objectContaining({ type: 'string' }),
      }),
    );
  });
});
