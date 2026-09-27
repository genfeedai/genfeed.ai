import { getIntegrationBySlug } from '@data/integrations.data';

/**
 * Channels an agent can publish to through Genfeed. Each slug has a publisher
 * in `apps/server/api/src/services/integrations/publishers`, a user-connected
 * account, and a page under `/integrations/<slug>`. Channels without a
 * publisher (Discord, Telegram, Slack, Twitch, Medium) and WhatsApp, which
 * sends from Genfeed's own number rather than a connected account, stay off
 * this list so no page promises posting there.
 */
export const AGENT_CLIENT_CHANNEL_SLUGS = [
  'x-twitter',
  'linkedin',
  'instagram',
  'tiktok',
  'youtube',
  'facebook',
  'threads',
  'pinterest',
  'reddit',
  'snapchat',
  'mastodon',
  'wordpress',
  'ghost',
  'beehiiv',
] as const;

export type AgentClientChannelSlug =
  (typeof AGENT_CLIENT_CHANNEL_SLUGS)[number];

export function isAgentClientChannelSlug(
  slug: string,
): slug is AgentClientChannelSlug {
  return (AGENT_CLIENT_CHANNEL_SLUGS as readonly string[]).includes(slug);
}

function getChannelName(slug: AgentClientChannelSlug): string {
  const integration = getIntegrationBySlug(slug);
  if (!integration) {
    throw new Error(`Missing integration for agent channel: ${slug}`);
  }
  return integration.name;
}

export function getAgentClientChannels(): readonly {
  name: string;
  slug: AgentClientChannelSlug;
}[] {
  return AGENT_CLIENT_CHANNEL_SLUGS.map((slug) => ({
    name: getChannelName(slug),
    slug,
  }));
}
