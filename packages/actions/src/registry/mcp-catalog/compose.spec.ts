import { describe, expect, it } from 'vitest';
import type { SourceTool } from '../../interfaces/source-tool.interface';
import { composeMcpCatalogTool } from './compose';

function source(overrides: Partial<SourceTool> & { name: string }): SourceTool {
  return {
    creditCost: 0,
    description: 'Original tool.',
    parameters: { properties: {}, type: 'object' },
    requiredRole: 'user',
    ...overrides,
  };
}

const READ = source({
  name: 'get_thing',
  parameters: { properties: { limit: { type: 'number' } }, type: 'object' },
});
const WRITE = source({
  name: 'save_thing',
  parameters: {
    properties: { label: { type: 'string' }, secret: { type: 'string' } },
    required: ['label', 'secret'],
    type: 'object',
  },
  mcpHiddenParameters: ['secret'],
  requiredRole: 'admin',
});
const SOURCES = new Map([READ, WRITE].map((tool) => [tool.name, tool]));
const SPEC = {
  description: 'Work with things.',
  name: 'manage_things',
  operations: [
    { action: 'list', executes: 'get_thing' },
    { action: 'save', executes: 'save_thing' },
  ],
} as const;

describe('composeMcpCatalogTool', () => {
  const tool = composeMcpCatalogTool(SPEC, SOURCES);

  it('lists each original tool schema once, as an input the action can take', () => {
    expect(tool.parameters.properties.input).toMatchObject({
      anyOf: [
        READ.parameters,
        {
          properties: { label: { type: 'string' } },
          required: ['label'],
          type: 'object',
        },
      ],
    });
    expect(tool.parameters.oneOf).toBeUndefined();
  });

  it('summarises each action from the first sentence of its original description', () => {
    const composed = composeMcpCatalogTool(SPEC, {
      get: (name: string) =>
        name === 'get_thing'
          ? { ...READ, description: 'Read things. Second sentence.' }
          : { ...WRITE, mcpDescription: 'Save a thing. More.' },
    } as unknown as ReadonlyMap<string, SourceTool>);
    expect(composed.parameters.properties.action).toMatchObject({
      description: 'list: Read things. save: Save a thing.',
    });
  });

  it('closes the envelope and requires input only when every action needs it', () => {
    expect(tool.parameters.additionalProperties).toBe(false);
    expect(tool.parameters.properties.action).toMatchObject({
      enum: ['list', 'save'],
      type: 'string',
    });
    expect(tool.parameters.required).toEqual(['action']);
    expect(
      composeMcpCatalogTool(
        { ...SPEC, operations: [SPEC.operations[1]] },
        SOURCES,
      ).parameters.required,
    ).toEqual(['action', 'input']);
  });

  it('takes the lowest role that can reach any action', () => {
    expect(tool.requiredRole).toBe('user');
    expect(
      composeMcpCatalogTool(
        { ...SPEC, operations: [SPEC.operations[1]] },
        SOURCES,
      ).requiredRole,
    ).toBe('admin');
  });

  it('keeps the description it is declared with', () => {
    expect(tool.description).toBe('Work with things.');
  });

  it('refuses an action that runs an unknown tool', () => {
    expect(() =>
      composeMcpCatalogTool(
        {
          ...SPEC,
          operations: [{ action: 'gone', executes: 'missing_tool' }],
        },
        SOURCES,
      ),
    ).toThrow('runs unknown tool missing_tool');
  });
});
