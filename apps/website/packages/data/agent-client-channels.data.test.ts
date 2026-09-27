import { describe, expect, it } from 'vitest';
import {
  AGENT_CLIENT_CHANNEL_SLUGS,
  getAgentClientChannels,
  isAgentClientChannelSlug,
} from './agent-client-channels.data';
import { getIntegrationBySlug } from './integrations.data';

describe('agent client channels', () => {
  it('only lists channels that have an integration page', () => {
    for (const slug of AGENT_CLIENT_CHANNEL_SLUGS) {
      expect(getIntegrationBySlug(slug)).toBeDefined();
    }
    expect(getAgentClientChannels()).toHaveLength(
      AGENT_CLIENT_CHANNEL_SLUGS.length,
    );
  });

  it.each(['discord', 'telegram', 'slack', 'twitch', 'medium', 'whatsapp'])(
    'never promises posting to %s',
    (slug) => {
      expect(isAgentClientChannelSlug(slug)).toBe(false);
    },
  );
});
