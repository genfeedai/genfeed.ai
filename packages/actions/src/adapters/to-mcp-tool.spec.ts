import { describe, expect, it } from 'vitest';
import type { CanonicalToolDefinition } from '../interfaces/tool-definition.interface';
import { getToolsForSurface } from '../registry/tool-registry';
import {
  MCP_CREDIT_COST_META_KEY,
  MCP_TOOLSET_META_KEY,
  toMcpTools,
} from './to-mcp-tool';

const AUDITED_PRESENTATIONS = [
  {
    annotations: {
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      readOnlyHint: false,
    },
    creditCost: 1,
    mutationPolicy: 'direct',
    name: 'enhance_prompt',
    title: 'Enhance Prompt',
  },
  {
    annotations: {
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      readOnlyHint: false,
    },
    creditCost: 10,
    mutationPolicy: 'direct',
    name: 'generate',
    title: 'Generate',
  },
  {
    annotations: {
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      readOnlyHint: false,
    },
    creditCost: 1,
    mutationPolicy: 'direct',
    name: 'get_x_posts',
    title: 'Get X Posts',
  },
  {
    annotations: {
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      readOnlyHint: false,
    },
    creditCost: 1,
    mutationPolicy: 'direct',
    name: 'list_x_account_activity',
    title: 'List X Account Activity',
  },
  {
    annotations: {
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      readOnlyHint: true,
    },
    creditCost: 0,
    mutationPolicy: undefined,
    name: 'get_ads_ad_insights',
    title: 'Get Ads Ad Insights',
  },
  {
    annotations: {
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      readOnlyHint: true,
    },
    creditCost: 0,
    mutationPolicy: undefined,
    name: 'get_ads_adset_insights',
    title: 'Get Ads Adset Insights',
  },
  {
    annotations: {
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
      readOnlyHint: false,
    },
    creditCost: 0,
    mutationPolicy: 'direct',
    name: 'cancel_visual_code_project',
    title: 'Cancel Visual Code Project',
  },
  {
    annotations: {
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      readOnlyHint: false,
    },
    creditCost: 0,
    mutationPolicy: 'direct',
    name: 'transform_media',
    title: 'Transform Media',
  },
  {
    annotations: {
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      readOnlyHint: false,
    },
    creditCost: 1,
    mutationPolicy: 'approval-required',
    name: 'create_post',
    title: 'Create Post',
  },
] satisfies ReadonlyArray<
  Pick<
    CanonicalToolDefinition,
    'name' | 'title' | 'annotations' | 'creditCost' | 'mutationPolicy'
  >
>;

const OPEN_WORLD_PRESENTATIONS = [
  {
    annotations: {
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
      readOnlyHint: false,
    },
    creditCost: 0,
    mutationPolicy: 'direct',
    name: 'onboard_brand',
    title: 'Onboard Brand',
    toolset: 'core',
  },
  {
    annotations: {
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
      readOnlyHint: false,
    },
    creditCost: 0,
    mutationPolicy: 'direct',
    name: 'execute_workflow',
    title: 'Execute Workflow',
    toolset: 'workflows',
  },
  {
    annotations: {
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
      readOnlyHint: false,
    },
    creditCost: 1,
    mutationPolicy: 'approval-required',
    name: 'generate_turbo_content',
    title: 'Generate Turbo Content',
    toolset: 'content',
  },
] satisfies ReadonlyArray<
  Pick<
    CanonicalToolDefinition,
    | 'name'
    | 'title'
    | 'annotations'
    | 'creditCost'
    | 'mutationPolicy'
    | 'toolset'
  >
>;

