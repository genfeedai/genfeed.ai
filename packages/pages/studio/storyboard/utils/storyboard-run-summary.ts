import type { BrandRemixRunSummary } from '@genfeedai/contracts/api-types/contracts';

const ATTENTION_PHASES = new Set<BrandRemixRunSummary['phase']>([
  'failed',
  'ready_for_review',
]);
const ATTENTION_SCENE_STATES = new Set<
  NonNullable<BrandRemixRunSummary['scenePipelineState']>
>(['blocked', 'partial_failure', 'quoted']);

/**
 * "Needs you": the run cannot move on until the creator acts — it failed,
 * stopped part-way, waits on a quote, or has outputs waiting to go to review.
 */
export function isStoryboardRunNeedingAttention(
  run: BrandRemixRunSummary,
): boolean {
  return (
    ATTENTION_PHASES.has(run.phase) ||
    (run.scenePipelineState !== undefined &&
      ATTENTION_SCENE_STATES.has(run.scenePipelineState))
  );
}
