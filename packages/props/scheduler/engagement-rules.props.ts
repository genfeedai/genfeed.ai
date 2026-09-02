import type {
  CreateEngagementRuleInput,
  IChannelTarget,
  IEngagementRule,
  UpdateEngagementRuleInput,
} from '@genfeedai/contracts/interfaces';

export interface ReleaseEngagementRulesProps {
  postGroupId: string;
  reconnectHref: string;
  target: IChannelTarget;
}

export interface ReleaseEngagementRuleRowProps {
  rule: IEngagementRule;
}

export interface UseEngagementRulesOptions {
  autoLoad?: boolean;
  postGroupId?: string;
  targetId?: string;
}

export interface UseEngagementRulesResult {
  create: (input: CreateEngagementRuleInput) => Promise<IEngagementRule>;
  error: Error | null;
  isLoading: boolean;
  refresh: () => void;
  rules: IEngagementRule[];
  update: (
    id: string,
    input: UpdateEngagementRuleInput,
  ) => Promise<IEngagementRule>;
}
