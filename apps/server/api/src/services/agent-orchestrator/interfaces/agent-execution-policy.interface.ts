import type { AgentAutonomyMode } from '@genfeedai/enums';

export type AgentQualityTier = 'budget' | 'balanced' | 'high_quality';
export type AgentGenerationPriority = 'quality' | 'balanced' | 'cost';

export interface ResolvedAgentExecutionPolicy {
  qualityTier: AgentQualityTier;
  generationPriority: AgentGenerationPriority;
  autonomyMode: AgentAutonomyMode;
  thinkingModelOverride?: string | null;
  generationModelOverride?: string | null;
  reviewModelOverride?: string | null;
  allowAdvancedOverrides: boolean;
  creditGovernance: {
    useOrganizationPool: boolean;
    brandDailyCreditCap?: number | null;
    agentDailyCreditCap?: number | null;
  };
  brandId?: string;
  platform?: string;
}
