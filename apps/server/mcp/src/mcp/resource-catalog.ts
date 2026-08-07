import type { McpResource } from '@mcp/shared/interfaces/mcp-server.interface';

/**
 * Canonical MCP resource URIs. Every surface that advertises or reads a
 * resource resolves it from here — the JSON-RPC transport
 * (`ToolRegistryService`), the REST mirror (`McpController`) and the public
 * setup example (`MCPService`) each used to carry a verbatim copy, so adding or
 * renaming a resource silently drifted one surface away from the others.
 */
export const McpResourceUri = {
  ORGANIZATION_ANALYTICS: 'genfeed://analytics/organization',
  VIDEO_ANALYTICS: 'genfeed://analytics/videos',
} as const;

export type McpResourceUriValue =
  (typeof McpResourceUri)[keyof typeof McpResourceUri];

/**
 * The resource catalog itself. Frozen at the type level; callers that hand it
 * to the MCP SDK spread a copy so the shared constant can never be mutated by a
 * request handler.
 */
export const MCP_RESOURCES: readonly McpResource[] = [
  {
    description: 'Get analytics for all videos in your organization',
    mimeType: 'application/json',
    name: 'Video Analytics',
    uri: McpResourceUri.VIDEO_ANALYTICS,
  },
  {
    description: 'Get overall organization analytics',
    mimeType: 'application/json',
    name: 'Organization Analytics',
    uri: McpResourceUri.ORGANIZATION_ANALYTICS,
  },
];
