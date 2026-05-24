import type { AgentAutonomyMode } from '@genfeedai/enums';
import type { OrganizationSetting as PrismaOrganizationSetting } from '@genfeedai/prisma';

export interface AgentPolicyCreditGovernance {
  agentDailyCreditCap?: number | null;
  brandDailyCreditCap?: number | null;
  useOrganizationPool?: boolean;
  [key: string]: unknown;
}

export interface AgentPolicyConfig {
  allowAdvancedOverrides?: boolean;
  autonomyDefault?: AgentAutonomyMode | string;
  creditGovernance?: AgentPolicyCreditGovernance;
  generationModelOverride?: string | null;
  qualityTierDefault?: 'budget' | 'balanced' | 'high_quality';
  reviewModelOverride?: string | null;
  thinkingModelOverride?: string | null;
  [key: string]: unknown;
}

export interface OrganizationSettingDocument
  extends Omit<PrismaOrganizationSetting, 'agentPolicy' | 'defaultVoiceRef'> {
  _id: string;
  agentPolicy?: AgentPolicyConfig;
  defaultAvatarIngredientId: string | null;
  defaultAvatarPhotoUrl: string | null;
  defaultModel: string | null;
  defaultVoiceId: string | null;
  defaultVoiceRef?: PrismaOrganizationSetting['defaultVoiceRef'];
  organization?: string;
  [key: string]: unknown;
}

export type OrganizationSetting = OrganizationSettingDocument;

export const AGENT_POLICY_QUALITY_TIERS = [
  'budget',
  'balanced',
  'high_quality',
] as const;

export type AgentPolicyQualityTier =
  (typeof AGENT_POLICY_QUALITY_TIERS)[number];
