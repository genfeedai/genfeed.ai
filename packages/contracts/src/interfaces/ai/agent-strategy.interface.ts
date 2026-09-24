import type { AgentAutonomyMode, AgentType } from '../..';

export interface IAgentStrategy {
  id: string;
  organizationId: string;
  brandId?: string;
  userId: string;
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
  runHistory?: IAgentStrategyRunHistoryItem[];
  dailyCreditResetAt?: string;
  consecutiveFailures: number;
  createdAt: string;
  updatedAt: string;
}

export interface ICreateAgentStrategyDto {
  label: string;
  agentType?: AgentType;
  autonomyMode?: AgentAutonomyMode;
  brandId?: string;
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

export interface IAgentStrategyPerformanceSnapshot {
  bestPlatformFormatPairs: Array<{
    format: string;
    platform: string;
    score: number;
  }>;
  bestPostingWindows: string[];
  clicks: number;
  costPerVisit: number | null;
  creditsSpent: number;
  ctr: number;
  generatedCount: number;
  impressions: number;
  publishedCount: number;
  sampling?: {
    limit: number;
    matchedPosts: number;
    matchedMeasurements: number;
    postsSampled: number;
    measurementsSampled: number;
    truncated: boolean;
  };
  topHooks: string[];
  topTopics: string[];
  visits: number | null;
}

export interface IAgentStrategyRunHistoryItem {
  executionId?: string;
  threadId?: string;
  startedAt: string;
  completedAt: string;
  status: string;
  creditsUsed: number;
  contentGenerated: number;
  performanceSnapshot?: IAgentStrategyPerformanceSnapshot;
}
