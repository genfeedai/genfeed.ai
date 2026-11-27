/**
 * MCP `tools/list` hints. Clients treat these as hints, not authorization.
 * Every listed tool sets all four.
 */
export interface ToolAnnotations {
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
  readOnlyHint: boolean;
}
