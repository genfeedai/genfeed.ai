/** Most organizations one pooled report may read. */
export const LEARNING_PROMPT_SLOT_POOL_LIMIT = 20;

export interface LearningPromptSlotOutcomeQuery {
  /** One organization, or several for a pooled internal view. */
  organizationIds: string[];
  brandId?: string;
  credentialId?: string;
}
