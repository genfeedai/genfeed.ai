import type { McpCatalogOperation } from '../../interfaces/mcp-catalog-call.interface';

/**
 * Text written for the agent surface names original tools (`get_brands`).
 * MCP callers cannot call those names, so the listing says what to call
 * instead: `get_context(action=brands)`.
 */
export function createRetiredReferenceRewriter(
  operations: readonly McpCatalogOperation[],
): (text: string) => string {
  const replacements = new Map(
    operations.map((operation) => [
      operation.executionName,
      `${operation.canonicalName}(action=${operation.action})`,
    ]),
  );
  if (replacements.size === 0) return (text) => text;
  const pattern = new RegExp(
    `(?<![\\w])(${[...replacements.keys()]
      .sort((a, b) => b.length - a.length)
      .join('|')})(?![\\w])`,
    'g',
  );
  return (text) =>
    text.replace(pattern, (name) => replacements.get(name) ?? name);
}

/** The same rewrite applied to every `description` string in a JSON schema. */
export function rewriteSchemaDescriptions<T>(
  schema: T,
  rewrite: (text: string) => string,
): T {
  if (Array.isArray(schema)) {
    return schema.map((item) => rewriteSchemaDescriptions(item, rewrite)) as T;
  }
  if (schema === null || typeof schema !== 'object') return schema;
  return Object.fromEntries(
    Object.entries(schema).map(([key, value]) => [
      key,
      key === 'description' && typeof value === 'string'
        ? rewrite(value)
        : rewriteSchemaDescriptions(value, rewrite),
    ]),
  ) as T;
}
