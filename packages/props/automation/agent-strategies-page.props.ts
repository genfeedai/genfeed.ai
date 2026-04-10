import type {
  AgentAutonomyMode,
  AgentRunFrequency,
  AgentType,
} from '@genfeedai/enums';
import type { AgentStrategy } from '@genfeedai/services/automation/agent-strategies.service';

export interface AgentStrategyFormState {
  agentType: AgentType;
  autonomyMode: AgentAutonomyMode;
  autoPublishEnabled: boolean;
  autoPublishConfidenceThreshold: string;
  dailyCreditBudget: string;
  dailyDigestEnabled: boolean;
  eventTriggersEnabled: boolean;
  evergreenCadenceEnabled: boolean;
  goalProfile: 'reach_traffic';
  isActive: boolean;
  isEnabled: boolean;
  label: string;
  minImageScore: string;
  minCreditThreshold: string;
  minPostScore: string;
  monthlyCreditBudget: string;
  platforms: string[];
  skillSlugs: string[];
  reserveTrendBudget: string;
  runFrequency: AgentRunFrequency;
  trendWatchersEnabled: boolean;
  topics: string;
  weeklySummaryEnabled: boolean;
}

export interface AgentStrategyDialogProps {
  initialStrategy?: AgentStrategy | null;
  isOpen: boolean;
  isSubmitting: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSubmit: (form: AgentStrategyFormState) => Promise<void>;
}
