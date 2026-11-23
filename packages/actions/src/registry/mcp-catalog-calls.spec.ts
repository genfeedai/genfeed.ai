import { describe, expect, it } from 'vitest';
import { toMcpTools } from '../adapters/to-mcp-tool';
import { materializeJsonDocumentSchema } from './contracts/schema-builders';
import {
  getMcpCatalogOperations,
  getRetiredMcpCatalogTool,
  isMcpListedToolName,
  resolveMcpCatalogCall,
  validateMcpCatalogBindings,
} from './mcp-catalog-calls';
import { McpToolInputError } from './mcp-tool-input-error';
import { ALL_TOOLS, getToolByName, getToolsForSurface } from './tool-registry';

const names = ['check_channel', 'upload_media'];
const operations = names.flatMap(getMcpCatalogOperations);
const isInputRequired = (executionName: string) =>
  (getToolByName(executionName)?.parameters.required?.length ?? 0) > 0;
const classify = (name: string) =>
  name.includes('scheduler') ? 'scheduler' : 'agent-executor';
function withoutDocumentation(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutDocumentation);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== 'description')
        .map(([key, nested]) => [key, withoutDocumentation(nested)]),
    );
  return value;
}

describe('MCP catalog bindings', () => {
  it.each(operations)(
    'binds $canonicalName $action to its original input and exact schema',
    (operation) => {
      const input = {
        action: 'cannot override fixed operation',
        platform: 'youtube',
        assetId: 'asset',
      };
      const canonical = resolveMcpCatalogCall(operation.canonicalName, {
        action: operation.action,
        input,
      });
      expect(canonical).toMatchObject({ ...operation, arguments: input });
      expect(canonical?.arguments).toBe(input);
      const wrapper = getToolByName(operation.canonicalName);
      const original = getToolByName(operation.executionName);
      const accepted = wrapper?.parameters.properties.input;
      if (!accepted || typeof accepted !== 'object' || !('anyOf' in accepted))
        throw new Error('Missing input schema');
      expect(wrapper?.parameters.properties.action).toMatchObject({
        enum: expect.arrayContaining([operation.action]),
      });
      expect(
        (accepted.anyOf as unknown[]).map((schema) =>
          withoutDocumentation({
            ...materializeJsonDocumentSchema(schema as never),
            ...(original?.parameters.$defs
              ? { $defs: wrapper?.parameters.$defs }
              : {}),
          }),
        ),
      ).toContainEqual(withoutDocumentation(original?.parameters));
      expect(wrapper?.parameters.additionalProperties).toBe(false);
    },
  );

  it.each(operations)(
    'rejects retired $executionName immediately',
    (operation) => {
      expect(() => resolveMcpCatalogCall(operation.executionName, {})).toThrow(
        `${operation.canonicalName}(action=${operation.action})`,
      );
      expect(getRetiredMcpCatalogTool(operation.executionName)).toEqual(
        operation,
      );
      expect(isMcpListedToolName(operation.executionName)).toBe(false);
    },
  );

  it('defaults input only for an action whose original tool has no required field', () => {
    expect(
      resolveMcpCatalogCall(
        'check_channel',
        { action: 'capabilities' },
        isInputRequired,
      )?.arguments,
    ).toEqual({});
    expect(() =>
      resolveMcpCatalogCall(
        'check_channel',
        { action: 'validate' },
        isInputRequired,
      ),
    ).toThrow('input must be an object');
    expect(() =>
      resolveMcpCatalogCall('check_channel', { action: 'capabilities' }),
    ).toThrow('input must be an object');
    expect(resolveMcpCatalogCall('get_assets', {})).toBeNull();
    expect(getMcpCatalogOperations('get_assets')).toEqual([]);
  });

  it.each([
    {},
    { action: 'unknown' },
    { action: 1 },
    { action: 'validate' },
    { action: 'capabilities', extra: true },
    { action: 'validate', input: null },
    { action: 'capabilities', input: [] },
    { action: 'capabilities', input: 'x' },
  ])('rejects invalid new envelope before execution: %j', (args) => {
    expect(() => resolveMcpCatalogCall('check_channel', args)).toThrow();
  });

  it.each([
    [
      'get_context',
      { action: 'account', brandId: 'b1', input: {} },
      'get_context accepts only action and input, not brandId. Put the fields of the action inside input: get_context(action=<one of ',
      'brandId',
    ],
    [
      'get_content',
      { action: 'post' },
      '"post" is not an action of get_content. Use one of: posts, release, articles, article_preview.',
      'action',
    ],
    [
      'get_content',
      {},
      'get_content needs an action. Use one of: posts, release, articles, article_preview.',
      'action',
    ],
  ])('tells the caller how to repair %s %j', (name, args, message, field) => {
    let caught: unknown;
    try {
      resolveMcpCatalogCall(name, args);
    } catch (error: unknown) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(McpToolInputError);
    expect((caught as McpToolInputError).message).toContain(message);
    expect((caught as McpToolInputError).field).toBe(field);
  });

  it.each(['request', 'complete'])('requires upload %s input', (action) => {
    for (const input of [undefined, null, [], 1])
      expect(() =>
        resolveMcpCatalogCall('upload_media', { action, input }),
      ).toThrow();
  });

  it('never projects retired names even when passed the entire raw catalog', () => {
    const listed = toMcpTools(ALL_TOOLS).map((tool) => tool.name);
    expect(listed).toEqual(getToolsForSurface('mcp').map((tool) => tool.name));
    for (const operation of operations)
      expect(listed).not.toContain(operation.executionName);
  });

  it('validates real definitions and rejects executor, role, pricing, surface and annotation drift', () => {
    expect(() => validateMcpCatalogBindings(ALL_TOOLS, classify)).not.toThrow();
    expect(() =>
      validateMcpCatalogBindings(ALL_TOOLS, () => 'unknown'),
    ).toThrow('executor drift');
    const changes = [
      { requiredRole: 'admin' as const },
      { creditCost: 1 },
      { creditPricing: { mode: 'fixed' as const, amount: 1 } },
      { mutationPolicy: 'approval-required' as const },
      {
        annotations: {
          readOnlyHint: true,
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: true,
        },
      },
    ];
    for (const canonicalName of names) {
      const executed = getMcpCatalogOperations(canonicalName).map(
        (operation) => operation.executionName,
      );
      for (const change of changes) {
        // The merged tool drifting from its own table.
        expect(() =>
          validateMcpCatalogBindings(
            ALL_TOOLS.map((tool) =>
              tool.name === canonicalName ? { ...tool, ...change } : tool,
            ),
            classify,
          ),
        ).toThrow('policy drift');
        // Every action's tool changing underneath it.
        expect(() =>
          validateMcpCatalogBindings(
            ALL_TOOLS.map((tool) =>
              executed.includes(tool.name) ? { ...tool, ...change } : tool,
            ),
            classify,
          ),
        ).toThrow('policy drift');
      }
      for (const name of [canonicalName, ...executed]) {
        expect(() =>
          validateMcpCatalogBindings(
            ALL_TOOLS.map((tool) =>
              tool.name === name
                ? {
                    ...tool,
                    surfaces: {
                      agent: false,
                      cliAgentVisible: false,
                      mcp: false,
                    },
                  }
                : tool,
            ),
            classify,
          ),
        ).toThrow('policy drift');
        expect(() =>
          validateMcpCatalogBindings(
            ALL_TOOLS.filter((tool) => tool.name !== name),
            classify,
          ),
        ).toThrow();
      }
    }
  });

  it('rejects duplicate, incomplete, self, missing and two-hop fixture bindings', () => {
    expect(() =>
      validateMcpCatalogBindings(ALL_TOOLS, classify, [
        ...operations,
        operations[0],
      ]),
    ).toThrow();
    expect(() =>
      validateMcpCatalogBindings(ALL_TOOLS, classify, operations.slice(1)),
    ).toThrow();
    for (const executionName of ['check_channel', 'upload_media', 'missing']) {
      const invalid = structuredClone(operations);
      Object.assign(invalid[0], { executionName });
      expect(() =>
        validateMcpCatalogBindings(ALL_TOOLS, classify, invalid),
      ).toThrow();
    }
  });
});
