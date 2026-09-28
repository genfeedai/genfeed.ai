/** Upper bound on the favorite workflows one write submits for one organization (#5510). */
export const MAX_FAVORITE_WORKFLOW_IDS = 50;

/**
 * Upper bound on the stored favorites list across every organization a user
 * belongs to. When a write would exceed it, the oldest other-organization ids
 * (front of the list) are pruned first.
 */
export const MAX_STORED_FAVORITE_WORKFLOW_IDS = 200;
