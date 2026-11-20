/** One action of a merged MCP tool and the original operation it runs. */
export interface McpCatalogActionSpec {
  action: string;
  /** Name of the original tool that executes the action. */
  executes: string;
}

/**
 * A merged MCP tool, declared once. Its listing schema, annotations, credit
 * pricing and mutation policy are derived from the original tools in
 * `operations`, so a merged tool cannot drift from what it runs.
 */
export interface McpCatalogToolSpec {
  name: string;
  /** What the tool is for. The per-action lines are appended from the originals. */
  description: string;
  /** Shorter wording for MCP `tools/list`; the same pricing note is appended. */
  mcpDescription?: string;
  operations: readonly McpCatalogActionSpec[];
}

export interface McpCatalogOperation {
  action: string;
  canonicalName: string;
  executionName: string;
}

export type ResolvedMcpCatalogCall = McpCatalogOperation & {
  requestedName: string;
  arguments: Record<string, unknown>;
};
