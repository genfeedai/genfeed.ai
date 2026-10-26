/**
 * Upfront spend projection for repeated comparison runs (#5600). The ledger
 * already stops a run at the cap, but only after money is spent; a repeat count
 * that cannot fit is refused before the first provider call instead.
 *
 * The projection assumes every generation uses its full token cap, a judge
 * verdict takes a few hundred tokens, and no structured-output repair retries:
 * a ceiling on a normal run, not the ledger's worst case.
 */

import type { Contestant, FixtureRow } from '../contracts';
import { canonicalJson } from '../provenance';
import {
  catalogueCostUsd,
  reservationCostUsd,
  upperBoundTokens,
  usdToCredits,
} from '../spend';
import {
  buildGenerationMessages,
  GENERATION_MAX_TOKENS,
} from '../suites/compare';
import { GRADE_TWICE_SAMPLE_SIZE } from './contracts';

/** Rubric and instructions wrapped around the judged text. */
const JUDGE_PROMPT_OVERHEAD_TOKENS = 2000;
/** A verdict plus reasons; the 1024 cap is almost never reached. */
const JUDGE_EXPECTED_COMPLETION_TOKENS = 400;

export interface ComparisonSpendProjectionInput {
  contestants: readonly Contestant[];
  judgeRegistryKeys: readonly string[];
  repeats: number;
  rows: readonly FixtureRow[];
}

function callCreditsUsd(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  return (
    catalogueCostUsd(model, promptTokens, completionTokens) ??
    // The priciest catalogued rate, as the ledger reserves an unpriced model.
    reservationCostUsd(model, promptTokens, completionTokens) /
      // reservationCostUsd counts the repair retry; undo that doubling.
      2
  );
}

/** Credits the run could spend, repeats and grade-twice included. */
export function projectComparisonSpendCredits(
  input: ComparisonSpendProjectionInput,
): number {
  const [baseline, ...challengers] = input.contestants;
  if (!baseline) {
    return 0;
  }

  let usd = 0;
  for (const row of input.rows) {
    const outputTokens = GENERATION_MAX_TOKENS;
    const judgedPromptTokens =
      JUDGE_PROMPT_OVERHEAD_TOKENS +
      upperBoundTokens(row.input.prompt) +
      outputTokens;
    // A battle shows both responses.
    const battlePromptTokens = judgedPromptTokens + outputTokens;
    let perRepeat = 0;
    for (const contestant of input.contestants) {
      const promptTokens = upperBoundTokens(
        canonicalJson(buildGenerationMessages(row, contestant)),
      );
      perRepeat += callCreditsUsd(
        contestant.registryKey,
        promptTokens,
        outputTokens,
      );
      for (const judge of input.judgeRegistryKeys) {
        perRepeat += callCreditsUsd(
          judge,
          judgedPromptTokens,
          JUDGE_EXPECTED_COMPLETION_TOKENS,
        );
      }
    }
    for (const _challenger of challengers) {
      for (const judge of input.judgeRegistryKeys) {
        perRepeat +=
          2 *
          callCreditsUsd(
            judge,
            battlePromptTokens,
            JUDGE_EXPECTED_COMPLETION_TOKENS,
          );
      }
    }
    usd += perRepeat * input.repeats;
  }

  if (input.repeats > 1) {
    const regradeCalls =
      GRADE_TWICE_SAMPLE_SIZE * input.judgeRegistryKeys.length;
    const judge = input.judgeRegistryKeys[0];
    if (judge) {
      usd +=
        regradeCalls *
        callCreditsUsd(
          judge,
          JUDGE_PROMPT_OVERHEAD_TOKENS + GENERATION_MAX_TOKENS,
          JUDGE_EXPECTED_COMPLETION_TOKENS,
        );
    }
  }

  return usdToCredits(usd);
}
