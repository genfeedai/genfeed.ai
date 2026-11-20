import type { McpAccessMode } from '@genfeedai/actions';
import type { Implementation } from '@modelcontextprotocol/server';
import { MCP_BRAND_ICON_FILES } from './brand-icons';

export const MCP_SERVER_NAME = 'genfeed-mcp-server';
const MCP_SERVER_TITLE = 'Genfeed';
const MCP_SERVER_VERSION = '1.0.0';
// The stateless transport has no subscription channel for change notifications.
export const MCP_SERVER_CAPABILITIES = {
  resources: { listChanged: false },
  tools: { listChanged: false },
};
export const MCP_SERVER_DESCRIPTION =
  'Create, review, schedule, and publish on-brand posts, images, videos, and articles with Genfeed.';

/** Returned once per session in `initialize`; clients add it to the model context. */
export const MCP_SERVER_INSTRUCTIONS = [
  'Genfeed is an AI content OS for brands.',
  'Call get_context(action=account) first: if profile.isOnboardingCompleted is false, the user just signed up, so run onboard_brand with them before generating anything.',
  'Call get_context(action=brands) and work inside the brand the user means.',
  "When get_context(action=organizations) lists several organizations with ids, the user connected all of them: pass organization (name, slug or id) with that organization's brandId on a call to act in it. A connection that lists one organization stays in it.",
  'Use generate_content for post copy. It saves a social draft and returns postId and receiptId. To add Library media, call create_post with its postId, the same brandId, and mediaUrls. Use get_content(action=posts) to read back the draft.',
  'Use get_assets to find Library media or generate for images, video and audio. Media generation is asynchronous, so poll check_job(action=job) until the job finishes.',
  'Before generate.model or transform_media.model, call get_generation_catalog(action=options) and pass a returned models key. Omit generate.model to let the router choose. Do not invent model aliases.',
  'Use create_post without postId to save a new draft from supplied text or media. Never publish or schedule a post unless the user explicitly asks for it.',
  'Call find_tools when a request needs a capability that is not in the current tool list.',
  'Discovery does not load tools into the client. If a tool is listed by the connection but missing in the client, refresh its MCP tool list or reconnect to the same server URL. Do not reinstall or broaden permissions to repair a stale tool list.',
].join(' ');

export function buildMcpServerInstructions(accessMode: McpAccessMode): string {
  switch (accessMode) {
    case 'claude':
      return buildClaudeMcpServerInstructions();
    case 'admin':
      return buildAdminMcpServerInstructions();
    default:
      return MCP_SERVER_INSTRUCTIONS;
  }
}

function buildAdminMcpServerInstructions(): string {
  return [
    'Genfeed staff admin connection for organization owners and admins.',
    'It lists only the admin-only tools. Content, brand and generation tools are on the standard connection.',
  ].join(' ');
}

export function buildClaudeMcpServerInstructions(): string {
  return [
    'Genfeed connects Claude to brands, drafts, scheduling and analytics.',
    'Call get_context(action=account) and get_context(action=brands) first; use onboard_brand when onboarding is incomplete.',
    'Write copy yourself, then use create_post or create_article_draft to save it for review.',
    'Never schedule anything unless the user explicitly asks. Use existing assets from get_assets.',
    'Image, video and audio generation, workflows, batches and remix are unavailable through this connector.',
    'Use find_tools to discover supported content operations. Toolset changes cannot enable generation.',
  ].join(' ');
}

function describeMcpServer(accessMode: McpAccessMode): string {
  switch (accessMode) {
    case 'claude':
      return 'Manage brands, drafts, scheduled releases and analytics in Genfeed.';
    case 'admin':
      return 'Genfeed admin actions for organization owners and admins.';
    default:
      return MCP_SERVER_DESCRIPTION;
  }
}

/**
 * `initialize` → `serverInfo`. Icons resolve against the MCP server's own
 * origin: clients are asked to reject icons served from any other origin.
 * `websiteUrl` is the operator's public site (`GENFEEDAI_PUBLIC_URL`).
 */
export function getMcpServerInfo(
  publicMcpUrl: string,
  websiteUrl: string,
  accessMode: McpAccessMode = 'standard',
): Implementation {
  const origin = new URL(publicMcpUrl).origin;

  return {
    description: describeMcpServer(accessMode),
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
    websiteUrl,
  };
}
