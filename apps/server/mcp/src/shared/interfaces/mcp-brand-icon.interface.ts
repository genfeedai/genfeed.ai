/** A brand icon the MCP server serves from its own origin. */
export interface McpBrandIconFile {
  body: Buffer;
  mimeType: 'image/png' | 'image/svg+xml';
  sizes: string[];
  theme?: 'dark' | 'light';
}
