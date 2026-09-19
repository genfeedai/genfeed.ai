/**
 * Result of resolving the OAuth protected-resource identifier for the
 * Genfeed MCP server (RFC 8707 `resource`, RFC 9728 `resource` metadata).
 *
 * `identifier` is the value advertised by the MCP server and enforced by
 * the API token endpoint. `sourceKey` names the environment variable the
 * value came from, or `null` when the deployment fallback was used.
 */
export interface McpResourceIdentifierResolution {
  identifier: string;
  sourceKey: string | null;
}
