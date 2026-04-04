'use client';

import { DynamicBlockGrid } from '@cloud/agent/components/blocks';
import { useAgentDashboardPersistence } from '@cloud/agent/hooks/use-agent-dashboard-persistence';
import type {
  AgentUIBlock,
  DashboardPreferenceScope,
  DashboardScopePreferences,
  IUser,
} from '@cloud/interfaces';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import Button from '@ui/buttons/base/Button';

interface AnalyticsAgentDashboardProps {
  agentBlocks: AgentUIBlock[];
  currentUser: IUser | null;
  disabled?: boolean;
  getLocalSnapshot: () => {
    blocks: AgentUIBlock[];
    isAgentModified: boolean;
  };
  hydrateState: (state: {
    blocks: AgentUIBlock[];
    isAgentModified: boolean;
  }) => void;
  isAgentModified: boolean;
  onResetToDefaults: () => void;
  persistState: (
    userId: string,
    patch: {
      dashboardPreferences: {
        scopes: Record<string, DashboardScopePreferences>;
      };
    },
  ) => Promise<void>;
  scope?: DashboardPreferenceScope;
  updateLocalUser?: (nextScopeState: DashboardScopePreferences) => void;
}

export default function AnalyticsAgentDashboard({
  agentBlocks,
  currentUser,
  disabled = false,
  getLocalSnapshot,
  hydrateState,
  isAgentModified,
  onResetToDefaults,
  persistState,
  scope = 'organization',
  updateLocalUser,
}: AnalyticsAgentDashboardProps) {
  useAgentDashboardPersistence({
    blocks: agentBlocks,
    currentUser,
    disabled,
    getLocalSnapshot,
    hydrateState,
    isAgentModified,
    persistState,
    scope,
    updateLocalUser,
  });

  if (!isAgentModified || agentBlocks.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-foreground/60">
          Agent-customized view
        </span>
        <Button
          withWrapper={false}
          size={ButtonSize.XS}
          variant={ButtonVariant.SECONDARY}
          onClick={onResetToDefaults}
          className="uppercase tracking-wide"
        >
          Reset to defaults
        </Button>
      </div>
      <DynamicBlockGrid blocks={agentBlocks} />
    </div>
  );
}
