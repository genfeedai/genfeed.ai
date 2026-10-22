import type {
  McpCatalogAlias,
  McpCatalogOperation,
  ResolvedMcpCatalogCall,
} from '../interfaces/mcp-catalog-call.interface';
import type { CanonicalToolDefinition } from '../interfaces/tool-definition.interface';

/** One intentional catalog release; independent of application releases. */
export const MCP_CATALOG_REVISION = 1;

const OPERATIONS = Object.freeze([
  Object.freeze({
    canonicalName: 'check_channel',
    action: 'capabilities',
    executionName: 'get_scheduler_capabilities',
  } as const),
  Object.freeze({
    canonicalName: 'check_channel',
    action: 'validate',
    executionName: 'validate_scheduler_target',
  } as const),
  Object.freeze({
    canonicalName: 'upload_media',
    action: 'request',
    executionName: 'request_media_upload',
  } as const),
  Object.freeze({
    canonicalName: 'upload_media',
    action: 'complete',
    executionName: 'complete_media_upload',
  } as const),
] satisfies readonly McpCatalogOperation[]);

const ALIASES: readonly McpCatalogAlias[] = OPERATIONS.map((operation) =>
  Object.freeze({
    ...operation,
    name: operation.executionName,
    introducedRevision: 1,
    retiredRevision: 2,
  }),
);

export function getMcpCatalogAlias(name: string): McpCatalogAlias | undefined {
  return ALIASES.find((alias) => alias.name === name);
}

export function getMcpCatalogOperations(
  name: string,
): readonly McpCatalogOperation[] {
  return OPERATIONS.filter((operation) => operation.canonicalName === name);
}

/** Presentation only. Never use list membership to authorize invocation. */
export function isMcpListedToolName(name: string): boolean {
  return getMcpCatalogAlias(name) === undefined;
}

function isPlainInput(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

export function resolveMcpCatalogCall(
  name: string,
  args: Record<string, unknown>,
  revision: number = MCP_CATALOG_REVISION,
): ResolvedMcpCatalogCall | null {
  const alias = getMcpCatalogAlias(name);
  if (alias) {
    if (
      revision < alias.introducedRevision ||
      revision >= alias.retiredRevision
    ) {
      throw new Error(
        `Tool ${name} is unavailable in MCP catalog revision ${revision}. Use ${alias.canonicalName}(action=${alias.action}).`,
      );
    }
    return { ...alias, requestedName: name, arguments: args, alias };
  }
  const operations = getMcpCatalogOperations(name);
  if (operations.length === 0) return null;
  if (Object.keys(args).some((key) => key !== 'action' && key !== 'input')) {
    throw new Error(`${name} accepts only action and input.`);
  }
  const operation = operations.find(
    (candidate) => candidate.action === args.action,
  );
  if (!operation) throw new Error(`Invalid ${name} action.`);
  const input =
    args.input === undefined && operation.action === 'capabilities'
      ? {}
      : args.input;
  if (!isPlainInput(input)) throw new Error(`${name} input must be an object.`);
  return { ...operation, requestedName: name, arguments: input };
}

export function validateMcpCatalogBindings(
  definitions: readonly CanonicalToolDefinition[],
  classify: (name: string) => string,
  operations: readonly McpCatalogOperation[] = OPERATIONS,
  aliases: readonly McpCatalogAlias[] = ALIASES,
): void {
  const byName = new Map(definitions.map((tool) => [tool.name, tool]));
  const executionNames = new Set<string>();
  const triples = new Set<string>();
  const kinds = new Map<string, string>();
  const canonicalNames = new Set<string>(
    operations.map((operation) => operation.canonicalName),
  );
  for (const operation of operations) {
    const triple = `${operation.canonicalName}:${operation.action}`;
    if (
      !OPERATIONS.some(
        (expected) =>
          expected.canonicalName === operation.canonicalName &&
          expected.action === operation.action &&
          expected.executionName === operation.executionName,
      )
    )
      throw new Error(`Unreviewed MCP catalog operation: ${triple}`);
    if (
      triples.has(triple) ||
      executionNames.has(operation.executionName) ||
      canonicalNames.has(operation.executionName)
    ) {
      throw new Error(`Invalid MCP catalog binding: ${triple}`);
    }
    triples.add(triple);
    executionNames.add(operation.executionName);
    const canonical = byName.get(operation.canonicalName);
    const target = byName.get(operation.executionName);
    if (
      !canonical?.surfaces.mcp ||
      !target?.surfaces.mcp ||
      canonical.surfaces.agent ||
      canonical.requiredRole !== 'user' ||
      target.requiredRole !== 'user' ||
      canonical.creditCost !== 0 ||
      target.creditCost !== 0 ||
      canonical.creditPricing?.mode !== 'fixed' ||
      canonical.creditPricing.amount !== 0 ||
      target.creditPricing?.mode !== 'fixed' ||
      target.creditPricing.amount !== 0 ||
      canonical.mutationPolicy !==
        (operation.canonicalName === 'upload_media' ? 'direct' : undefined) ||
      canonical.mutationPolicy !== target.mutationPolicy ||
      !canonical.annotations ||
      !target.annotations ||
      canonical.annotations.readOnlyHint !==
        (operation.canonicalName === 'check_channel') ||
      canonical.annotations.idempotentHint !==
        (operation.canonicalName === 'check_channel') ||
      canonical.annotations.destructiveHint !== false ||
      canonical.annotations.openWorldHint !== false ||
      (
        [
          'readOnlyHint',
          'idempotentHint',
          'destructiveHint',
          'openWorldHint',
        ] as const
      ).some(
        (key) => canonical.annotations?.[key] !== target.annotations?.[key],
      )
    ) {
      throw new Error(`MCP catalog target policy drift: ${triple}`);
    }
    const kind = classify(operation.executionName);
    if (
      kind === 'unknown' ||
      (kinds.has(operation.canonicalName) &&
        kinds.get(operation.canonicalName) !== kind)
    ) {
      throw new Error(`MCP catalog executor drift: ${triple}`);
    }
    kinds.set(operation.canonicalName, kind);
  }
  const aliasNames = new Set<string>();
  for (const alias of aliases) {
    if (
      aliasNames.has(alias.name) ||
      canonicalNames.has(alias.name) ||
      alias.name !== alias.executionName ||
      !operations.some(
        (operation) =>
          operation.canonicalName === alias.canonicalName &&
          operation.action === alias.action &&
          operation.executionName === alias.executionName,
      ) ||
      alias.introducedRevision !== 1 ||
      alias.retiredRevision !== 2
    ) {
      throw new Error(`Invalid MCP catalog alias: ${alias.name}`);
    }
    aliasNames.add(alias.name);
  }
  if (operations.length !== 4 || aliases.length !== 4)
    throw new Error('Incomplete MCP catalog bindings.');
}
