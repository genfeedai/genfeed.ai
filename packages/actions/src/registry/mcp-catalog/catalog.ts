import type { McpCatalogToolSpec } from '../../interfaces/mcp-catalog-call.interface';

/**
 * Every merged MCP tool. A merged tool takes `action` plus one `input` object
 * and runs the original tool named for that action; the original tools stay
 * the executors and are never listed. Retired names fail at once and name
 * their replacement.
 */
export const MCP_CATALOG_TOOLS = [
  {
    name: 'check_channel',
    description:
      'Check publishing channel capabilities or validate a proposed target. capabilities lists channels when input is omitted; validate checks input.platform and returns errors/warnings/validationState. Read-only.',
    operations: [
      { action: 'capabilities', executes: 'get_scheduler_capabilities' },
      { action: 'validate', executes: 'validate_scheduler_target' },
    ],
  },
  {
    name: 'upload_media',
    description:
      'Upload existing media for the selected brand. request reserves a pending asset and returns uploadUrl, assetId, method and constraints. PUT sends bytes with returned headers; POST_JSON sends localUpload with base64 bytes in localUpload.source.data. Then complete finalizes the upload and returns assetId and any hosted URL. Does not publish or attach media.',
    operations: [
      { action: 'request', executes: 'request_media_upload' },
      { action: 'complete', executes: 'complete_media_upload' },
    ],
  },
] as const satisfies readonly McpCatalogToolSpec[];

export type McpCatalogToolName = (typeof MCP_CATALOG_TOOLS)[number]['name'];
