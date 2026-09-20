import type {
  IPersuasionScores,
  ITrendVideoPersuasionHighlight,
} from '@genfeedai/contracts/interfaces';
import { PERSUASION_LAYERS } from '@genfeedai/harness/contracts';

/**
 * Picks the single highest-scoring persuasion layer for a "why it works"
 * callout on the Trends leaderboard. Reuses `PERSUASION_LAYERS` (the same
 * four-layer rubric the harness pack contributes to generation and
 * evaluation prompts) instead of re-describing the layers here, so the
 * label shown on Trends can never drift from the rubric it summarizes.
 *
 * Returns `undefined` when there is no persuasion result to summarize --
 * this never fabricates a "why it works" callout for content that was
 * never scored on the persuasion rubric.
 */
export function getPersuasionHighlight(
  persuasion: IPersuasionScores | undefined,
): ITrendVideoPersuasionHighlight | undefined {
  if (!persuasion) {
    return undefined;
  }

  return PERSUASION_LAYERS.reduce<ITrendVideoPersuasionHighlight | undefined>(
    (top, layer) => {
      const score = persuasion[layer.scoreKey];

      if (typeof score !== 'number' || (top && score <= top.score)) {
        return top;
      }

      return { id: layer.id, label: layer.label, score };
    },
    undefined,
  );
}
