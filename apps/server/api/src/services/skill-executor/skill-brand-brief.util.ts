import { HARNESS_BRIEF_PROMPT_HEADING } from '@api/services/harness/required-harness-brief.util';
import type { SkillExecutionContext } from '@api/services/skill-executor/interfaces/skill-executor.interfaces';
import { ServiceUnavailableException } from '@nestjs/common';

export const SKILL_BRAND_CONTEXT_UNAVAILABLE =
  'Brand context is unavailable for this skill. Please retry.';

/**
 * The brief section for a copy skill's prompt. The skill workflow resolves the
 * brief before any copy skill runs; without one the skill fails rather than
 * writing in a generic voice.
 */
export function skillBrandBriefSection(context: SkillExecutionContext): string {
  if (!context.brandBrief)
    throw new ServiceUnavailableException(SKILL_BRAND_CONTEXT_UNAVAILABLE);
  return `${HARNESS_BRIEF_PROMPT_HEADING}\n${context.brandBrief}`;
}
