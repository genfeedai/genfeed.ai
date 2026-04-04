import type { AgentAutonomyMode, AgentType } from '@genfeedai/enums';

export interface IAgentStrategy {
  id: string;
  organization: string;
  brand?: string;
  user: string;
  agentType: AgentType;
  autonomyMode: AgentAutonomyMode;
  isActive: boolean;
  label: string;
  topics: string[];
  voice?: string;
  model?: string;
  qualityTier?: 'budget' | 'balanced' | 'high_quality';
  platforms: string[];
  runFrequency: string;
  timezone: string;
  dailyCreditBudget: number;
  minCreditThreshold?: number;
  weeklyCreditBudget: number;
  creditsUsedToday: number;
  dailyCreditsUsed?: number;
  creditsUsedThisWeek: number;
  autoPublishConfidenceThreshold?: number;
  requiresManualReactivation?: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
  dailyCreditResetAt?: string;
  consecutiveFailures: number;
  createdAt: string;
  updatedAt: string;
}

export interface ICreateAgentStrategyDto {
  label: string;
  agentType?: AgentType;
  autonomyMode?: AgentAutonomyMode;
  brand?: string;
  topics?: string[];
  platforms?: string[];
  runFrequency?: string;
  dailyCreditBudget?: number;
  minCreditThreshold?: number;
  model?: string;
  qualityTier?: 'budget' | 'balanced' | 'high_quality';
  autoPublishConfidenceThreshold?: number;
  isActive?: boolean;
}
