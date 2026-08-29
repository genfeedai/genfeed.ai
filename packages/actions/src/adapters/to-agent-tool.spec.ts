import { describe, expect, it } from 'vitest';
import type { CanonicalToolDefinition } from '../interfaces/tool-definition.interface';
import { getToolsForSurface } from '../registry/tool-registry';
import { toAgentTools } from './to-agent-tool';

function buildTool(
  overrides: Partial<CanonicalToolDefinition> = {},
): CanonicalToolDefinition {
  return {
    category: 'generation',
    creditCost: 5,
    description: 'Generate an image',
    name: 'generate_image',
    parameters: {
      properties: { prompt: { type: 'string' } },
      required: ['prompt'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: true },
    ...overrides,
  };
}

describe('toAgentTools', () => {
  it('emits only agent-surfaced actions', () => {
    const tools = toAgentTools([
      buildTool(),
      buildTool({
        name: 'approve_social_draft',
        surfaces: { agent: false, cliAgentVisible: false, mcp: true },
      }),
    ]);

    expect(tools.map((tool) => tool.name)).toEqual(['generate_image']);
  });

  it('maps the canonical definition onto the agent output shape', () => {
    const [tool] = toAgentTools([buildTool()]);

    expect(tool).toEqual({
      creditCost: 5,
      description: 'Generate an image',
      name: 'generate_image',
      parameters: {
        properties: { prompt: { type: 'string' } },
        required: ['prompt'],
        type: 'object',
      },
    });
  });

  it('returns an empty list when nothing targets the agent surface', () => {
    expect(
      toAgentTools([
        buildTool({
          surfaces: { agent: false, cliAgentVisible: false, mcp: true },
        }),
      ]),
    ).toEqual([]);
  });

  it('emits every registry agent action with a numeric credit cost', () => {
    const agentTools = toAgentTools(getToolsForSurface('agent'));

    expect(agentTools.length).toBeGreaterThan(0);
    for (const tool of agentTools) {
      expect(tool.creditCost, tool.name).toBeTypeOf('number');
      expect(tool.description.length, tool.name).toBeGreaterThan(0);
    }
  });
});
