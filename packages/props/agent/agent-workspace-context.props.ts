import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';

export interface AgentWorkspaceContextValue {
  agentApiService: AgentApiService;
  isLoaded: boolean;
  isOnboarding: boolean;
  isExpertOnboarding: boolean;
  onboardingBootstrapError: boolean;
  onboardingStartFailures: number;
  retryOnboardingBootstrap: () => void;
  handleOAuthConnect: (platform: string) => Promise<void>;
  completeOnboardingFlow: () => Promise<void>;
}
