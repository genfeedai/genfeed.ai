import type { IBrandAgentAutoPublish } from '../interfaces/organization/brand.interface';

/** `ContentPlan.config.source` marker for the Expert Path first content system. */
export const EXPERT_FIRST_SYSTEM_PLAN_SOURCE = 'expert-first-system';

/** Brand memory type recording the latest first-system generation outcome. */
export const EXPERT_FIRST_SYSTEM_MEMORY_TYPE = 'expert-path.first-system';

/** Number of plan items generated for the first content system. */
export const EXPERT_FIRST_SYSTEM_ITEM_COUNT = 7;

/** Credits charged to generate the first content system. */
export const EXPERT_FIRST_SYSTEM_CREDIT_COST = 10;

/**
 * Expert Path default: publish approval on. An operator who already enabled
 * auto-publish keeps that choice; everyone else gets the approval gate.
 */
export function applyExpertPublishApprovalDefault(
  autoPublish: IBrandAgentAutoPublish | null | undefined,
): IBrandAgentAutoPublish {
  if (autoPublish?.enabled === true) {
    return autoPublish;
  }

  return { ...autoPublish, enabled: false, isApprovalRequired: true };
}

export function isPublishApprovalRequired(
  autoPublish: IBrandAgentAutoPublish | null | undefined,
): boolean {
  return (
    autoPublish?.isApprovalRequired === true && autoPublish.enabled !== true
  );
}
