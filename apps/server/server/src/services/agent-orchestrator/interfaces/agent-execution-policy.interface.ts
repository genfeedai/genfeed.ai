import type { AgentAutonomyMode, RouterPriority } from '@genfeedai/enums';
import type { ValidatedAgentScope } from '@genfeedai/interfaces';

export type AgentQualityTier = 'budget' | 'balanced' | 'high_quality';

export interface ResolvedAgentExecutionPolicy {
  qualityTier: AgentQualityTier;
  /**
   * Router request value, not the persisted setting. `settings.generationPriority`
   * is the Prisma enum `GenerationPriority` (SCREAMING) and must be mapped with
   * `toRouterPriority` before it reaches this policy or `body.prioritize`.
   */
  generationPriority: RouterPriority;
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
  scope?: ValidatedAgentScope;
}
