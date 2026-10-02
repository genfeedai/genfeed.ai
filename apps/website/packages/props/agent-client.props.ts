import type { AgentClient, AgentClientChannel } from '@data/agent-clients.data';

export interface AgentClientContentProps {
  channels: readonly AgentClientChannel[];
  client: AgentClient;
}

export interface AgentClientVisualProps {
  channelName?: string;
  client: AgentClient;
}

export interface AgentClientLogoProps {
  client: Pick<AgentClient, 'logo'>;
}
