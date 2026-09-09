import type { ActionOriginContext, DistributionPlatform } from '../..';

export interface BatchGenerationWorkflowInput {
  actionContext?: ActionOriginContext;
  batchId: string;
  isResume?: boolean;
  organizationId: string;
  runId?: string;
  threadId?: string;
  userId: string;
}

export interface InsightGenerationWorkflowInput {
  limit: number;
  organizationId: string;
}

/** One canonical Knowledge source version to extract, chunk and embed. */
export interface KnowledgeSourceIngestWorkflowInput {
  organizationId: string;
  sourceId: string;
  versionId: string;
}

export interface KnowledgeSourceBackfillWorkflowInput {
  organizationId: string;
}

export interface SignupPrefillWorkflowInput {
  brandDomain?: string;
  brandId: string;
  brandName?: string;
  email?: string;
  organizationId: string;
  userId: string;
}

export interface EmailDigestWorkflowInput {
  brandId: string;
  endDate?: string;
  organizationId: string;
  recipientEmails?: string[];
  startDate?: string;
  userId?: string;
}

export type LifecycleEmailSequence =
  | 'welcome'
  | 'activation-nudge'
  | 'abandoned-checkout'
  | 'win-back';

export type LifecycleEmailStep =
  | 'setup-reminder'
  | 'first-generation'
  | 'welcome-day-0'
  | 'welcome-day-2'
  | 'welcome-day-7'
  | 'activation-nudge'
  | 'checkout-recovery'
  | 'win-back';

export interface LifecycleEmailWorkflowInput {
  checkoutSessionId?: string;
  organizationId?: string;
  sequence: LifecycleEmailSequence;
  step: LifecycleEmailStep;
  subscriptionId?: string;
  triggerKey: string;
  userId: string;
}

export interface TelegramDistributionWorkflowInput {
  distributionId: string;
  organizationId: string;
  platform: DistributionPlatform;
}
