export type { IEngagementRuleDocument as EngagementRuleDocument } from '@genfeedai/contracts/interfaces';

export type EngagementRuleScope = {
  brandId?: string;
  organizationId: string;
  userId: string;
};
