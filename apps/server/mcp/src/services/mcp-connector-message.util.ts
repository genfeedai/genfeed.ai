import { ADMIN_MCP_TOOL_NAMES, type McpAccessMode } from '@genfeedai/actions';

/** What a caller is told when a tool is not served on the endpoint they used. */
export function unavailableInConnectorMessage(
  accessMode: McpAccessMode,
  toolName: string,
): string {
  if (accessMode === 'admin') {
    return 'This connection serves the admin-only tools. Use the standard Genfeed connection for this tool.';
  }
  if (accessMode === 'standard' && ADMIN_MCP_TOOL_NAMES.has(toolName)) {
    return 'This tool is only available on the Genfeed admin connection.';
  }
  return 'This tool is unavailable through the Claude connector. This connector does not generate images, video or audio.';
}
