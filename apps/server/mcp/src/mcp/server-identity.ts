import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { Implementation } from '@modelcontextprotocol/sdk/types.js';
import { MCP_BRAND_ICON_FILES } from './brand-icons';

export const MCP_SERVER_NAME = 'genfeed-mcp-server';
export const MCP_SERVER_TITLE = 'Genfeed';
export const MCP_SERVER_VERSION = '1.0.0';
export const MCP_SERVER_DESCRIPTION =
  'Create, review, schedule, and publish on-brand posts, images, videos, and articles with Genfeed.';

/** Returned once per session in `initialize`; clients add it to the model context. */
export const MCP_SERVER_INSTRUCTIONS = [
  'Genfeed is an AI content OS for brands.',
  'Call get_account first: if profile.isOnboardingCompleted is false, the user just signed up, so run onboard_brand with them before generating anything.',
  'Call get_brands and work inside the brand the user means.',
  'Use generate_content for post copy and generate for images, video and audio; media generation is asynchronous, so poll get_job_status until the job finishes.',
  'Before generate.model or transform_media.model, call get_generation_options and pass a returned models key. Omit generate.model to let the router choose. Do not invent model aliases.',
  'create_post saves a draft for review. Never publish or schedule a post unless the user explicitly asks for it.',
  'Call find_tools when a request needs a capability that is not in the current tool list.',
].join(' ');

export function buildClaudeMcpServerInstructions(appUrl: string): string {
  return [
    'Genfeed connects Claude to brands, drafts, scheduling and analytics.',
    'Call get_account and get_brands first; use onboard_brand when onboarding is incomplete.',
    'Write copy yourself, then use create_post or create_article_draft to save it for review.',
    'Never schedule anything unless the user explicitly asks. Use existing assets from list_assets.',
    `Image, video and audio creation happens in Genfeed Studio at ${appUrl}${APP_ROUTES.STUDIO.GENERATE}. Open that link; never attempt generation, workflows, batches or remix through this connector. Opening Studio does not start generation.`,
    'Use find_tools to discover supported content operations. Toolset changes cannot enable generation.',
  ].join(' ');
}

/**
 * `initialize` → `serverInfo`. Icons resolve against the MCP server's own
 * origin: clients are asked to reject icons served from any other origin.
 * `websiteUrl` is the operator's public site (`GENFEEDAI_PUBLIC_URL`).
 */
export function getMcpServerInfo(
  publicMcpUrl: string,
  websiteUrl: string,
): Implementation {
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
    websiteUrl,
  };
}
