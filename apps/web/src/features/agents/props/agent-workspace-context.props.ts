import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';

export interface AgentWorkspaceContextValue {
  agentApiService: AgentApiService;
  isLoaded: boolean;
  handleOAuthConnect: (platform: string) => Promise<void>;
}
