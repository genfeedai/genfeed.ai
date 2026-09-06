import type { AgentApiService } from '@genfeedai/agent';

export interface AgentWorkspaceContextValue {
  agentApiService: AgentApiService;
  isLoaded: boolean;
  isOnboarding: boolean;
  handleOAuthConnect: (platform: string) => Promise<void>;
  completeOnboardingFlow: () => Promise<void>;
}