function buildTool(
  overrides: Partial<CanonicalToolDefinition> = {},
): CanonicalToolDefinition {
  return {
    category: 'generation',
    creditCost: 17,
    description: 'Generate a voice clip',
    name: 'generate',
    parameters: {
      properties: { text: { type: 'string' } },
      required: ['text'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: true },
    toolset: 'generation',
    ...overrides,
  };
}

describe('toMcpTools', () => {
  it('advertises an object output schema for every MCP-surfaced action', () => {
    const tools = toMcpTools(getToolsForSurface('mcp'));
    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) {
      expect(tool, tool.name).toHaveProperty(
        'outputSchema',
        expect.objectContaining({
          properties: expect.objectContaining({
            message: { type: 'string' },
          }),
          type: 'object',
        }),
      );
    }
  });

  it('advertises compact result-family schemas instead of every envelope field', () => {
    const tools = toMcpTools(getToolsForSurface('mcp'));
    for (const tool of tools) {
      expect(JSON.stringify(tool.outputSchema).length, tool.name).toBeLessThan(
        180,
      );
    }
    const schema = (name: string) =>
      tools.find((tool) => tool.name === name)?.outputSchema;
    expect(schema('get_account')?.properties.data).toEqual({ type: 'object' });
    expect(schema('find_tools')?.properties).toHaveProperty('toolsets');
    expect(schema('find_tools')?.properties).not.toHaveProperty('artifact');
    expect(schema('generate')?.properties).toHaveProperty('artifact');
    expect(schema('get_account')?.properties).not.toHaveProperty('tools');
  });

  it('emits only MCP-surfaced actions', () => {
    const tools = toMcpTools([
      buildTool(),
      buildTool({
        name: 'prepare_voice_clone',
        surfaces: { agent: true, cliAgentVisible: true, mcp: false },
      }),
    ]);

    expect(tools.map((tool) => tool.name)).toEqual(['generate']);
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

  it('advertises the toolset under the namespaced _meta key', () => {
    const [tool] = toMcpTools([buildTool({ toolset: 'generation' })]);

    expect(MCP_TOOLSET_META_KEY).toBe('genfeed.ai/toolset');
    expect(tool?._meta[MCP_TOOLSET_META_KEY]).toBe('generation');
  });

  it('advertises a toolset for every MCP-surfaced action', () => {
    for (const tool of toMcpTools(getToolsForSurface('mcp'))) {
      expect(tool._meta[MCP_TOOLSET_META_KEY], tool.name).toBeTypeOf('string');
      expect(tool._meta[MCP_TOOLSET_META_KEY], tool.name).not.toBe('');
    }
  });

  it('emits a title and all four hints for every MCP-surfaced action', () => {
    const tools = toMcpTools(getToolsForSurface('mcp'));
    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) {
      expect(tool.title, tool.name).toEqual(expect.any(String));
      expect(tool.title.length, tool.name).toBeGreaterThan(0);
      expect(tool.annotations.readOnlyHint, tool.name).toEqual(
        expect.any(Boolean),
      );
      expect(tool.annotations.destructiveHint, tool.name).toEqual(
        expect.any(Boolean),
      );
      expect(tool.annotations.idempotentHint, tool.name).toEqual(
        expect.any(Boolean),
      );
      expect(tool.annotations.openWorldHint, tool.name).toEqual(
        expect.any(Boolean),
      );
    }
  });

  it.each(AUDITED_PRESENTATIONS)(
    'derives audited presentation for $name when the fixture has not stored it',
    ({ name, creditCost, mutationPolicy, title, annotations }) => {
      const [tool] = toMcpTools([
        buildTool({ creditCost, mutationPolicy, name }),
      ]);
      expect(tool?.title).toBe(title);
      expect(tool?.annotations).toEqual(annotations);
    },
  );

  it.each(OPEN_WORLD_PRESENTATIONS)(
    'derives external presentation for $name without stored presentation',
    ({ name, creditCost, mutationPolicy, toolset, title, annotations }) => {
      const [tool] = toMcpTools([
        buildTool({ creditCost, mutationPolicy, name, toolset }),
      ]);
      expect(tool?.title).toBe(title);
      expect(tool?.annotations).toEqual(annotations);
    },
  );

  it('preserves supplied presentation over derived fallback', () => {
    const annotations = {
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
      readOnlyHint: true,
    } satisfies NonNullable<CanonicalToolDefinition['annotations']>;
    const [tool] = toMcpTools([
      buildTool({
        annotations,
        name: 'onboard_brand',
        title: 'Stored presentation',
      }),
    ]);
    expect(tool?.title).toBe('Stored presentation');
    expect(tool?.annotations).toEqual(annotations);
  });
});
