/**
 * Prefix of an idempotency key the MCP server derives from the content of a
 * release (no caller key, no approval id). Such a key stops a retried call from
 * making a second release, but must not let a cancelled release swallow a
 * deliberate re-schedule, so the API treats it differently from a key a caller
 * chose.
 */
export const CONTENT_RELEASE_IDEMPOTENCY_PREFIX = 'mcp-release:content:';
