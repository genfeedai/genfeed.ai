import type { Implementation } from '@modelcontextprotocol/sdk/types.js';
import { MCP_BRAND_ICON_FILES } from './brand-icons';

export const MCP_SERVER_NAME = 'genfeed-mcp-server';
export const MCP_SERVER_TITLE = 'Genfeed';
export const MCP_SERVER_VERSION = '1.0.0';
export const MCP_SERVER_DESCRIPTION =
  'Create, review, schedule, and publish on-brand posts, images, videos, and articles with Genfeed.';

export const GENFEED_WEBSITE_URL = 'https://genfeed.ai';
export const GENFEED_PRIVACY_URL = `${GENFEED_WEBSITE_URL}/privacy`;
export const GENFEED_TERMS_URL = `${GENFEED_WEBSITE_URL}/terms`;

/** Returned once per session in `initialize`; clients add it to the model context. */
export const MCP_SERVER_INSTRUCTIONS = [
  'Genfeed is an AI content OS for brands.',
  'Call get_brands first and work inside the brand the user means.',
  'Use generate_content for post copy and generate for images, video and audio; media generation is asynchronous, so poll get_job_status until the job finishes.',
  'create_post saves a draft for review. Never publish or schedule a post unless the user explicitly asks for it.',
  'Call find_tools when a request needs a capability that is not in the current tool list.',
].join(' ');

/**
 * `initialize` → `serverInfo`. Icons resolve against the MCP server's own
 * origin: clients are asked to reject icons served from any other origin.
 */
export function getMcpServerInfo(publicMcpUrl: string): Implementation {
  const origin = new URL(publicMcpUrl).origin;

  return {
    description: MCP_SERVER_DESCRIPTION,
    icons: Object.entries(MCP_BRAND_ICON_FILES).map(
      ([path, { mimeType, sizes, theme }]) => ({
        mimeType,
        sizes,
        src: `${origin}${path}`,
        ...(theme ? { theme } : {}),
      }),
    ),
    name: MCP_SERVER_NAME,
    title: MCP_SERVER_TITLE,
    version: MCP_SERVER_VERSION,
    websiteUrl: GENFEED_WEBSITE_URL,
  };
}
