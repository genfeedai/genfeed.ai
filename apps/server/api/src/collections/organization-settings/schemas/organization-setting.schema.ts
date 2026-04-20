export type { OrganizationSetting as OrganizationSettingDocument } from '@genfeedai/prisma';

export const AGENT_POLICY_QUALITY_TIERS = [
  'budget',
  'balanced',
  'high_quality',
] as const;

export type AgentPolicyQualityTier =
  (typeof AGENT_POLICY_QUALITY_TIERS)[number];
