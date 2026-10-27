import { BRAND_CONTEXT_CHARACTER_BUDGET } from '@api/services/agent-context-assembly/brand-context-budget.util';
import type {
  HarnessGenerationService,
  ResolveHarnessBriefParams,
} from '@api/services/harness/harness-generation.service';
import { ServiceUnavailableException } from '@nestjs/common';

/** Prompt heading for a composed brief handed to a copywriting model. */
export const HARNESS_BRIEF_PROMPT_HEADING =
  'Brand brief (follow it exactly; never contradict its guardrails, and do not invent claims it does not support):';

/**
 * Compose the harness brief for brand copy, or fail with a retryable 503
 * carrying `unavailableMessage`. There is no generic fallback: copy written
 * without the brief would go out without the brand's guardrails.
 */
export async function resolveRequiredHarnessBrief(
  harness: Pick<HarnessGenerationService, 'formatBrief' | 'resolveBrief'>,
  params: ResolveHarnessBriefParams,
  unavailableMessage: string,
): Promise<string> {
  const formatted = harness
    .formatBrief(await harness.resolveBrief(params))
    .trim();
  if (!formatted || formatted.length > BRAND_CONTEXT_CHARACTER_BUDGET)
    throw new ServiceUnavailableException(unavailableMessage);
  return formatted;
}
