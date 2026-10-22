import { describe, expect, it } from 'vitest';
import { toMcpTools } from '../adapters/to-mcp-tool';
import { materializeJsonDocumentSchema } from './contracts/schema-builders';
import {
  getMcpCatalogAlias,
  getMcpCatalogOperations,
  isMcpListedToolName,
  resolveMcpCatalogCall,
  validateMcpCatalogBindings,
} from './mcp-catalog-calls';
import { ALL_TOOLS, getToolByName, getToolsForSurface } from './tool-registry';

const names = ['check_channel', 'upload_media'];
const operations = names.flatMap(getMcpCatalogOperations);
const aliases = operations.flatMap((operation) => {
  const alias = getMcpCatalogAlias(operation.executionName);
  return alias ? [alias] : [];
});
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
      const legacy = resolveMcpCatalogCall(operation.executionName, input);
      expect(canonical).toMatchObject({ ...operation, arguments: input });
      expect(legacy).toMatchObject({ ...operation, arguments: input });
      expect(canonical?.arguments).toBe(input);
      expect(legacy?.arguments).toBe(input);
      const wrapper = getToolByName(operation.canonicalName);
      const original = getToolByName(operation.executionName);
      const branch = wrapper?.parameters.oneOf?.find((candidate) =>
        JSON.stringify(candidate).includes(`"${operation.action}"`),
      );
      const properties = branch?.properties;
      expect(properties).toBeDefined();
      if (
        !properties ||
        typeof properties !== 'object' ||
        !('input' in properties) ||
        !properties.input ||
        typeof properties.input !== 'object'
      )
        throw new Error('Missing input branch');
      expect(
        withoutDocumentation({
          ...materializeJsonDocumentSchema(properties.input),
          ...(original?.parameters.$defs
            ? { $defs: wrapper?.parameters.$defs }
            : {}),
        }),
      ).toEqual(withoutDocumentation(original?.parameters));
      expect(wrapper?.parameters.additionalProperties).toBe(false);
    },
  );

  it.each(aliases)('enforces code-owned revision window for $name', (alias) => {
    expect(resolveMcpCatalogCall(alias.name, {}, 1)?.alias).toEqual(alias);
    for (const revision of [0, 2])
      expect(() => resolveMcpCatalogCall(alias.name, {}, revision)).toThrow(
        `${alias.canonicalName}(action=${alias.action})`,
      );
    expect(getMcpCatalogAlias(alias.name)).toBe(alias);
    expect(isMcpListedToolName(alias.name)).toBe(false);
  });

  it('defaults only capabilities input and preserves unrelated calls', () => {
    expect(
      resolveMcpCatalogCall('check_channel', { action: 'capabilities' })
        ?.arguments,
    ).toEqual({});
    expect(resolveMcpCatalogCall('get_posts', {})).toBeNull();
    expect(getMcpCatalogOperations('get_posts')).toEqual([]);
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

  it.each(['request', 'complete'])('requires upload %s input', (action) => {
    for (const input of [undefined, null, [], 1])
      expect(() =>
        resolveMcpCatalogCall('upload_media', { action, input }),
      ).toThrow();
  });

  it('never projects legacy aliases even when passed the entire raw catalog', () => {
    const listed = toMcpTools(ALL_TOOLS).map((tool) => tool.name);
    expect(listed).toHaveLength(143);
    expect(listed).toEqual(getToolsForSurface('mcp').map((tool) => tool.name));
    for (const alias of aliases) expect(listed).not.toContain(alias.name);
  });

  it('validates real definitions and rejects executor, role, pricing, surface and annotation drift', () => {
    expect(() => validateMcpCatalogBindings(ALL_TOOLS, classify)).not.toThrow();
    expect(() =>
      validateMcpCatalogBindings(ALL_TOOLS, () => 'unknown'),
    ).toThrow('executor drift');
    expect(() => validateMcpCatalogBindings(ALL_TOOLS, (name) => name)).toThrow(
      'executor drift',
    );
    for (const name of [...names, ...aliases.map((alias) => alias.name)]) {
      for (const change of [
        { requiredRole: 'admin' as const },
        { creditCost: 1 },
        { creditPricing: { mode: 'fixed' as const, amount: 1 } },
        { surfaces: { agent: false, cliAgentVisible: false, mcp: false } },
        { mutationPolicy: 'approval-required' as const },
        {
          annotations: {
            readOnlyHint: true,
            destructiveHint: true,
            idempotentHint: false,
            openWorldHint: true,
          },
        },
      ])
        expect(() =>
          validateMcpCatalogBindings(
            ALL_TOOLS.map((tool) =>
              tool.name === name ? { ...tool, ...change } : tool,
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
  });

  it('rejects duplicate, incomplete, self, missing and two-hop fixture bindings', () => {
    expect(() =>
      validateMcpCatalogBindings(
        ALL_TOOLS,
        classify,
        [...operations, operations[0]],
        aliases,
      ),
    ).toThrow();
    expect(() =>
      validateMcpCatalogBindings(ALL_TOOLS, classify, operations, [
        ...aliases,
        aliases[0],
      ]),
    ).toThrow();
    expect(() =>
      validateMcpCatalogBindings(
        ALL_TOOLS,
        classify,
        operations.slice(1),
        aliases,
      ),
    ).toThrow();
    expect(() =>
      validateMcpCatalogBindings(
        ALL_TOOLS,
        classify,
        operations,
        aliases.slice(1),
      ),
    ).toThrow();
    const badOperations = structuredClone(operations);
    Object.assign(badOperations[0], { executionName: 'check_channel' });
    expect(() =>
      validateMcpCatalogBindings(ALL_TOOLS, classify, badOperations, aliases),
    ).toThrow();
    const badAliases = structuredClone(aliases);
    Object.assign(badAliases[0], { name: 'upload_media' });
    expect(() =>
      validateMcpCatalogBindings(ALL_TOOLS, classify, operations, badAliases),
    ).toThrow();
  });
});
