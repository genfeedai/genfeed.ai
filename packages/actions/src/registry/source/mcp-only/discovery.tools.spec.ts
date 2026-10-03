import { describe, expect, it } from 'vitest';
import { MCP_DISCOVERY_TOOLS } from './discovery.tools';

const toolsByName = new Map(
  MCP_DISCOVERY_TOOLS.map((tool) => [tool.name, tool]),
);

describe('MCP_DISCOVERY_TOOLS', () => {
  it('exposes exactly the find_tools discovery meta tool', () => {
    expect(MCP_DISCOVERY_TOOLS.map((tool) => tool.name)).toEqual([
      'find_tools',
    ]);
  });

  it('is free and available to every authenticated role', () => {
    for (const tool of MCP_DISCOVERY_TOOLS) {
      expect(tool.creditCost, tool.name).toBe(0);
      expect(tool.requiredRole, tool.name).toBe('user');
    }
  });

  it('matches the find_tools contract: every argument optional, bounded limit', () => {
    const tool = toolsByName.get('find_tools');
    expect(tool?.parameters.required ?? []).toEqual([]);
    expect(Object.keys(tool?.parameters.properties ?? {}).sort()).toEqual([
      'limit',
      'name',
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
        name: expect.objectContaining({ type: 'string' }),
        query: expect.objectContaining({ type: 'string' }),
        toolset: expect.objectContaining({ type: 'string' }),
      }),
    );
  });
});
