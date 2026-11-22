import type {
  McpCatalogOperation,
  ResolvedMcpCatalogCall,
} from '../interfaces/mcp-catalog-call.interface';
import type { CanonicalToolDefinition } from '../interfaces/tool-definition.interface';
import { MCP_CATALOG_TOOLS } from './mcp-catalog/catalog';
import { deriveMcpCatalogPolicy } from './mcp-catalog/derive';
import { createRetiredReferenceRewriter } from './mcp-catalog/references';
import { McpToolInputError } from './mcp-tool-input-error';

const OPERATIONS: readonly McpCatalogOperation[] = Object.freeze(
  MCP_CATALOG_TOOLS.flatMap((tool) =>
    tool.operations.map((operation) =>
      Object.freeze({
        action: operation.action,
        canonicalName: tool.name,
        executionName: operation.executes,
      }),
    ),
  ),
);

const OPERATION_BY_EXECUTION_NAME: ReadonlyMap<string, McpCatalogOperation> =
  new Map(OPERATIONS.map((operation) => [operation.executionName, operation]));

/** Replaces each retired tool name in MCP-visible text with the call that runs it. */
export const rewriteRetiredMcpReferences =
  createRetiredReferenceRewriter(OPERATIONS);

export function getRetiredMcpCatalogTool(
  name: string,
): McpCatalogOperation | undefined {
  return OPERATION_BY_EXECUTION_NAME.get(name);
}

/** The merged tools, each listing several original tools as actions. */
export const MCP_CATALOG_TOOL_NAMES: readonly string[] = Object.freeze(
  MCP_CATALOG_TOOLS.map((tool) => tool.name),
);

export function isMcpCatalogToolName(name: string): boolean {
  return MCP_CATALOG_TOOL_NAMES.includes(name);
}

export function getMcpCatalogOperations(
  name: string,
): readonly McpCatalogOperation[] {
  return OPERATIONS.filter((operation) => operation.canonicalName === name);
}

/** Presentation only. Never use list membership to authorize invocation. */
export function isMcpListedToolName(name: string): boolean {
  return getRetiredMcpCatalogTool(name) === undefined;
}

/** The call that replaces a retired tool name, as a caller writes it. */
export function mcpCatalogReplacement(operation: McpCatalogOperation): string {
  return `${operation.canonicalName}(action=${operation.action})`;
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

function actionList(operations: readonly McpCatalogOperation[]): string {
  return operations.map((operation) => operation.action).join(', ');
}

function unknownActionMessage(
  name: string,
  action: unknown,
  operations: readonly McpCatalogOperation[],
): string {
  const given =
    typeof action === 'string' && action.length <= 60
      ? `"${action}" is not an action of ${name}.`
      : `${name} needs an action.`;
  return `${given} Use one of: ${actionList(operations)}.`;
}

/**
 * Resolves a call to a merged tool into the original tool it runs, or throws
 * for a retired name or a malformed envelope. `isInputRequired` says whether
 * the original tool has a required field; an action whose tool has none may
 * omit `input`. Kept as a hook so this module stays free of the registry.
 */
export function resolveMcpCatalogCall(
  name: string,
  args: Record<string, unknown>,
  isInputRequired: (executionName: string) => boolean = () => true,
): ResolvedMcpCatalogCall | null {
  const retired = getRetiredMcpCatalogTool(name);
  if (retired) {
    throw new McpToolInputError(
      `Tool ${name} has been removed from MCP. Use ${mcpCatalogReplacement(retired)}.`,
    );
  }
  const operations = getMcpCatalogOperations(name);
  if (operations.length === 0) return null;
  const strayKeys = Object.keys(args).filter(
    (key) => key !== 'action' && key !== 'input',
  );
  if (strayKeys.length > 0) {
    throw new McpToolInputError(
      `${name} accepts only action and input, not ${strayKeys.join(', ')}. Put the fields of the action inside input: ${name}(action=<one of ${actionList(operations)}>, input={...}).`,
      strayKeys[0],
    );
  }
  const operation = operations.find(
    (candidate) => candidate.action === args.action,
  );
  if (!operation) {
    throw new McpToolInputError(
      unknownActionMessage(name, args.action, operations),
      'action',
    );
  }
  const input =
    args.input === undefined && !isInputRequired(operation.executionName)
      ? {}
      : args.input;
  if (!isPlainInput(input)) {
    throw new McpToolInputError(`${name} input must be an object.`, 'input');
  }
  return { ...operation, requestedName: name, arguments: input };
}

/**
 * Boot-time check that every merged tool is still what its table says: each
 * action runs a real MCP tool that is not itself merged, no tool is run by two
 * actions, and the merged tool's listing policy still equals the policy derived
 * from the tools it runs. A drifted definition fails boot rather than listing a
 * tool that gates, prices or annotates differently from what it executes.
 */
export function validateMcpCatalogBindings(
  definitions: readonly CanonicalToolDefinition[],
  classify: (name: string) => string,
  operations: readonly McpCatalogOperation[] = OPERATIONS,
): void {
  const byName = new Map<string, CanonicalToolDefinition>(
    definitions.map((tool) => [tool.name, tool]),
  );
  const canonicalNames = new Set(
    operations.map((operation) => operation.canonicalName),
  );
  const executionNames = new Set<string>();
  const triples = new Set<string>();
  const targetsByCanonical = new Map<string, CanonicalToolDefinition[]>();

  for (const operation of operations) {
    const triple = `${operation.canonicalName}:${operation.action}`;
    if (
      triples.has(triple) ||
      executionNames.has(operation.executionName) ||
      canonicalNames.has(operation.executionName)
    ) {
      throw new Error(`Invalid MCP catalog binding: ${triple}`);
    }
    triples.add(triple);
    executionNames.add(operation.executionName);
    const target = byName.get(operation.executionName);
    if (
      !byName.get(operation.canonicalName)?.surfaces.mcp ||
      !target?.surfaces.mcp
    ) {
      throw new Error(`MCP catalog target policy drift: ${triple}`);
    }
    if (classify(operation.executionName) === 'unknown') {
      throw new Error(`MCP catalog executor drift: ${triple}`);
    }
    targetsByCanonical.set(operation.canonicalName, [
      ...(targetsByCanonical.get(operation.canonicalName) ?? []),
      target,
    ]);
  }

  for (const [canonicalName, targets] of targetsByCanonical) {
    const canonical = byName.get(canonicalName);
    const expected = deriveMcpCatalogPolicy(targets);
    if (
      !canonical ||
      canonical.surfaces.agent ||
      canonical.requiredRole !== expected.requiredRole ||
      canonical.creditCost !== expected.creditCost ||
      canonical.dataSource !== expected.dataSource ||
      canonical.mutationPolicy !== expected.mutationPolicy ||
      JSON.stringify(canonical.creditPricing) !==
        JSON.stringify(expected.creditPricing) ||
      JSON.stringify(canonical.annotations) !==
        JSON.stringify(expected.annotations)
    ) {
      throw new Error(`MCP catalog target policy drift: ${canonicalName}`);
    }
  }
  if (operations.length !== OPERATIONS.length) {
    throw new Error('Incomplete MCP catalog bindings.');
  }
}
