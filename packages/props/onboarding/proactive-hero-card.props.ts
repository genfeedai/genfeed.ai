import type { ProactiveWorkspaceResponse } from '@services/onboarding/onboarding.service';

export interface ProactiveHeroCardProps {
  workspace: ProactiveWorkspaceResponse;
  statusLabel: string;
  isRefreshing: boolean;
  onConfigureProviders: () => void;
  onContinueSelfServe: () => void;
}
