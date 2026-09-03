import { describe, expect, it } from 'vitest';
import type { CanonicalToolDefinition } from '../interfaces/tool-definition.interface';
import { getToolsForSurface } from '../registry/tool-registry';
import { MCP_CREDIT_COST_META_KEY, toMcpTools } from './to-mcp-tool';

function buildTool(
  overrides: Partial<CanonicalToolDefinition> = {},
): CanonicalToolDefinition {
  return {
    category: 'generation',
    creditCost: 17,
    description: 'Generate a voice clip',
    name: 'generate_voice',
    parameters: {
      properties: { text: { type: 'string' } },
      required: ['text'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: true },
    ...overrides,
  };
}

describe('toMcpTools', () => {
  it('emits only MCP-surfaced actions', () => {
    const tools = toMcpTools([
      buildTool(),
      buildTool({
        name: 'prepare_voice_clone',
        surfaces: { agent: true, cliAgentVisible: true, mcp: false },
      }),
    ]);

    expect(tools.map((tool) => tool.name)).toEqual(['generate_voice']);
  });

  it('advertises the credit cost under the namespaced _meta key', () => {
    const [tool] = toMcpTools([buildTool()]);

    expect(MCP_CREDIT_COST_META_KEY).toBe('genfeed.ai/creditCost');
    expect(tool?._meta[MCP_CREDIT_COST_META_KEY]).toBe(17);
  });

  it('advertises a credit cost for every MCP-surfaced action', () => {
    for (const tool of toMcpTools(getToolsForSurface('mcp'))) {
      expect(tool._meta[MCP_CREDIT_COST_META_KEY], tool.name).toBeTypeOf(
        'number',
      );
    }
  });
});
