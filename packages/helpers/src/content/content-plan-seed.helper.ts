/**
 * `ContentPlannerService.generatePlan` writes the plan's provenance into its
 * `description` rather than a separate structured field:
 *
 * - Cold-start: `AI-generated cold-start plan (seeded from competitor ads,
 *   creative patterns and followed creators; N own posts in the last 30
 *   days): <name>`
 * - Grounded: `AI-generated plan (grounded in N own posts, M imported):
 *   <name>`
 *
 * This is a pure read-back of that convention so the UI can badge a plan as
 * cold-start/grounded and show the seed summary as helper text, without the
 * API adding a dedicated field. Keep this in sync with
 * `apps/server/api/src/services/content-engine/content-planner.service.ts`.
 */
export type ContentPlanSeedKind = 'cold-start' | 'grounded' | 'unknown';

export interface ContentPlanSeedSummary {
  kind: ContentPlanSeedKind;
  /** The parenthetical provenance text, without the surrounding parens. */
  seedSummary?: string;
}

const COLD_START_PATTERN = /^AI-generated cold-start plan \(([\s\S]*?)\):/;
const GROUNDED_PATTERN = /^AI-generated plan \((grounded[\s\S]*?)\):/;

export function parsePlanSeedSummary(
  description: string | null | undefined,
): ContentPlanSeedSummary {
  if (!description) {
    return { kind: 'unknown' };
  }

  const coldStartMatch = description.match(COLD_START_PATTERN);
  if (coldStartMatch) {
    return { kind: 'cold-start', seedSummary: coldStartMatch[1] };
  }

  const groundedMatch = description.match(GROUNDED_PATTERN);
  if (groundedMatch) {
    return { kind: 'grounded', seedSummary: groundedMatch[1] };
  }

  return { kind: 'unknown' };
}
