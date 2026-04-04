import type { AgentUIBlock } from '../ai/agent-ui-block.interface';

export type DashboardPreferenceScope = 'organization' | 'brand';

export interface DashboardScopePreferences {
  isAgentModified: boolean;
  blocks: AgentUIBlock[];
  updatedAt: string;
  version: number;
}

export interface DashboardPreferences {
  scopes: Partial<Record<DashboardPreferenceScope, DashboardScopePreferences>>;
}
