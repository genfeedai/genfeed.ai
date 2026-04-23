import type { AgentUIBlock } from '../ai/agent-ui-block.interface';
import type { IOnboardingAccessPreference } from '../onboarding/onboarding.interface';

export type DashboardPreferenceScope = 'organization' | 'brand';

export interface DashboardScopePreferences {
  isAgentModified: boolean;
  blocks: AgentUIBlock[];
  updatedAt: string;
  version: number;
}

export interface DashboardPreferences {
  onboarding?: IOnboardingAccessPreference;
  scopes: Partial<Record<DashboardPreferenceScope, DashboardScopePreferences>>;
}
