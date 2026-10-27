import type { LearningPromptSlotOutcomeDto } from '@api/collections/content-learning/dto/learning-prompt-slot-outcome.dto';
import { LEARNING_PROMPT_SLOT_POOL_LIMIT } from '@api/collections/content-learning/interfaces/learning-prompt-slot-outcome.interface';

/**
 * The organizations a slot report reads: one `organizationId`, or the unique
 * ids of a comma-separated `organizationIds` for a pooled internal view.
 * Returns an error message when the request names neither or both, or too many.
 */
export function resolveSlotOutcomeOrganizations(
  dto: Pick<LearningPromptSlotOutcomeDto, 'organizationId' | 'organizationIds'>,
): { organizationIds: string[] } | { error: string } {
  const single = dto.organizationId?.trim();
  const pooled = [
    ...new Set(
      (dto.organizationIds ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ];
  if (single && pooled.length > 0) {
    return { error: 'Pass organizationId or organizationIds, not both' };
  }
  if (single) return { organizationIds: [single] };
  if (pooled.length === 0) {
    return { error: 'organizationId or organizationIds is required' };
  }
  if (pooled.length > LEARNING_PROMPT_SLOT_POOL_LIMIT) {
    return {
      error: `A pooled report reads at most ${LEARNING_PROMPT_SLOT_POOL_LIMIT} organizations`,
    };
  }
  return { organizationIds: pooled };
}
