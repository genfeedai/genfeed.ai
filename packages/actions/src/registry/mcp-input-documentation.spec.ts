import { describe, expect, it } from 'vitest';
import { toMcpTools } from '../adapters/to-mcp-tool';
import type { ToolParameterSchema } from '../interfaces/tool-definition.interface';
import { compactMcpInputDocumentation } from './mcp-input-documentation';
import { getToolByName, getToolsForSurface } from './tool-registry';

describe('MCP input documentation', () => {
  const original = 'Social conversation id';
  const concise = 'Conversation ID.';

  it('preserves unknown parameter wording rather than replacing new guidance', () => {
    const changed = 'Read account profile only after onboarding is complete.';
    const parameters: ToolParameterSchema = {
      type: 'object',
      properties: { topic: { type: 'string', description: changed } },
    };
    expect(compactMcpInputDocumentation(parameters)).toEqual(parameters);
  });

  it('changes only schema documentation, including nested definitions and alternatives', () => {
    const literal = { description: original };
    const parameters: ToolParameterSchema = {
      type: 'object',
      required: ['description'],
      additionalProperties: false,
      $defs: { entry: { type: 'string', description: original, minLength: 1 } },
      oneOf: [
        {
          properties: { description: { description: original } },
          required: ['description'],
        },
      ],
      properties: {
        description: {
          type: 'string',
          description: original,
          enum: [original],
          default: original,
          minLength: 1,
        },
        payload: {
          type: 'object',
          description: original,
          const: literal,
          default: literal,
          enum: [literal],
          examples: [literal],
          properties: {
            description: { type: 'string', description: original },
          },
        },
        entries: {
          type: 'array',
          maxItems: 3,
          uniqueItems: true,
          items: {
            anyOf: [
              { $ref: '#/$defs/entry' },
              { type: 'string', description: original },
            ],
          },
        },
        attributes: {
          type: 'object',
          additionalProperties: { type: 'string', description: original },
          patternProperties: { '^x': { description: original } },
        },
      },
    };
    const before = structuredClone(parameters);
    const compact = compactMcpInputDocumentation(parameters);
    expect(parameters).toEqual(before);
    expect(compact).toEqual({
      ...parameters,
      $defs: { entry: { type: 'string', description: concise, minLength: 1 } },
      oneOf: [
        {
          properties: { description: { description: concise } },
          required: ['description'],
        },
      ],
      properties: {
        description: {
          type: 'string',
          description: concise,
          enum: [original],
          default: original,
          minLength: 1,
        },
        payload: {
          type: 'object',
          description: concise,
          const: literal,
          default: literal,
          enum: [literal],
          examples: [literal],
          properties: { description: { type: 'string', description: concise } },
        },
        entries: {
          type: 'array',
          maxItems: 3,
          uniqueItems: true,
          items: {
            anyOf: [
              { $ref: '#/$defs/entry' },
              { type: 'string', description: concise },
            ],
          },
        },
        attributes: {
          type: 'object',
          additionalProperties: { type: 'string', description: concise },
          patternProperties: { '^x': { description: concise } },
        },
      },
    });
  });

  it('removes only reviewed field-name repetition, preserving literal data and property names', () => {
    const parameters: ToolParameterSchema = {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: 'Natural-language description.',
          minLength: 1,
        },
        type: {
          type: 'string',
          enum: ['image', 'video'],
          description: 'Asset to generate.',
        },
        payload: { const: { description: 'Asset to generate.' } },
      },
    };
    expect(compactMcpInputDocumentation(parameters)).toEqual({
      type: 'object',
      properties: {
        description: { type: 'string', minLength: 1 },
        type: { type: 'string', enum: ['image', 'video'] },
        payload: { const: { description: 'Asset to generate.' } },
      },
    });
  });

  it('leaves canonical agent/CLI definitions unchanged and emits every MCP tool in order', () => {
    const canonical = getToolsForSurface('mcp');
    const before = structuredClone(canonical);
    const compact = toMcpTools(canonical);
    expect(canonical).toEqual(before);
    expect(compact.map(({ name }) => name)).toEqual(
      canonical.map(({ name }) => name),
    );
    expect(toMcpTools(canonical)).toEqual(compact);
  });

  it('retains standalone generation consent, pricing, receipts and brand guidance', () => {
    const tools = toMcpTools(getToolsForSurface('mcp'));
    const tool = (name: string) => {
      const match = tools.find((entry) => entry.name === name);
      if (!match) throw new Error(`Missing tool: ${name}`);
      return match;
    };
    expect(tool('generate').description).toMatch(
      /resolved model-specific quote and confirmation/,
    );
    expect(tool('generate').description).toMatch(
      /Unresolved quotes never mean free/,
    );
    expect(tool('generate').description).toMatch(
      /generationHarness exact submitted prompt/,
    );
    expect(tool('generate').description).toMatch(
      /Variable cost: .* credits per generation/,
    );
    expect(tool('generate').description).toContain(
      'brandId is required: call get_brands',
    );
    expect(tool('generate').inputSchema.properties.brandMode).toMatchObject({
      description: expect.stringContaining(
        'Only after explicit user choice; never as fallback',
      ),
    });
    expect(tool('generate_turbo_content').description).toContain(
      'spends only after approval',
    );
    expect(tool('transform_media').description).toContain(
      'Never enhance/rewrite instructions',
    );
    expect(tool('transform_media').description).toContain('FLUX.3: one output');
    expect(tool('transform_media').description).toContain(
      'local merge is free',
    );
    expect(tool('get_generation_options').description).toContain(
      'never charges, reprices or authorizes',
    );
    expect(tool('get_generation_options').description).toContain(
      'balance null; 0 means empty',
    );
    expect(tool('resolve_approval').description).toContain('Owners/admins');
    expect(tool('control_scheduled_release').description).toContain(
      'All actions require server-enforced approval',
    );
    expect(tool('update_scheduled_release').description).toContain(
      'Live-content changes may update public posts',
    );
  });
});

it.each([
  'create_scheduled_release',
  'update_scheduled_release',
  'control_scheduled_release',
])('shows the shorter scheduler guidance for %s on MCP', (name) => {
  const tool = getToolByName(name);
  if (!tool) throw new Error('Missing scheduler tool');
  const [mcp] = toMcpTools([tool]);
  expect(mcp.description).toContain('check_channel(action=validate)');
  expect(mcp.description).not.toContain('validate_scheduler_target');
  expect(mcp.description.length).toBeLessThan(tool.description.length);
});

it('declares MCP wording only where it is shorter than the canonical description', () => {
  const longer = getToolsForSurface('mcp')
    .filter(
      (tool) =>
        tool.mcpDescription !== undefined &&
        tool.mcpDescription.length >= tool.description.length,
    )
    .map((tool) => tool.name);

  expect(longer).toEqual([]);
});
